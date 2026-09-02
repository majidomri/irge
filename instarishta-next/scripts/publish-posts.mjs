/**
 * Publish the show's captured frames as carousel posts.
 *
 *   node scripts/publish-posts.mjs --frames <dir> --channel instarishta
 *   node scripts/publish-posts.mjs --frames <dir> --channel instarishta --commit
 *
 * DRY RUN BY DEFAULT. This writes to the live site, so the default has to be
 * the harmless one.
 *
 * One post per profile, not one per frame: `ir_posts.image` carries the
 * opening frame as the cover and `ir_posts.images` carries the whole set, so
 * the biodata reads as a single carousel the way it does on air. Stories are
 * the other surface and stay as they are -- a story is one frame with a
 * lifetime, a post is the whole biodata kept.
 *
 * The slug is the IR id.
 *
 * `ir_nano_ids.slug` is a plain text primary key, so it can be chosen rather
 * than generated, and choosing it is what repairs the show's call to action:
 * the end card's QR encodes instarishta.me/p/<IR-ID>, which resolves slugs
 * through that table. Registering the post under IR-004 makes the code on
 * screen and the code in the URL the same string, and a scan lands on the
 * biodata the viewer was just watching. Nothing in the broadcast has to
 * change, and the id a viewer reads aloud is one they can also type.
 *
 * Idempotent: a profile whose IR id already has a slug is left alone.
 */
import { createClient } from '@supabase/supabase-js';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); if (i === -1) return false; args.splice(i, 1); return true; };
const opt = (n, d) => { const i = args.indexOf(n); if (i === -1) return d; const v = args[i + 1]; args.splice(i, 2); return v ?? d; };

const COMMIT = flag('--commit');
const FRAMES = path.resolve(opt('--frames', '.frames'));
const CHANNEL = opt('--channel', null);
const BUCKET = process.env.SUPABASE_UPLOAD_BUCKET || 'uploads';

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv(path.join(process.cwd(), '.env.local'));

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local).');
  process.exit(1);
}
const db = createClient(URL_, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Same content-addressing the upload route uses, so a re-upload is free. */
const objectName = (bytes, ext) => {
  const hex = createHash('sha256').update(bytes).digest('hex');
  return `stories/${hex.slice(0, 2)}/${hex}.${ext}`;
};

async function pickChannel() {
  const { data, error } = await db.from('ir_channels').select('id, name, slug').order('name');
  if (error) throw new Error(`Cannot read channels: ${error.message}`);
  if (!CHANNEL) {
    console.error('\nPick a channel with --channel <slug|id>:');
    for (const c of data ?? []) console.error(`  ${c.slug ?? '(no slug)'}  ${c.name}  [${c.id}]`);
    process.exit(1);
  }
  const found = (data ?? []).find((c) => c.slug === CHANNEL || c.id === CHANNEL);
  if (!found) throw new Error(`No channel matches "${CHANNEL}".`);
  return found;
}

/**
 * Rename a post's share slug to its IR id.
 *
 * Inserting the slug ourselves does not work: a trigger already writes an
 * ir_nano_ids row when a post is inserted, and (entity_type, entity_id) is
 * unique -- so a second row for the same post is rejected. The row we want
 * already exists with a generated slug; the job is to rename it, which is
 * allowed because nothing references the slug by foreign key (comments and
 * view counts hang off entity_id).
 */
async function claimSlug(postId, irId) {
  const { data: nano, error } = await db
    .from('ir_nano_ids')
    .select('slug')
    .eq('entity_type', 'post')
    .eq('entity_id', postId)
    .maybeSingle();
  if (error) throw new Error(`Cannot read slug for ${irId}: ${error.message}`);
  if (!nano) throw new Error(`No slug row was created for ${irId}.`);
  if (nano.slug === irId) return;

  const { error: renameErr } = await db
    .from('ir_nano_ids')
    .update({ slug: irId })
    .eq('entity_type', 'post')
    .eq('entity_id', postId);
  if (renameErr) throw new Error(`Slug ${irId} failed: ${renameErr.message}`);
}

async function manifests() {
  const dirs = await readdir(FRAMES, { withFileTypes: true }).catch(() => {
    throw new Error(`No frames at ${FRAMES}. Run the capture first.`);
  });
  const out = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const file = path.join(FRAMES, d.name, 'frames.json');
    if (!existsSync(file)) continue;
    out.push({ dir: path.join(FRAMES, d.name), ...JSON.parse(await readFile(file, 'utf8')) });
  }
  return out.sort((a, b) => String(a.irId).localeCompare(String(b.irId)));
}

