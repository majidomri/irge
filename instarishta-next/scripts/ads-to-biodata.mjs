/**
 * Turn the instarishta.me rishta ads into biodatas in the show's model.
 *
 *   node scripts/ads-to-biodata.mjs                       # dry run, first 5
 *   node scripts/ads-to-biodata.mjs --limit 20
 *   node scripts/ads-to-biodata.mjs --limit 500 --commit
 *
 * DRY RUN BY DEFAULT: prints the mapped values and writes nothing.
 *
 * The ads are 500 rows of `jsdata.json`, each a single line of Urdu prose with
 * `age`, `gender`, `education`, `phone` and `priority` beside it. `body` holds
 * the rest -- height, sect, income, employment, visa, the traits sought -- as
 * running text with no labels at all.
 *
 * Nothing here parses that text. `src/lib/bio-extract.ts` already does, and
 * does it well: it is what fills the Card view of the biodata modal on
 * /profiles, and its regexes carry hard-won corrections (the `\b` bug that
 * missed the age on 489 of 500, "تعلیم یافتہ" as an adjective rather than a
 * qualification, "B.com" truncated to "B"). This script is only the mapping
 * from that flat {label, value} list onto registry keys, plus the POST.
 *
 * What it deliberately does NOT carry across: `phone` and `whatsapp`. Every ad
 * has both, and a number belongs behind the site's contact credits, not baked
 * into a frame that gets forwarded through WhatsApp groups.
 */
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { register } from 'node:module';

// bio-extract.ts is TypeScript; Next compiles it in the app, but a plain node
// script needs a loader. Registered lazily so the failure message is useful.
try {
  register('tsx/esm', pathToFileURL('./'));
} catch {
  console.error('Needs tsx: npx tsx scripts/ads-to-biodata.mjs …');
}

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); if (i === -1) return false; args.splice(i, 1); return true; };
const opt = (n, d) => { const i = args.indexOf(n); if (i === -1) return d; const v = args[i + 1]; args.splice(i, 2); return v ?? d; };

const COMMIT = flag('--commit');
const LIMIT = Number(opt('--limit', COMMIT ? '500' : '5'));
const ADS = path.resolve(opt('--ads', '../jsdata.json'));
const TARGET = opt('--target', process.env.RS_BASE ?? 'http://localhost:9002');

/** Which of the extractor's LOCATIONS are countries rather than cities. */
const COUNTRIES = new Set([
  'USA', 'US', 'UK', 'Canada', 'Australia', 'Europe', 'EU', 'UAE',
  'Qatar', 'KSA', 'Saudi', 'Bahrain', 'Kuwait', 'Oman',
]);

