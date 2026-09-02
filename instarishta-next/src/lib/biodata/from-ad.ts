/**
 * A rishta ad, in the shared biodata model.
 *
 * The ads are Urdu prose with a handful of columns beside them. `bio-extract`
 * turns that prose into `{label, value}` pairs -- it is the parser behind the
 * biodata sheet, and its regexes carry corrections worth keeping. This maps
 * that flat list onto registry keys, so an ad becomes the same kind of
 * document the broadcast, the published frames and the share cards all read.
 *
 * One model, four surfaces. Before this the site had its own idea of what a
 * biodata was -- its own section type, its own presenter -- and matching the
 * show meant keeping two definitions looking alike by hand.
 *
 * Deliberately not carried across: `phone` and `whatsapp`. Contact belongs
 * behind the site's credits, never in the document itself.
 */
import { extractBioFields } from '@/lib/bio-extract';
import type { BiodataValues } from './types';

/** Which of the extractor's locations are countries rather than cities. */
const COUNTRIES = new Set([
  'USA', 'US', 'UK', 'Canada', 'Australia', 'Europe', 'EU', 'UAE',
  'Qatar', 'KSA', 'Saudi', 'Bahrain', 'Kuwait', 'Oman',
]);

/** "5.7" / "5'7" / "5-7" → centimetres. Feet and inches, as the ads write it. */
function toCm(raw: string): number | undefined {
  const m = raw.match(/^(\d)[.'\-]?(\d{1,2})?$/);
  if (!m) return undefined;
  const ft = Number(m[1]);
  const inch = m[2] ? Number(m[2]) : 0;
  if (ft < 3 || ft > 7 || inch > 11) return undefined;
  return Math.round((ft * 12 + inch) * 2.54);
}

export interface AdLike {
  body?: string;
  gender?: string;
  age?: number;
  education?: string;
  priority?: string;
}

export function adToValues(ad: AdLike): BiodataValues {
  const fields = extractBioFields(ad.body ?? '');
  const get = (label: string) => fields.find((f) => f.label === label)?.value;
  const v: BiodataValues = {};

  const height = get('Height');
  if (height) {
    const cm = toCm(height);
    if (cm) v.heightCm = cm;
  }

  const marital = get('Marital Status');
  if (marital) v.maritalStatus = /Second/i.test(marital) ? 'divorced' : 'never-married';

  // Stray brackets survive the prose -- "تعلیم (MBA (UK" yields "(MBA (UK".
  const edu = get('Education');
  if (edu) {
    const clean = edu.replace(/[()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean) v.highestQualification = clean;
  }

  const prof = get('Profession');
  if (prof) v.occupation = prof;

  if (get('Sect')) v.maslak = 'sunni';

  const loc = get('Location');
  if (loc) {
    if (COUNTRIES.has(loc)) v.country = loc;
    else v.city = loc;
  }

  // What the family is looking for -- the one extracted list the registry has
  // a home for.
  const personal = get('Personal Traits');
  if (personal) v.prefTraits = personal.split(/\s*[،,]\s*/).filter(Boolean);

  // Income, visa status and "well settled" are extracted but have no registry
  // field, and inventing keys for them would only produce values `resolve`
  // drops on the floor. They stay in the ad's own prose below, which is where
  // the family wrote them.

  // The feed's own columns win over the prose: `gender` is authoritative
  // there, and guessing it from an ad flips on any that describes both the
  // candidate and the partner sought.
  v.gender = ad.gender === 'female' ? 'bride' : 'groom';

  // A few ads read "عمر 2 ساله" -- a digit lost when the ad was typed. Nothing
  // is required of a biodata, so an implausible age is left out rather than
  // shown wrong.
  if (typeof ad.age === 'number' && ad.age >= 18 && ad.age <= 70) v.age = ad.age;

  if (ad.education) v.highestQualification = v.highestQualification || ad.education;
  // The feed's `education` bucket and the extractor's profession are often the
  // same word; printing it twice says nothing the second time.
  if (v.highestQualification === v.occupation) delete v.highestQualification;

  // The ad itself, kept whole. Whatever the extractor could not turn into a
  // field survives only here.
  if (ad.body) v.aboutMe = String(ad.body).trim();

  return v;
}