async function main() {
  const channel = await pickChannel();
  const sets = await manifests();
  if (!sets.length) {
    console.error(`No frames.json under ${FRAMES}.`);
    process.exit(1);
  }

  console.log(COMMIT ? 'PUBLISHING' : 'DRY RUN — nothing will be written');
  console.log(`channel : ${channel.name} (${channel.slug ?? channel.id})`);
  console.log(`frames  : ${FRAMES}\n`);

  let made = 0;
  let skipped = 0;

  for (const set of sets) {
    // The IR id is the slug, so its presence is the record of publication.
    const { data: taken } = await db
      .from('ir_nano_ids')
      .select('slug, entity_type')
      .eq('slug', set.irId)
      .maybeSingle();

    if (taken) {
      console.log(`${set.irId}  already published (/p/${set.irId})`);
      skipped++;
      continue;
    }

    const title = set.name ? `${set.name} · ${set.irId}` : set.irId;

    // A post can exist while its slug is still the generated one: the post
    // insert and the rename are two statements, and a run interrupted between
    // them leaves exactly that. Repair it rather than publishing a duplicate.
    const { data: orphan } = await db
      .from('ir_posts')
      .select('id')
      .eq('channel_id', channel.id)
      .eq('title', title)
      .maybeSingle();

    if (orphan) {
      if (COMMIT) {
        await claimSlug(orphan.id, set.irId);
        console.log(`${set.irId}  repaired slug -> /p/${set.irId}`);
      } else {
        console.log(`${set.irId}  exists with a generated slug — would rename to /p/${set.irId}`);
      }
      made++;
      continue;
    }
    const caption = set.headline || null;

    if (!COMMIT) {
      console.log(`${set.irId}  ${set.files.length} frame(s) -> /p/${set.irId}`);
      console.log(`         title  : ${title}`);
      if (caption) console.log(`         caption: ${caption}`);
      console.log(`         facets : ${JSON.stringify(set.facets ?? {})}`);
      made++;
      continue;
    }

    // Upload every frame, collecting the carousel in show order.
    const images = [];
    for (const f of [...set.files].sort((a, b) => a.n - b.n)) {
      const bytes = await readFile(path.join(set.dir, f.file));
      const ext = path.extname(f.file).slice(1).toLowerCase();
      const key = objectName(bytes, ext);
      const up = await db.storage
        .from(BUCKET)
        .upload(key, bytes, { contentType: MIME[ext] ?? 'image/jpeg', upsert: true });
      if (up.error) throw new Error(`Upload failed for ${set.irId}/${f.file}: ${up.error.message}`);
      images.push(`${URL_}/storage/v1/object/public/${BUCKET}/${key}`);
    }

    const { data: post, error: postErr } = await db
      .from('ir_posts')
      .insert({
        channel_id: channel.id,
        title,
        caption,
        image: images[0],   // cover: the opening frame
        images,             // the carousel, in the order the show plays them
        // Facets (migration 024). A picture cannot be filtered, so what the
        // biodata knew at capture time travels beside the pixels and the feed
        // can offer the same controls /profiles does. Absent stays NULL --
        // "cannot answer", not "no".
        gender:    set.facets?.gender    ?? null,
        age:       set.facets?.age       ?? null,
        community: set.facets?.community ?? null,
        education: set.facets?.education ?? null,
        marital:   set.facets?.marital   ?? null,
        state:     set.facets?.state     ?? null,
        is_urgent: set.facets?.urgent === true,
        // Generated frames, so we know what is on them: no contact details
        // ever reach one, unlike the WhatsApp imports this flag was added for.
        needs_redaction: false,
      })
      .select('id')
      .single();
    if (postErr) throw new Error(`Insert failed for ${set.irId}: ${postErr.message}`);

    await claimSlug(post.id, set.irId);

    console.log(`${set.irId}  ${images.length} frame(s) -> /p/${set.irId}  [${post.id}]`);
    made++;
  }

  console.log(
    `\n${COMMIT ? 'published' : 'would publish'} ${made} post(s)` +
      `${skipped ? `, ${skipped} already there` : ''}`,
  );
  if (!COMMIT && made) console.log('Re-run with --commit to write to the live site.');
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
