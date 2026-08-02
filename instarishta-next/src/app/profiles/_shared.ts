// Shared types, constants, and pure helpers used by the profiles route.
// Extracted from ProfilesClient.tsx so that lazy-loaded modal/drawer chunks
// can reuse the same logic without re-bundling it.

export interface Profile {
  /**
   * Upstream feed id — stable and unique (verified 500/500, none null).
   * This, NOT `_num`, is the identity to persist against. `_num` is only the
   * position in the filtered array and shifts whenever the feed changes.
   */
  id?: number;
  title: string;
  body: string;
  gender: 'male' | 'female' | string;
  /** Advertiser contact. Currently the business relay number on every profile. */
  phone?: string;
  whatsapp?: string;
  age?: number;
  education?: string;
  priority?: string;
  audio_url?: string;
  instagram_post_id?: string;
}

export type DeckProfile = Profile & { _num: number };

export const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
// Calligraphic Nastaliq fonts first — Faiz Nastaleeq / Jameel Noori Nastaleeq
// are local on Pakistani user systems (free, instant). Noto Nastaliq Urdu is
// loaded asynchronously via <LazyNastaliq /> and swapped in after first paint.
// Noto Naskh Arabic (loaded synchronously via next/font) is the during-load
// fallback so Urdu text always renders correctly during LCP.
export const URDU_FONT =
  "'Faiz Nastaleeq','Jameel Noori Nastaleeq','Noto Nastaliq Urdu','Noto Naskh Arabic',serif";

export function textDir(text: string): 'rtl' | 'ltr' {
  return ARABIC_RE.test(text) ? 'rtl' : 'ltr';
}

export function isUrgent(body: string) {
  return /urgent|جلد|ارجنٹ/.test(body.toLowerCase());
}

export function parseAge(body: string): number {
  const m = body.match(/عمر\s+(\d{2})/);
  return m ? parseInt(m[1], 10) : 0;
}

export function matchesEdu(body: string, val: string) {
  if (!val) return true;
  const b = body.toLowerCase();
  switch (val) {
    case 'doctor':       return /mbbs|m\.?b\.?b\.?s|bds|doctor|md\b/.test(b);
    case 'engineer':     return /b\.?tech|m\.?tech|engineer|software|b\.e\b/.test(b);
    case 'mba':          return /\bmba\b|\bbba\b/.test(b);
    case 'ms':           return /\bms\b|\bm\.sc\b|\bmsc\b/.test(b);
    case 'graduate':     return /\bb\.com\b|\bba\b|\bbsc\b|\bgraduate\b/.test(b);
    case 'hafiz':        return /hafiz|aalim|qur'?an|قرآن/.test(b);
    case 'phd':          return /\bphd\b/.test(b);
    case 'intermediate': return /\bssc\b|\bintermediate\b|\bmatric\b/.test(b);
    default:             return true;
  }
}

export function matchesMarital(body: string, val: string) {
  if (!val) return true;
  const b = body.toLowerCase();
  if (val === 'divorced')      return /divorced|khula|طلاق/.test(b);
  if (val === 'widow')         return /widow|بیوہ/.test(b);
  if (val === 'never married') return !/divorced|khula|طلاق|widow|بیوہ/.test(b);
  return true;
}

export function matchesLocation(body: string, val: string) {
  if (!val) return true;
  const b = body.toLowerCase();
  const MAP: Record<string, string[]> = {
    hyderabad:  ['hyderabad','hyderabadi','حیدر آباد','حیدرآباد'],
    gulf:       ['dubai','uae','saudi','qatar','kuwait','bahrain','oman','gulf','خلیج'],
    usa:        ['usa','united states','america','امریکہ'],
    uk:         ['uk','united kingdom','britain','england','برطانیہ'],
    australia:  ['australia','آسٹریلیا'],
    delhi:      ['delhi','new delhi'],
    mumbai:     ['mumbai','bombay'],
    karnataka:  ['bangalore','bengaluru','karnataka'],
    telangana:  ['telangana','warangal','nizamabad'],
  };
  return (MAP[val] ?? [val]).some(k => b.includes(k));
}

export const EDUCATION_OPTIONS = [
  { label: 'All Educations',     value: '' },
  { label: 'Doctor / MBBS',      value: 'doctor' },
  { label: 'Engineer / B.Tech',  value: 'engineer' },
  { label: 'MBA / BBA',          value: 'mba' },
  { label: 'MS / MSc',           value: 'ms' },
  { label: 'Graduate (BA/BCom)', value: 'graduate' },
  { label: 'Hafiz / Aalim',      value: 'hafiz' },
  { label: 'PhD',                value: 'phd' },
  { label: 'Intermediate / SSC', value: 'intermediate' },
];

export const MARITAL_OPTIONS = [
  { label: 'All Statuses',       value: '' },
  { label: 'Never Married',      value: 'never married' },
  { label: 'Divorced / Khula',   value: 'divorced' },
  { label: 'Widow / Widower',    value: 'widow' },
];

