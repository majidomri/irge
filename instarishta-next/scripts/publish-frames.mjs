/**
 * Publish the show's captured frames as stories.
 *
 *   node scripts/publish-frames.mjs --frames ../../../Downloads/rs/.frames
 *   node scripts/publish-frames.mjs --frames <dir> --channel live-show --commit
 *
 * DRY RUN BY DEFAULT. Without `--commit` nothing is uploaded and no row is
 * written; it prints exactly what it would do and exits. This writes to the
 * live site, so the default has to be the harmless one.
 *
 * Why this talks to Supabase directly instead of POSTing to
 * /api/admin/uploads: that route is wrapped in `withAdmin`, which gates on a
 * better-auth session cookie plus the ADMIN_EMAILS allowlist. A script has no
 * session and should not be handed a password to get one. The service-role
 * key is already in .env.local for exactly this kind of local admin job, and
 * it is what withAdmin hands its own handlers once past the gate.
 *
 * Idempotent twice over: objects are named by the SHA-256 of their bytes, so
 * re-uploading the same frame lands on the same object rather than a copy;
 * and a story whose image URL is already in the channel is not inserted
 * again. Re-running after a re-capture publishes only what actually changed.
 */
import { createClient } from '@supabase/supabase-js';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v ?? fallback;
};

const COMMIT = flag('--commit');
const FRAMES = path.resolve(opt('--frames', '.frames'));
const CHANNEL = opt('--channel', null);
const BUCKET = process.env.SUPABASE_UPLOAD_BUCKET || 'uploads';

/** Node does not read .env.local on its own the way `next` does. */
function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const v = m[2].replace(/^["']|["']$/g, '');
    if (!process.env[m[1]]) process.env[m[1]] = v;
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

/** Same content-addressing the upload route uses, under its own prefix. */
function objectName(bytes, ext) {
  const hex = createHash('sha256').update(bytes).digest('hex');
  return `stories/${hex.slice(0, 2)}/${hex}.${ext}`;
}

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

async function pickChannel() {
  const { data, error } = await db
    .from('ir_channels')
    .select('id, name, slug')
    .order('name');
  if (error) throw new Error(`Cannot read channels: ${error.message}`);
  if (!data?.length) throw new Error('No channels exist. Create one in /nizam first.');

  if (!CHANNEL) {
    console.error('\nPick a channel with --channel <slug|id>:');
    for (const c of data) console.error(`  ${c.slug ?? '(no slug)'}  ${c.name}  [${c.id}]`);
    process.exit(1);
  }
  const found = data.find((c) => c.slug === CHANNEL || c.id === CHANNEL);
  if (!found) throw new Error(`No channel matches "${CHANNEL}".`);
  return found;
}

/** Everything already in this channel, so a re-run adds nothing twice. */
async function existingImages(channelId) {
  const { data, error } = await db
    .from('ir_stories')
    .select('image')
    .eq('channel_id', channelId)
    .limit(2000);
  if (error) throw new Error(`Cannot read stories: ${error.message}`);
  return new Set((data ?? []).map((r) => r.image));
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
  const seen = await existingImages(channel.id);
  const sets = await manifests();

  if (!sets.length) {
    console.error(`No frames.json under ${FRAMES}.`);
    process.exit(1);
  }

  console.log(`${COMMIT ? 'PUBLISHING' : 'DRY RUN — nothing will be written'}`);
  console.log(`channel : ${channel.name} (${channel.slug ?? channel.id})`);
  console.log(`frames  : ${FRAMES}`);
  console.log(`bucket  : ${BUCKET}\n`);

  let planned = 0;
  let skipped = 0;
  let bytesTotal = 0;

  for (const set of sets) {
    console.log(`${set.irId}`);
    for (const f of set.files) {
      const bytes = await readFile(path.join(set.dir, f.file));
      const ext = path.extname(f.file).slice(1).toLowerCase();
      const key = objectName(bytes, ext);
      const publicUrl = `${URL_}/storage/v1/object/public/${BUCKET}/${key}`;
      const kb = Math.round(bytes.length / 1024);
      bytesTotal += bytes.length;

      if (seen.has(publicUrl)) {
        console.log(`  · ${f.file.padEnd(14)} ${String(kb).padStart(4)} KB  already published`);
        skipped++;
        continue;
      }

      // No caption. The live `ir_stories` is (id, channel_id, image,
      // created_at, user_id, likes) -- there is no caption column, whatever
      // /api/admin/stories thinks: that route inserts and selects one, so it
      // fails against this schema today. The IR id is drawn into the frame
      // itself anyway, so nothing is lost by leaving it out.

      if (!COMMIT) {
        console.log(`  + ${f.file.padEnd(14)} ${String(kb).padStart(4)} KB  -> ${key}`);
        planned++;
        continue;
      }

      const up = await db.storage
        .from(BUCKET)
        .upload(key, bytes, { contentType: MIME[ext] ?? 'image/jpeg', upsert: true });
      if (up.error) throw new Error(`Upload failed for ${f.file}: ${up.error.message}`);

      const ins = await db
        .from('ir_stories')
        .insert({ channel_id: channel.id, image: publicUrl })
        .select('id')
        .single();
      if (ins.error) throw new Error(`Insert failed for ${f.file}: ${ins.error.message}`);

      console.log(`  + ${f.file.padEnd(14)} ${String(kb).padStart(4)} KB  -> ${ins.data.id}`);
      planned++;
    }
  }

  console.log(
    `\n${COMMIT ? 'published' : 'would publish'} ${planned} frame(s)` +
      `${skipped ? `, ${skipped} already there` : ''}` +
      `, ${Math.round(bytesTotal / 1024)} KB read`,
  );
  if (!COMMIT && planned) console.log('Re-run with --commit to write to the live site.');
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
