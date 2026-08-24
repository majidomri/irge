/**
 * Field extraction for free-text Urdu/English rishta ads.
 *
 * The live feed (jsdata.json, ~500 profiles) carries `body` as a single line of
 * prose with no `Label: value` structure at all — 0/500 profiles have even one
 * labelled line. BiodataModal's parser needs labelled lines, so without this
 * the structured "Card" view has nothing to show for any real profile.
 *
 * Ported from the vanilla `src/bioExtractor.browser.js` in the static app, with
 * two changes: the `extractTraits` infinite loop is fixed (see below), and the
 * ad-template half (`suggestTemplates`, which needs `window.AdFiller`) is
 * dropped — it has nothing to do with rendering a biodata sheet.
 */

const RX = {
  // NOTE: no `\b` before the Urdu alternatives. JS `\w` is ASCII-only, so an
  // Urdu letter is a non-word character and `\bعمر` can never match after a
  // space — the original missed the age on 489/500 profiles because of it.
  age:         /(?:عمر|\bAge\b)\s*[:\-]?\s*(\d{2})/i,
  height:      /(?:قد|\bHt\b|\bHeight\b)\s*[:\-]?\s*([0-9](?:[.'\-][0-9]{1,2})?)/i,
  // Values stop at a clause break, NOT at any `.` — that truncated "B.com" to
  // "B". Length is bounded so a missing break can't swallow the whole ad.
  // `تعلیم یافتہ` is the adjective "educated" (as in "educated family"), not a
  // qualification label — matching it filled Education with "respectable family"
  // on ~100 profiles. Only the noun forms count.
  education:   /(?:تعلیمی قابلیت|تعلیم(?!\s*یافت)|Education)\s*[:\-]*\s*([^،,\n۔。]{1,40})/i,
  income:      /(?:ماہانہ|monthly|Income)\s*[:\-]?\s*([^،,\n۔。]{1,40})/i,
  ownHouse:    /ذاتی\s+گھر/i,
  property:    /پراپرٹی(?:\s*ہولڈر)?/i,
  settled:     /\bwell\s*settled\b|\bsettled\b|ویل\s*سیٹلڈ/i,
  visa:        /(?:Visa\s*Holder|H1B|Green\s*Card|PR\s*Holder|Family\s*Visa|B1\b|B2\b|Student\s*Visa|Work\s*Permit|\bNRI\b)/i,
  citizenship: /(?:US|USA|UK|UAE|Saudi|KSA|Canada|Australia)\s*Citizen/i,
  second:      /عقد\s*ثانی|Second\s*Marriage|طلاق|خلع|بیوہ|Widow|Divorcee/i,
  religious:   /دیندار|نمازی|صوم\s*و\s*صلو|حافظ\s*قرآن|عالم|پردہ|حجاب/gi,
  personal:    /خوش\s*اخلاق|سلیقہ\s*مند|ملنسار|Good\s*Looking|ہینڈسم|جاذب\s*نظر|v\.?fair|fair/gi,
};

const LOCATIONS = [
  'USA', 'US', 'UK', 'Canada', 'Australia', 'Europe', 'EU', 'UAE', 'Dubai',
  'Abu Dhabi', 'Qatar', 'KSA', 'Saudi', 'Bahrain', 'Kuwait', 'Oman',
  'Hyderabad', 'Mumbai', 'London',
];

const PROFESSIONS: [RegExp, string][] = [
  [/software\s*engineer|software\s*engg|developer|\bit\b|mnc/i, 'Software Engineer'],
  [/doctor|mbbs|bds|\bmd\b|health\b/i,                          'Doctor'],
  [/teacher|ٹیچر|school/i,                                       'Teacher'],
  [/advocate|lawyer|llb/i,                                       'Lawyer'],
  [/\bca\b|chartered\s*accountant/i,                             'Chartered Accountant'],
  [/petroleum\s*engineer/i,                                      'Petroleum Engineer'],
  [/civil\s*eng|mechanical\s*engineer|electrical\s*engineer|b\.tech|\bbe\b|m\.tech/i, 'Engineer'],
  [/business|self\s*employee|own\s*business|entrepreneur/i,      'Businessman'],
  [/govt\s*job|government|گورنمنٹ/i,                             'Government Employee'],
  [/project\s*manager/i,                                         'Project Manager'],
  [/pharma|b\.pharmacy|m\.pharm/i,                               'Pharmacist'],
];

/**
 * Collect every distinct match of a repeated pattern.
 *
 * The original looped `while (rx.exec(text))` on a regex rebuilt from
 * `rx.flags`. `RX.personal` was declared `i` with no `g`, so `lastIndex` never
 * advanced and `exec` re-matched position 0 forever — `extract()` hung on the
 * first real profile. Forcing `g` here is what makes the loop terminate.
 */
function collect(rx: RegExp, text: string): string[] {
  const g = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
  const out = new Set<string>();
  for (const m of text.matchAll(g)) {
    const hit = m[0].replace(/\s+/g, ' ').trim();
    if (hit) out.add(hit);
  }
  return [...out];
}

function findFirst(text: string, list: string[]): string | undefined {
  return list.find(w => {
    const esc = w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z0-9])${esc}([^A-Za-z0-9]|$)`, 'i').test(text);
  });
}

/**
 * Where the ad stops describing the candidate and starts describing the partner
 * they want. These ads run as one unpunctuated sentence, so a greedy capture
 * sails straight past the boundary and drags the whole request in with it.
 */
const CLAUSE_BREAK =
  /\s+(?:لڑکے کیلئے|لڑکی کیلئے|لڑکے سے|لڑکی سے|کیلئے|کیلیے|اسی مناسبت|اس مناسبت|مناسبت سے|رشتہ مطلوب|رشتہ درکار|بر\s?سر|میں|well\s*settled|settled|ویل\s*سیٹلڈ|فیر|ہینڈ\s?سم|جاذب|خوش|سلیقہ|دیندار|نمازی|ذاتی)(?=\s|$)/i;

/** Trim a captured value back to the candidate's own clause, max `words` words. */
function clip(value: string, words = 5): string {
  const cut = value.split(CLAUSE_BREAK)[0];
  return cut.trim().split(/\s+/).slice(0, words).join(' ').replace(/[:\-،,.]+$/, '').trim();
}

/** Filler that can lead or trail a captured qualification but is never part of it. */
const EDU_NOISE = /^(?:well|settled|تعلیمی|تعلیم|قابلیت|آسٹریلیا|ہینڈسم|ہینڈ|سم|فیر|کلر|جاذب|نظر|و|کا|کی|کے|میں|اور|سے|حیدر|آباد|پراپرٹی|ہولڈر|wall)$/i;

/**
 * A qualification is essentially always Latin (B.com, MBA, B.Tech) or one of a
 * few Urdu religious credentials. Anything else the capture picked up is
 * surrounding prose, and it is better to show no Education row than a wrong one.
 */
function cleanEducation(value: string): string | undefined {
  const tokens = value.split(/\s+/).filter(Boolean);
  while (tokens.length && EDU_NOISE.test(tokens[0]))               tokens.shift();
  while (tokens.length && EDU_NOISE.test(tokens[tokens.length - 1])) tokens.pop();
  const out = tokens.join(' ').trim();
  return /[A-Za-z0-9]|حافظ|قرآن|عالم|فاضل/.test(out) ? out : undefined;
}

export interface BioField { label: string; value: string }

/**
 * Pull whatever fields the prose yields, as `Label: value` pairs using the same
 * vocabulary BiodataModal's parser already buckets ("Age" → Personal,
 * "Education" → Education & Career, "Sect" → Religious, …).
 *
 * Returns [] for empty input. Absent fields are simply omitted — nothing is
 * invented, so a sparse ad produces a short card rather than a padded one.
 */
export function extractBioFields(text: string): BioField[] {
  const body = (text || '').replace(/\s+/g, ' ').trim();
  if (!body) return [];

  const fields: BioField[] = [];
  const add = (label: string, value: string | undefined | null) => {
    const v = value?.trim();
    if (v) fields.push({ label, value: v });
  };

  // No Gender row on purpose. The original guessed it by counting لڑکا/لڑکی
  // mentions, but an ad describes BOTH the candidate and the partner sought, so
  // the count flips on plenty of profiles — a bride's ad announcing "Groom".
  // The feed carries an authoritative `gender`, and the modal header already
  // renders it; a guessed row here could only ever contradict it.
  add('Age',    body.match(RX.age)?.[1]);
  add('Height', body.match(RX.height)?.[1]);
  add('Marital Status', RX.second.test(body) ? 'Second Marriage (عقد ثانی)' : 'Never Married');

  const edu = body.match(RX.education)?.[1];
  add('Education',   edu && cleanEducation(clip(edu, 4)));
  add('Profession',  PROFESSIONS.find(([rx]) => rx.test(body))?.[1]);
  const inc = body.match(RX.income)?.[1];
  add('Income',      inc && clip(inc, 4));

  add('Sect', 'سنی مسلم');
  const religious = collect(RX.religious, body);
  if (religious.length) add('Religious Traits', religious.join('، '));

  add('Location',    findFirst(body, LOCATIONS));
  add('Visa Status', body.match(RX.visa)?.[0]);
  add('Citizenship', body.match(RX.citizenship)?.[0]);

  const ownHouse = RX.ownHouse.test(body);
  const property = RX.property.test(body);
  if (RX.settled.test(body) || ownHouse || property) {
    const notes = [
      'Well settled',
      ownHouse ? 'Own house (ذاتی گھر)' : null,
      property ? 'Property holder' : null,
    ].filter(Boolean);
    add('Status', notes.join(' · '));
  }

  const personal = collect(RX.personal, body);
  if (personal.length) add('Personal Traits', personal.join('، '));

  return fields;
}
