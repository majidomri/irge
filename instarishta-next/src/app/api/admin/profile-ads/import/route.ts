/**
 * POST /api/admin/profile-ads/import
 *
 * Load listings into ir_profile_ads — the one-time move off GitHub, and the
 * bulk path afterwards.
 *
 * Body (all optional):
 *   { url?: string, profiles?: Profile[], prune?: boolean }
 *
 *   • `profiles` — an array to import directly, so a corrected file can be
 *     pasted in without publishing it anywhere first.
 *   • `url`      — fetch the array from there instead. Defaults to the
 *     jsdata.json this site used to read on every request.
 *   • `prune`    — delete rows whose id is absent from the payload. OFF by
 *     default: an import that half-succeeded upstream would otherwise empty
 *     the catalogue, and "some listings are stale" is a far better failure
 *     than "the site has no listings".
 *
 * The facet columns are GENERATED (migration 032), so nothing here derives
 * anything — a row written by this route and a row typed into /nizam get the
 * same education, marital, location and community tags from the same SQL.
 *
 * Admin-gated by withAdmin (session + ADMIN_EMAILS). Node runtime.
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';

/**
 * Where the catalogue used to live. Kept as the default so the migration is
 * one button press, and so re-importing after an upstream edit stays possible
 * while the GitHub file is still the place listings are maintained.
 */
const DEFAULT_SOURCE = 'https://raw.githubusercontent.com/majidomri/irge/main/jsdata.json';

/** Only these hosts may be fetched — `url` is admin-supplied, but SSRF from a
 *  mistyped or pasted URL is still worth closing, and the internal metadata
 *  endpoints a Vercel function can reach are not something an import needs. */
const ALLOWED_SOURCE_HOSTS = ['raw.githubusercontent.com', 'gist.githubusercontent.com'];

interface IncomingAd {
  id?: number | string;
  title?: string;
  body?: string;
  gender?: string;
  phone?: string;
  whatsapp?: string;
  age?: number | string;
  education?: string;
  priority?: string;
  date?: string;
  audio_url?: string;
  instagram_post_id?: string;
}

interface AdRow {
  id: number;
  seq: number;
  title: string;
  body: string;
  gender: string;
  phone: string | null;
  whatsapp: string | null;
  age_declared: number | null;
  education: string | null;
  priority: string | null;
  posted_at: string | null;
  audio_url: string | null;
  instagram_post_id: string | null;
}

const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : null;
};

/** Rows Postgres would reject are dropped here with a reason, rather than
 *  failing the whole batch on one bad record in a 500-item file. */
function toRow(raw: IncomingAd, index: number): { row: AdRow } | { skip: string } {
  const id = num(raw.id);
  if (id === null) return { skip: `#${index + 1}: missing or non-numeric id` };

  const title = str(raw.title);
  const body  = str(raw.body);
  if (!body) return { skip: `id ${id}: empty body` };

  // The CHECK constraint allows exactly these two. Anything else is a data
  // problem worth surfacing, not something to coerce to a default.
  const gender = String(raw.gender ?? '').trim().toLowerCase();
  if (gender !== 'male' && gender !== 'female') {
    return { skip: `id ${id}: gender was ${JSON.stringify(raw.gender)}` };
  }

  const posted = str(raw.date);
  const when   = posted ? new Date(posted) : null;

  return {
    row: {
      id,
      // Position in the file IS the catalogue order, and `_num` counts it.
      seq: index + 1,
      title: title ?? '',
      body,
      gender,
      phone:    str(raw.phone),
      whatsapp: str(raw.whatsapp),
      age_declared: num(raw.age),
      education: str(raw.education),
      priority:  str(raw.priority),
      posted_at: when && !Number.isNaN(when.getTime()) ? when.toISOString() : null,
      audio_url: str(raw.audio_url),
      instagram_post_id: str(raw.instagram_post_id),
    },
  };
}

export const POST = withAdmin(async (_req, { body, db }) => {
  const prune = body.prune === true;

  let incoming: unknown;

  if (Array.isArray(body.profiles)) {
    incoming = body.profiles;
  } else {
    const url = String(body.url ?? '').trim() || DEFAULT_SOURCE;

    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      return NextResponse.json({ error: 'url is not a valid URL' }, { status: 400 });
    }
    if (!ALLOWED_SOURCE_HOSTS.includes(host)) {
      return NextResponse.json(
        { error: `Refusing to fetch from ${host}. Allowed: ${ALLOWED_SOURCE_HOSTS.join(', ')}` },
        { status: 400 },
      );
    }

    try {
      // Cache-busted: the GitHub CDN is one of the three caches this whole
      // change exists to get out from behind, and an import that silently
      // loaded a five-minute-old copy would be worse than one that failed.
      const res = await fetch(`${url}?t=${Date.now()}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        return NextResponse.json({ error: `Source responded ${res.status}` }, { status: 502 });
      }
      incoming = await res.json();
    } catch (e) {
      const err = e as Error;
      return NextResponse.json(
        { error: err.name === 'TimeoutError' ? 'Source did not respond within 30s' : `Could not fetch source: ${err.message}` },
        { status: 502 },
      );
    }
  }

  if (!Array.isArray(incoming)) {
    return NextResponse.json({ error: 'Payload was not an array' }, { status: 400 });
  }
  // An empty catalogue is not a plausible import, and with prune on it would
  // delete everything. Same reasoning as the old worker loader.
  if (incoming.length === 0) {
    return NextResponse.json({ error: 'Payload was empty — refusing to import' }, { status: 400 });
  }

  const rows: AdRow[] = [];
  const skipped: string[] = [];
  const seen = new Set<number>();

  (incoming as IncomingAd[]).forEach((raw, i) => {
    const out = toRow(raw, i);
    if ('skip' in out) { skipped.push(out.skip); return; }
    // A duplicate id would make the upsert non-deterministic about which copy
    // wins, so the first occurrence keeps its position and the rest are named.
    if (seen.has(out.row.id)) { skipped.push(`id ${out.row.id}: duplicate, kept the first`); return; }
    seen.add(out.row.id);
    rows.push(out.row);
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No importable rows', skipped }, { status: 400 });
  }

  // Chunked: 500 rows of Urdu text is comfortably over PostgREST's default
  // request ceiling as a single statement, and a partial failure mid-file is
  // easier to reason about in 200-row units.
  const CHUNK = 200;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await db.from('ir_profile_ads').upsert(slice, { onConflict: 'id' });
    if (error) {
      return NextResponse.json(
        { error: `Upsert failed at row ${i + 1}: ${error.message}`, upserted, skipped },
        { status: 400 },
      );
    }
    upserted += slice.length;
  }

  let pruned = 0;
  if (prune) {
    const { data, error } = await db
      .from('ir_profile_ads')
      .delete()
      .not('id', 'in', `(${[...seen].join(',')})`)
      .select('id');
    if (error) {
      return NextResponse.json(
        { error: `Imported, but prune failed: ${error.message}`, upserted, skipped },
        { status: 400 },
      );
    }
    pruned = data?.length ?? 0;
  }

  return NextResponse.json({ ok: true, upserted, pruned, skipped, importedAt: new Date().toISOString() });
});
