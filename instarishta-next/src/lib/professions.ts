/**
 * The closed vocabulary of professions InstaRishta will verify, and the
 * proof it accepts for each.
 *
 * This list *is* the product. InstaRishta is not a matrimony site with a
 * profession filter — it is a site you can only get into if your profession
 * checks out. So the vocabulary is deliberately small and closed: every key
 * here has a real, checkable credential behind it (a council registration, a
 * membership number, an allotment letter, a degree). A profession nobody can
 * prove does not belong on this list, because an unverifiable badge is worse
 * than no badge — it teaches members the gate is theatre.
 *
 * `key` is what gets stored on ir_user_profiles.profession_key and on
 * ir_channels.profession_key (migration 015), so keys must stay stable;
 * labels can be reworded freely. Same convention as comment-chips.ts.
 */

export type DocType =
  | 'registration_no'
  | 'membership_no'
  | 'degree_certificate'
  | 'employment_letter'
  | 'corporate_email'
  | 'other';

export interface Profession {
  key:   string;
  label: string;   // English
  ur:    string;   // Urdu
  icon:  string;
  /** Cohort channel slug — matches ir_channels.slug seeded in migration 015. */
  slug:  string;
  /** What an applicant may submit as proof, most authoritative first. */
  accepts: readonly DocType[];
  /** Shown under the file picker so the applicant knows what we want. */
  proofHint: string;
}

export const PROFESSIONS: readonly Profession[] = [
  {
    key: 'doctor',
    label: 'Doctor',
    ur: 'ڈاکٹر',
    icon: '🩺',
    slug: 'doctors',
    accepts: ['registration_no', 'degree_certificate', 'employment_letter'],
    proofHint: 'NMC/MCI or State Medical Council registration number, or your MBBS/MD degree certificate.',
  },
  {
    key: 'ca',
    label: 'Chartered Accountant',
    ur: 'چارٹرڈ اکاؤنٹنٹ',
    icon: '📊',
    slug: 'chartered-accountants',
    accepts: ['membership_no', 'degree_certificate'],
    proofHint: 'ICAI membership number (or CFA charter number).',
  },
  {
    key: 'civil_services',
    label: 'Civil Services',
    ur: 'سول سروسز',
    icon: '🏛️',
    slug: 'civil-services',
    accepts: ['employment_letter', 'registration_no'],
    proofHint: 'UPSC allotment letter, or your service ID / posting order.',
  },
  {
    key: 'iit_iim',
    label: 'IIT / IIM',
    ur: 'آئی آئی ٹی / آئی آئی ایم',
    icon: '🎓',
    slug: 'iit-iim',
    accepts: ['degree_certificate', 'corporate_email'],
    proofHint: 'Your IIT/IIM degree certificate or alumni email address.',
  },
  {
    key: 'founder',
    label: 'Founder',
    ur: 'بانی',
    icon: '🚀',
    slug: 'founders',
    accepts: ['registration_no', 'corporate_email', 'other'],
    proofHint: 'Company CIN/GST number, or your company email address.',
  },
] as const;

export const PROFESSION_KEYS: readonly string[] = PROFESSIONS.map(p => p.key);

export const DOC_TYPES: readonly DocType[] = [
  'registration_no', 'membership_no', 'degree_certificate',
  'employment_letter', 'corporate_email', 'other',
] as const;

export function isProfessionKey(v: unknown): v is string {
  return typeof v === 'string' && PROFESSION_KEYS.includes(v);
}

export function isDocType(v: unknown): v is DocType {
  return typeof v === 'string' && (DOC_TYPES as readonly string[]).includes(v);
}

export function getProfession(key: string | null | undefined): Profession | null {
  return PROFESSIONS.find(p => p.key === key) ?? null;
}

export function professionLabel(key: string | null | undefined): string {
  return getProfession(key)?.label ?? '—';
}

export function professionIcon(key: string | null | undefined): string {
  return getProfession(key)?.icon ?? '✅';
}

/**
 * True when the submitted proof is one this profession actually accepts.
 * Checked server-side on submission so the review queue never fills with
 * requests an admin cannot action (e.g. a "corporate email" for a doctor).
 */
export function acceptsDoc(professionKey: string, docType: DocType): boolean {
  const p = getProfession(professionKey);
  return !!p && p.accepts.includes(docType);
}
