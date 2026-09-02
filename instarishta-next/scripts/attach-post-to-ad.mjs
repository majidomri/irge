/**
 * Attach an existing channel post to an ad, so the ad's popup opens that post.
 *
 *   node scripts/attach-post-to-ad.mjs --post IR-004 --ad IR-1768
 *   node scripts/attach-post-to-ad.mjs --post IR-004 --ad IR-1768 --commit
 *
 * DRY RUN BY DEFAULT.
 *
 * A demo wiring. The popup on /profiles resolves its image by the ad's id, so
 * pointing a post's share slug at that id is what makes the ad open that post.
 * Whatever slug the ad currently holds is parked under `tmp-…` rather than
 * deleted, so the swap is reversible.
 *
 * Note the cost: the post stops being reachable at its old slug. /p/IR-004
 * becomes /p/IR-1768. Fine while this is a demo, wrong once anyone has shared
 * the old link.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); if (i === -1) return false; args.splice(i, 1); return true; };
const opt = (n, d) => { const i = args.indexOf(n); if (i === -1) return d; const v = args[i + 1]; args.splice(i, 2); return v ?? d; };

const COMMIT = flag('--commit');
const POST = opt('--post', null);
const AD = opt('--ad', null);

if (!POST || !AD) {
  console.error('Usage: --post <existing slug> --ad <IR-adId> [--commit]');
  process.exit(1);
}

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv(path.join(process.cwd(), '.env.local'));

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function describe(slug) {
  const { data: nano } = await db
    .from('ir_nano_ids').select('entity_id').eq('slug', slug).maybeSingle();
  if (!nano) return null;
  const { data: post } = await db
    .from('ir_posts').select('title, images').eq('id', nano.entity_id).maybeSingle();
  return { entityId: nano.entity_id, title: post?.title ?? '(no title)', frames: post?.images?.length ?? 0 };
}

async function main() {
  const source = await describe(POST);
  if (!source) throw new Error(`No post at ${POST}.`);
  const occupant = await describe(AD);

  console.log(COMMIT ? 'ATTACHING' : 'DRY RUN — nothing will be written');
  console.log(`post  : ${POST} — ${source.title} (${source.frames} frames)`);
  console.log(`ad    : ${AD}${occupant ? ` — currently ${occupant.title}` : ' — free'}`);

  if (!COMMIT) {
    console.log('\nRe-run with --commit to write.');
    return;
  }

  if (occupant) {
    const { error } = await db
      .from('ir_nano_ids').update({ slug: `tmp-${occupant.entityId}` }).eq('slug', AD);
    if (error) throw new Error(`parking ${AD}: ${error.message}`);
  }

  const { error } = await db.from('ir_nano_ids').update({ slug: AD }).eq('slug', POST);
  if (error) throw new Error(`attaching ${POST}: ${error.message}`);

  const now = await describe(AD);
  console.log(`\n${AD} now opens: ${now.title} (${now.frames} frames)`);
}

main().catch((err) => { console.error(`\n${err.message}`); process.exit(1); });
