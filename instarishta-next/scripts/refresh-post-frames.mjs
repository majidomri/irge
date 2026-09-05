/**
 * Point already-published posts at freshly captured frames.
 *
 *   node scripts/refresh-post-frames.mjs --frames ../../Downloads/rs/.frames
 *   node scripts/refresh-post-frames.mjs --frames <dir> --commit
 *
 * DRY RUN BY DEFAULT. This writes to the live site, so the default has to be
 * the harmless one.
 *
 * `publish-posts.mjs` publishes; it deliberately skips anything whose IR id
 * already exists, which is what makes it safe to re-run. So after a change to
 * the frame design there was no way to get the new pixels onto the posts that
 * already carry the old ones -- the source changed, the capture changed, and
 * the site went on serving what it had. This is that missing step.
 *
 * It only ever updates `image` and `images`. Titles, captions, facets, likes,
 * views, comments and the share slug all stay exactly as they are: this is a
 * re-shoot of the same profile, not a new post.
 *
 * Objects are named by the SHA-256 of their bytes, as everywhere else here,
 * so a frame that did not actually change re-uploads to the same key and the
 * post keeps the URL it had -- and a post whose every frame is unchanged is
 * reported as such and left alone. Nothing is deleted: the old objects stay
 * where they are, still reachable from any story or share card built on them.
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
const BUCKET = opt('--bucket', 'ir-media');
const ONLY = args.filter((a) => !a.startsWith('-'));   // optional IR ids

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
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
const objectName = (bytes, ext) => {
  const hex = createHash('sha256').update(bytes).digest('hex');
  return `stories/${hex.slice(0, 2)}/${hex}.${ext}`;
};

async function manifests() {
  const dirs = await readdir(FRAMES, { withFileTypes: true }).catch(() => {
    throw new Error(`No frames at ${FRAMES}. Run the capture first.`);
  });
  const out = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const file = path.join(FRAMES, d.name, 'frames.json');
    if (!existsSync(file)) continue;
    const m = JSON.parse(await readFile(file, 'utf8'));
    if (ONLY.length && !ONLY.includes(m.irId)) continue;
    out.push({ dir: path.join(FRAMES, d.name), ...m });
  }
  return out.sort((a, b) => String(a.irId).localeCompare(String(b.irId)));
}

async function main() {
  const sets = await manifests();
  if (!sets.length) { console.error(`No frames.json under ${FRAMES}.`); process.exit(1); }

  console.log(COMMIT ? 'REFRESHING' : 'DRY RUN — nothing will be uploaded or written');
  console.log(`frames : ${FRAMES}`);
  console.log(`sets   : ${sets.length}\n`);

  let updated = 0, unchanged = 0, missing = 0;

  for (const set of sets) {
    const { data: nano, error } = await db
      .from('ir_nano_ids')
      .select('entity_id')
      .eq('entity_type', 'post')
      .eq('slug', set.irId)
      .maybeSingle();
    if (error) throw new Error(`${set.irId}: ${error.message}`);

    if (!nano) { missing++; continue; }               // captured but never published

    const { data: post, error: postErr } = await db
      .from('ir_posts')
      .select('id, image, images')
      .eq('id', nano.entity_id)
      .maybeSingle();
    if (postErr) throw new Error(`${set.irId}: ${postErr.message}`);
    if (!post) { missing++; continue; }

    // Hash first, so an unchanged frame is never uploaded and never counted.
    const files = [...set.files].sort((a, b) => a.n - b.n);
    const planned = [];
    for (const f of files) {
      const bytes = await readFile(path.join(set.dir, f.file));
      const ext = path.extname(f.file).slice(1).toLowerCase();
      const key = objectName(bytes, ext);
      planned.push({ bytes, ext, key, url: `${URL_}/storage/v1/object/public/${BUCKET}/${key}` });
    }

    const nextUrls = planned.map((x) => x.url);
    const sameAsNow =
      post.image === nextUrls[0] &&
      JSON.stringify(post.images ?? []) === JSON.stringify(nextUrls);

    if (sameAsNow) {
      unchanged++;
      continue;
    }

    if (!COMMIT) {
      console.log(`${set.irId}  ${files.length} frame(s) would be re-uploaded and linked`);
      updated++;
      continue;
    }

    for (const x of planned) {
      const up = await db.storage
        .from(BUCKET)
        .upload(x.key, x.bytes, { contentType: MIME[x.ext] ?? 'image/jpeg', upsert: true });
      if (up.error) throw new Error(`Upload failed for ${set.irId}: ${up.error.message}`);
    }

    const { error: updErr } = await db
      .from('ir_posts')
      .update({ image: nextUrls[0], images: nextUrls })
      .eq('id', post.id);
    if (updErr) throw new Error(`${set.irId}: ${updErr.message}`);

    updated++;
    if (updated % 20 === 0) console.log(`  ${updated} refreshed…`);
  }

  console.log(`\n${COMMIT ? 'refreshed' : 'would refresh'} ${updated}`);
  console.log(`already current      ${unchanged}`);
  console.log(`captured, unpublished ${missing}`);
  if (!COMMIT) console.log('\nRe-run with --commit to write.');
}

main().catch((err) => { console.error(`\n${err.message}`); process.exit(1); });