export const STATE_OPTIONS = [
  { label: 'All States / Countries',   value: '' },
  { label: 'Hyderabad',                value: 'hyderabad' },
  { label: 'Gulf (UAE/Saudi/Qatar…)',   value: 'gulf' },
  { label: 'USA',                      value: 'usa' },
  { label: 'UK',                       value: 'uk' },
  { label: 'Australia',                value: 'australia' },
  { label: 'Delhi',                    value: 'delhi' },
  { label: 'Mumbai',                   value: 'mumbai' },
  { label: 'Bangalore / Karnataka',    value: 'karnataka' },
  { label: 'Telangana',                value: 'telangana' },
];

export const COMMUNITY_OPTIONS = [
  { label: 'All Communities',      value: '' },
  { label: 'Sunni',                value: 'sunni' },
  { label: 'Shia',                 value: 'shia' },
  { label: 'Deobandi',             value: 'deobandi' },
  { label: 'Barelvi',              value: 'barelvi' },
  { label: 'Salafi / Ahle Hadith', value: 'salafi' },
];

export const SORT_OPTIONS = [
  { label: 'Default',      value: 'default' },
  { label: 'Urgent first', value: 'urgent' },
  { label: 'Groom first',  value: 'male' },
  { label: 'Bride first',  value: 'female' },
];

// ── URL-driven filter state ───────────────────────────────────────────────────
// The page reads these from searchParams server-side, filters profiles before
// hydration, and ships only the matched subset to the client. Client filter UI
// just pushes URL changes — Remix-style, server is the source of truth.

export interface FilterParams {
  search:     string;
  idFilter:   string;
  gender:     string;        // 'all' | 'male' | 'female'
  urgentOnly: boolean;
  education:  string;
  marital:    string;
  state:      string;
  community:  string;
  ageMin:     number;
  ageMax:     number;
  sort:       string;        // 'default' | 'urgent' | 'male' | 'female'
}

export const DEFAULT_FILTERS: FilterParams = {
  search: '', idFilter: '', gender: 'all', urgentOnly: false,
  education: '', marital: '', state: '', community: '',
  ageMin: 18, ageMax: 60, sort: 'default',
};

type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseFilterParams(raw: RawSearchParams): FilterParams {
  const one = (k: string): string => {
    const v = raw[k];
    return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
  };
  const num = (k: string, fallback: number): number => {
    const n = parseInt(one(k), 10);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    search:     one('q'),
    idFilter:   one('id'),
    gender:     one('gender')   || 'all',
    urgentOnly: one('urgent')   === '1',
    education:  one('education'),
    marital:    one('marital'),
    state:      one('state'),
    community:  one('community'),
    ageMin:     num('ageMin', 18),
    ageMax:     num('ageMax', 60),
    sort:       one('sort')     || 'default',
  };
}

export function activeFilterCount(f: FilterParams): number {
  return [
    f.gender !== 'all', !!f.search, !!f.education, !!f.marital,
    f.sort !== 'default', f.urgentOnly, !!f.idFilter, !!f.state,
    !!f.community, f.ageMin > 18 || f.ageMax < 60,
  ].filter(Boolean).length;
}

export function applyFilters(allProfiles: Profile[], f: FilterParams): DeckProfile[] {
  // Number every profile by its position in the original list — stable IDs that
  // don't change as filters are applied/removed.
  let list: DeckProfile[] = allProfiles.map((p, i) => ({ ...p, _num: i + 1 }));

  if (f.gender !== 'all') list = list.filter(p => p.gender === f.gender);
  if (f.urgentOnly)       list = list.filter(p => isUrgent(p.body));

  if (f.search) {
    const q = f.search.toLowerCase();
    list = list.filter(p => p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q));
  }

  if (f.idFilter) {
    const n = parseInt(f.idFilter, 10);
    if (!isNaN(n)) list = list.filter(p => p._num === n);
  }

  if (f.education) list = list.filter(p => matchesEdu(p.body, f.education));
  if (f.marital)   list = list.filter(p => matchesMarital(p.body, f.marital));
  if (f.state)     list = list.filter(p => matchesLocation(p.body, f.state));

  if (f.community) {
    const c = f.community.toLowerCase();
    list = list.filter(p => p.body.toLowerCase().includes(c));
  }

  if (f.ageMin > 18 || f.ageMax < 60) {
    list = list.filter(p => {
      const age = parseAge(p.body);
      if (!age) return true;
      return age >= f.ageMin && age <= f.ageMax;
    });
  }

  if (f.sort === 'urgent') list = [...list].sort((a, b) => +isUrgent(b.body) - +isUrgent(a.body));
  if (f.sort === 'male')   list = [...list].sort((a, b) => +(a.gender !== 'male')   - +(b.gender !== 'male'));
  if (f.sort === 'female') list = [...list].sort((a, b) => +(a.gender !== 'female') - +(b.gender !== 'female'));

  return list;
}