/** "5.7" / "5'7" / "5-7" → centimetres. Feet and inches, as the ads write it. */
function toCm(raw) {
  const m = String(raw).match(/^(\d)[.'\-]?(\d{1,2})?$/);
  if (!m) return undefined;
  const ft = Number(m[1]);
  const inch = m[2] ? Number(m[2]) : 0;
  if (ft < 3 || ft > 7 || inch > 11) return undefined;
  return Math.round((ft * 12 + inch) * 2.54);
}

/**
 * Flat {label, value} pairs -> registry keys.
 *
 * Only labels with a real home in the registry are mapped. The rest (Visa
 * Status, Status, Personal Traits) stay in the prose they came from rather
 * than inventing fields for them -- the About section carries the whole ad
 * verbatim, so nothing is lost by not having a box for it.
 */
function mapFields(fields) {
  const v = {};
  const get = (label) => fields.find((f) => f.label === label)?.value;

  const height = get('Height');
  if (height) {
    const cm = toCm(height);
    if (cm) v.heightCm = cm;
  }

  const marital = get('Marital Status');
  if (marital) v.maritalStatus = /Second/i.test(marital) ? 'divorced' : 'never-married';

  const edu = get('Education');
  // The prose carries stray brackets -- "(MBA (UK" comes out of an ad that
  // wrote "تعلیم (MBA (UK". Strip what is unbalanced rather than print it.
  if (edu) {
    const clean = edu.replace(/[()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean) v.highestQualification = clean;
  }

  const prof = get('Profession');
  if (prof) v.occupation = prof;

  // Sect is always 'سنی مسلم' from the extractor; the registry holds it as a
  // slug with its own label, so the English value goes in and the page renders
  // whatever the registry calls it.
  if (get('Sect')) v.maslak = 'sunni';

  // The extractor's LOCATIONS list mixes countries and cities, and the
  // registry keeps them apart -- "City: USA" reads as a mistake on a biodata.
  const loc = get('Location');
  if (loc) {
    if (COUNTRIES.has(loc)) v.country = loc;
    else v.city = loc;
  }

  return v;
}

/** One ad -> the values a biodata is made of. */
export function adToValues(ad) {
  const fields = globalThis.__extract(ad.body ?? '');
  const v = mapFields(fields);

  // The feed's own columns win over anything read out of the prose: `gender`
  // is authoritative there and guessing it from the text flips on any ad that
  // describes both the candidate and the partner sought.
  v.gender = ad.gender === 'female' ? 'bride' : 'groom';
  // Three ads in the feed carry an age of 2 -- the original text says
  // "عمر 2 ساله", a digit lost when the ad was typed. Nothing is required of a
  // biodata, so an implausible age is left out rather than printed wrong.
  if (typeof ad.age === 'number' && ad.age >= 18 && ad.age <= 70) v.age = ad.age;
  if (ad.education) v.highestQualification = v.highestQualification || ad.education;
  // The feed's `education` is a coarse bucket ("Doctor", "Engineer") and the
  // extractor reads the same word as a profession. Printing it twice -- once
  // as qualification, once as occupation -- says nothing the second time.
  if (v.highestQualification === v.occupation) delete v.highestQualification;

  // No religion. Every ad here is Muslim, so the field is the same on all 500
  // and earns no room on a frame; `maslak` already carries the sect, which is
  // the part a family actually reads.

  // The ad itself, kept whole. It is the only place the income, the visa
  // status and the family's wording survive intact.
  if (ad.body) v.aboutMe = String(ad.body).trim();

  return v;
}

async function main() {
  // Load the TS extractor through tsx.
  const mod = await import('../src/lib/bio-extract.ts');
  globalThis.__extract = mod.extractBioFields;

  if (!existsSync(ADS)) {
    console.error(`No ads file at ${ADS}`);
    process.exit(1);
  }
  const ads = JSON.parse(await readFile(ADS, 'utf8')).slice(0, LIMIT);

  console.log(COMMIT ? 'IMPORTING' : 'DRY RUN — nothing will be written');
  console.log(`ads    : ${ADS} (${ads.length} of them)`);
  console.log(`target : ${TARGET}\n`);

  let made = 0;
  for (const ad of ads) {
    const values = adToValues(ad);
    const slug = `ir-${ad.id}`;

    if (!COMMIT) {
      const shown = Object.entries(values)
        .filter(([k]) => k !== 'aboutMe')
        .map(([k, val]) => `${k}=${val}`)
        .join('  ');
      console.log(`${slug}  ${shown}`);
      made++;
      continue;
    }

    // Upsert, so a re-run after a mapping fix replaces the biodata rather
    // than adding a second copy of every ad.
    const existing = await fetch(`${TARGET}/api/profiles/${slug}`);
    const body = JSON.stringify({
      values,
      slug,
      status: 'published',
      isUrgent: ad.priority === 'Urgent',
      meta: { slug, status: 'published', isUrgent: ad.priority === 'Urgent' },
    });
    const res = existing.ok
      ? await fetch(`${TARGET}/api/profiles/${slug}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
      : await fetch(`${TARGET}/api/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
    if (!res.ok) throw new Error(`${slug}: ${res.status} ${await res.text()}`);
    made++;
    if (made % 25 === 0) console.log(`  ${made} imported…`);
  }

  console.log(`\n${COMMIT ? 'imported' : 'would import'} ${made} biodata(s)`);
  if (!COMMIT) console.log('Re-run with --commit to write them.');
}

main().catch((err) => { console.error(`\n${err.message}`); process.exit(1); });
