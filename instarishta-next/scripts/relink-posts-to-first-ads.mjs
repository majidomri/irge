/**
 * Point the posts we have at the first ads in the feed.
 *
 *   node scripts/relink-posts-to-first-ads.mjs            # dry run
 *   node scripts/relink-posts-to-first-ads.mjs --commit
 *
 * A DEMO LINKAGE, not a correction. Frames were captured for an arbitrary
 * subset of the 500 ads, so the ads at the top of /profiles -- the ones anyone
 * actually looks at -- mostly have no image behind the Biodata button. This
 * reassigns the share slugs of the posts that DO exist to the first ads in
 * feed order, so the top of the list is populated.
 *
 * The consequence, stated plainly: a post's picture will no longer describe
 * the ad it is attached to. IR-1767's popup will show some other ad's biodata.
 * That is fine for judging the look and wrong for anything else, so re-run the
 * real capture and publish before this data means anything.
 *
 * Renaming happens in two passes because `slug` is the primary key: everything
 * moves to a temporary name first, so reassigning a slug that another row
 * currently holds cannot collide.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); if (i === -1) return false; args.splice(i, 1); return true; };
const opt = (n, d) => { const i = args.indexOf(n); if (i === -1) return d; const v = args[i + 1]; args.splice(i, 2); return v ?? d; };

const COMMIT = flag('--commit');
const ADS = path.resolve(opt('--ads', '../jsdata.json'));

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

async function main() {
  const ads = JSON.parse(readFileSync(ADS, 'utf8'));

  // Every post slug of the form IR-<n> where n is four digits or more: those
  // are the imported ads. The show's own six are IR-001..IR-006 and stay.
  const { data: rows, error } = await db
    .from('ir_nano_ids')
    .select('slug, entity_id')
    .eq('entity_type', 'post');
  if (error) throw new Error(error.message);

  const adPosts = (rows ?? []).filter((r) => /^IR-\d{4,}$/.test(r.slug));
  const targets = ads.slice(0, adPosts.length).map((a) => `IR-${a.id}`);

  console.log(COMMIT ? 'RELINKING' : 'DRY RUN — nothing will be written');
  console.log(`posts available : ${adPosts.length}`);
  console.log(`first ads in feed: ${targets[0]} … ${targets[targets.length - 1]}\n`);

  if (!COMMIT) {
    adPosts.slice(0, 5).forEach((p, i) => console.log(`  ${p.slug}  ->  ${targets[i]}`));
    console.log(`  … ${adPosts.length} in total`);
    console.log('\nRe-run with --commit to write.');
    return;
  }

  // Pass one: out of the way.
  for (const p of adPosts) {
    const { error: e } = await db
      .from('ir_nano_ids')
      .update({ slug: `tmp-${p.entity_id}` })
      .eq('slug', p.slug);
    if (e) throw new Error(`${p.slug} -> tmp: ${e.message}`);
  }

  // Pass two: onto the first ads.
  let done = 0;
  for (const [i, p] of adPosts.entries()) {
    const { error: e } = await db
      .from('ir_nano_ids')
      .update({ slug: targets[i] })
      .eq('slug', `tmp-${p.entity_id}`);
    if (e) throw new Error(`tmp -> ${targets[i]}: ${e.message}`);
    done++;
  }

  console.log(`relinked ${done} post(s) to the first ${done} ads`);
}

main().catch((err) => { console.error(`\n${err.message}`); process.exit(1); });
