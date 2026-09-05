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
const ONLY = args.filter((a) => !a.startsWith('-'));   // optional IR ids

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv(path.join(process.cwd(), '.env.local'));

// The same bucket publish-posts.mjs writes to, and read AFTER the env file is
// loaded -- above it, SUPABASE_UPLOAD_BUCKET is not set yet and the default
// silently wins, which is how this first ran against a bucket that does not
// exist and failed with "Bucket not found".
const BUCKET = opt('--bucket', process.env.SUPABASE_UPLOAD_BUCKET || 'uploads');

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local).');
  process.exit(1);
}
const db = createClient(URL_, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

/**
 * One flaky moment should not cost a 78-post run.
 *
 * Every call here is a network call, and a dropped connection surfaces as a
 * bare `TypeError: fetch failed` from undici -- which killed the run on its
 * first post and left the rest untouched. Transient failures are retried with
 * a widening gap; a real error (a missing bucket, a rejected row) is not a
 * fetch failure and still stops the run on the spot.
 */
async function withRetry(what, fn, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const out = await fn();
      if (out?.error && /fetch failed|network|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(out.error.message ?? '')) {
        throw new Error(out.error.message);
      }
      return out;
    } catch (err) {
      const transient = /fetch failed|network|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket/i.test(String(err?.message ?? err));
      if (!transient || i === tries) throw err;
      const wait = 2000 * i;
      console.log(`  ${what}: ${String(err.message ?? err)} — retrying in ${wait / 1000}s (${i}/${tries - 1})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

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
    const { data: nano, error } = await withRetry(set.irId, () => db
      .from('ir_nano_ids')
      .select('entity_id')
      .eq('entity_type', 'post')
      .eq('slug', set.irId)
      .maybeSingle());
    if (error) throw new Error(`${set.irId}: ${error.message}`);

    /**
     * The slug is the usual handle, but not the only one.
     *
     * A post can carry this profile's frames under a different slug -- the
     * relink that pointed existing posts at ads left several that way -- and
     * then the frames it shows can never be refreshed, because the id they
     * were shot under matches nothing. publish-posts.mjs identifies exactly
     * this case by title, which is written as "<name> · <IR id>", so fall
     * back to the same lookup rather than skipping a post whose pixels are
     * demonstrably ours.
     */
    let post = null;
    if (nano) {
      const { data, error: postErr } = await withRetry(set.irId, () => db
        .from('ir_posts')
        .select('id, image, images')
        .eq('id', nano.entity_id)
        .maybeSingle());
      if (postErr) throw new Error(`${set.irId}: ${postErr.message}`);
      post = data;
    }

    /**
     * Only for a NAMED profile, and the restriction is the whole point.
     *
     * An ad has no name, so its title is the bare IR id -- and the relink
     * left posts whose title says one ad while their slug says another. A
     * title match there would push the wrong person's frames onto a post
     * that was deliberately pointed elsewhere, undoing a correct refresh
     * done by slug. "<name> · <IR id>" is specific enough to trust; "IR-2266"
     * is not.
     */
    if (!post && set.name) {
      const title = `${set.name} · ${set.irId}`;
      const { data, error: titleErr } = await withRetry(set.irId, () => db
        .from('ir_posts')
        .select('id, image, images')
        .eq('title', title)
        .maybeSingle());
      if (titleErr) throw new Error(`${set.irId}: ${titleErr.message}`);
      if (data) console.log(`${set.irId}  matched by title (its slug is someone else's)`);
      post = data;
    }

    if (!post) { missing++; continue; }               // captured but never published

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
      const up = await withRetry(`${set.irId} upload`, () => db.storage
        .from(BUCKET)
        .upload(x.key, x.bytes, { contentType: MIME[x.ext] ?? 'image/jpeg', upsert: true }));
      if (up.error) throw new Error(`Upload failed for ${set.irId}: ${up.error.message}`);
    }

    const { error: updErr } = await withRetry(`${set.irId} update`, () => db
      .from('ir_posts')
      .update({ image: nextUrls[0], images: nextUrls })
      .eq('id', post.id));
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
