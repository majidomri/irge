/**
 * POST /api/admin/posts/import — batched, dedup-gated bulk insert into ir_posts.
 *
 * The WhatsApp importer flushes a queue of accepted items every ~20 taps
 * rather than writing one row per tap, so the admin's thumb never waits on
 * the network and closing the tab mid-run loses at most one batch.
 *
 * Dedup runs here as well as in the browser, and that is deliberate: the
 * client only knows about the files in the folder it is currently chewing
 * through, while this route compares against everything already in the
 * channel from previous runs. A biodata imported last week must not come
 * back as a fresh post this week.
 *
 * Two fingerprints, matching migration 019:
 *   - text_hash: exact match, enforced by a partial unique index. We check it
 *     up front anyway so a duplicate reports as `duplicate` rather than
 *     surfacing as an insert error.
 *   - phash: near-duplicate, so it needs a Hamming scan the database can't do
 *     with a plain index. Channels hold thousands of posts, not millions, and
 *     we read a single BIGINT column, so pulling the fingerprints and
 *     comparing in memory is fine at this size.
 *
 * Node runtime.
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';
import { ensureProfile } from '@/lib/credits';

export const runtime = 'nodejs';

const COLS = 'id, channel_id, user_id, title, caption, image, needs_redaction, created_at';

/** Keep in sync with PHASH_THRESHOLD in lib/phash.ts. */
const PHASH_THRESHOLD = 6;

/** Cap per request — matches the client's flush size with headroom. */
const MAX_ITEMS = 50;

// tsconfig targets ES2017, which bars BigInt literals (1n).
const ONE = BigInt(1);

function hamming(a: bigint, b: bigint): number {
  let x = BigInt.asUintN(64, a ^ b);
  let n = 0;
  while (x) { x &= x - ONE; n++; }
  return n;
}

interface ImportItem {
  image?:           unknown;
  caption?:         unknown;
  title?:           unknown;
  phash?:           unknown;
  text_hash?:       unknown;
  /** Private triage state — never rendered publicly. See migration 020. */
  needs_redaction?: unknown;
  /** Client-side id, echoed back so the browser can reconcile its queue. */
  ref?:       unknown;
}

export const POST = withAdmin(async (_req, { body, db }) => {
  const channelId  = String(body.channel_id ?? '').trim();
  const ownerEmail = String(body.owner_email ?? '').trim().toLowerCase() || null;
  const rawItems   = Array.isArray(body.items) ? (body.items as ImportItem[]) : null;

  if (!channelId) return NextResponse.json({ error: 'channel_id required' }, { status: 400 });
  if (!rawItems || rawItems.length === 0) {
    return NextResponse.json({ error: 'items required' }, { status: 400 });
  }
  if (rawItems.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Too many items (max ${MAX_ITEMS})` }, { status: 400 });
  }
  if (ownerEmail && !ownerEmail.includes('@')) {
    return NextResponse.json({ error: 'Owner email looks invalid' }, { status: 400 });
  }

  // Normalise and drop anything with no publishable content, mirroring the
  // single-post route's "caption, image, or audio" rule.
  const items = rawItems.map((raw, i) => {
    const phashRaw = raw.phash;
    let phash: bigint | null = null;
    if (phashRaw !== null && phashRaw !== undefined && phashRaw !== '') {
      try { phash = BigInt.asIntN(64, BigInt(String(phashRaw))); } catch { phash = null; }
    }
    return {
      ref:             String(raw.ref ?? i),
      image:           String(raw.image   ?? '').trim() || null,
      caption:         String(raw.caption ?? '').trim() || null,
      title:           String(raw.title   ?? '').trim() || null,
      text_hash:       String(raw.text_hash ?? '').trim() || null,
      needs_redaction: raw.needs_redaction === true,
      phash,
    };
  });

  const userId = ownerEmail ? (await ensureProfile(db, ownerEmail, null)).id : null;

  // Existing fingerprints for this channel, fetched once for the whole batch.
  const { data: existing, error: readErr } = await db
    .from('ir_posts')
    .select('id, phash, text_hash')
    .eq('channel_id', channelId)
    .or('phash.not.is.null,text_hash.not.is.null');

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 400 });

  const seenText = new Map<string, string>();          // text_hash → existing post id
  const seenPhash: { id: string; phash: bigint }[] = [];
  for (const row of existing ?? []) {
    if (row.text_hash) seenText.set(row.text_hash, row.id);
    if (row.phash !== null && row.phash !== undefined) {
      seenPhash.push({ id: row.id, phash: BigInt.asIntN(64, BigInt(row.phash)) });
    }
  }

  const results: { ref: string; status: 'created' | 'duplicate' | 'skipped'; id?: string; duplicate_of?: string; reason?: string }[] = [];
  const toInsert: { ref: string; row: Record<string, unknown> }[] = [];

  for (const item of items) {
    if (!item.image && !item.caption) {
      results.push({ ref: item.ref, status: 'skipped', reason: 'no image or caption' });
      continue;
    }

    if (item.text_hash && seenText.has(item.text_hash)) {
      results.push({ ref: item.ref, status: 'duplicate', duplicate_of: seenText.get(item.text_hash) });
      continue;
    }

    if (item.phash !== null) {
      const near = seenPhash.find(e => hamming(e.phash, item.phash!) <= PHASH_THRESHOLD);
      if (near) {
        results.push({ ref: item.ref, status: 'duplicate', duplicate_of: near.id });
        continue;
      }
    }

    toInsert.push({
      ref: item.ref,
      row: {
        channel_id:      channelId,
        user_id:         userId,
        title:           item.title,
        caption:         item.caption,
        image:           item.image,
        needs_redaction: item.needs_redaction,
        phash:           item.phash === null ? null : item.phash.toString(),
        text_hash:       item.text_hash,
      },
    });

    // Fold each accepted item into the seen sets so duplicates *within this
    // batch* are caught too — the same biodata often arrives twice in one
    // folder, and neither fingerprint is in the database yet.
    if (item.text_hash) seenText.set(item.text_hash, '(pending)');
    if (item.phash !== null) seenPhash.push({ id: '(pending)', phash: item.phash });
  }

  if (toInsert.length) {
    const { data: inserted, error } = await db
      .from('ir_posts')
      .insert(toInsert.map(t => t.row))
      .select(COLS);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Supabase returns inserted rows in request order.
    (inserted ?? []).forEach((row, i) => {
      results.push({ ref: toInsert[i].ref, status: 'created', id: row.id });
    });
  }

  const created   = results.filter(r => r.status === 'created').length;
  const duplicate = results.filter(r => r.status === 'duplicate').length;

  return NextResponse.json({ results, created, duplicate });
});
