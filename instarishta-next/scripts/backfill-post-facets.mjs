/**
 * Recompute the facets on published ad posts.
 *
 *   npx tsx scripts/backfill-post-facets.mjs
 *   npx tsx scripts/backfill-post-facets.mjs --commit
 *
 * DRY RUN BY DEFAULT.
 *
 * The posts were published before `city` and `country` existed (025), so their
 * place is missing even though the ad said it. This recomputes every facet
 * from the ad itself and writes it back, matching a post to its ad by the
 * share slug -- IR-<ad id> -- which is how they were published.
 *
 * Images are not touched. The facets live in columns beside the picture, so a
 * place can be filled in without re-shooting or re-uploading a single frame.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { adToValues } from '../src/lib/biodata/from-ad.ts';

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
  const byIr = new Map(ads.map((a) => [`IR-${a.id}`, a]));

  const { data: slugs, error } = await db
    .from('ir_nano_ids')
    .select('slug, entity_id')
    .eq('entity_type', 'post');
  if (error) throw new Error(error.message);

  const targets = (slugs ?? []).filter((r) => byIr.has(r.slug));

  console.log(COMMIT ? 'BACKFILLING' : 'DRY RUN — nothing will be written');
  console.log(`posts matched to an ad: ${targets.length}\n`);

  let written = 0;
  let withPlace = 0;

  for (const row of targets) {
    const v = adToValues(byIr.get(row.slug));
    const facets = {
      gender:    v.gender ?? null,
      age:       typeof v.age === 'number' ? v.age : null,
      community: v.community ?? null,
      education: v.highestQualification ?? null,
      marital:   v.maritalStatus ?? null,
      state:     v.state ?? null,
      city:      v.city ?? null,
      country:   v.country ?? null,
    };
    if (facets.city || facets.country || facets.state) withPlace++;

    if (!COMMIT) {
      if (written < 6) {
        const place = [facets.city, facets.state, facets.country].filter(Boolean).join(' / ') || '—';
        console.log(`  ${row.slug}  place: ${place.padEnd(18)} edu: ${facets.education ?? '—'}`);
      }
      written++;
      continue;
    }

    const { error: e } = await db.from('ir_posts').update(facets).eq('id', row.entity_id);
    if (e) throw new Error(`${row.slug}: ${e.message}`);
    written++;
    if (written % 25 === 0) console.log(`  ${written} updated…`);
  }

  console.log(`\n${COMMIT ? 'updated' : 'would update'} ${written} post(s); ${withPlace} carry a place`);
  if (!COMMIT) console.log('Re-run with --commit to write.');
}

main().catch((err) => { console.error(`\n${err.message}`); process.exit(1); });
