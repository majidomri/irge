/**
 * The profession vocabulary — now data, not code.
 *
 * This list *is* the product. InstaRishta is not a matrimony site with a
 * profession filter — it is a site you can only get into if your profession
 * checks out. So the vocabulary stays deliberately closed: every entry has a
 * real, checkable credential behind it. A profession nobody can prove does
 * not belong on the list, because an unverifiable badge is worse than no
 * badge — it teaches members the gate is theatre.
 *
 * What changed in migration 017 is *who* closes it. The list used to be a
 * hardcoded array here, so adding "Lawyer" meant a code change and a deploy.
 * It now lives in ir_professions and is edited from /nizam.
 *
 * Consequences for callers:
 *   • Server code loads the list with loadProfessions(db).
 *   • Client code reads it from the cached useProfessions() hook.
 *   • Every lookup helper takes the list as its first argument, so nothing
 *     in this module holds global state that could go stale mid-session.
 *
 * `key` is stored on ir_user_profiles.profession_key and
 * ir_channels.profession_key, so keys must stay stable once members hold
 * them — labels can be reworded freely. The admin route enforces that by
 * refusing to rename a key.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type DocType =
  | 'registration_no'
  | 'membership_no'
  | 'degree_certificate'
  | 'employment_letter'
  | 'corporate_email'
  | 'other';

export const DOC_TYPES: readonly DocType[] = [
  'registration_no', 'membership_no', 'degree_certificate',
  'employment_letter', 'corporate_email', 'other',
] as const;

/** Human labels for the proof types, shared by the apply form and /nizam. */
export const DOC_LABELS: Record<DocType, string> = {
  registration_no:    'Council registration number',
  membership_no:      'Membership number',
  degree_certificate: 'Degree certificate',
  employment_letter:  'Employment / posting letter',
  corporate_email:    'Company or alumni email',
  other:              'Other proof',
};

export interface Profession {
  key:        string;
  label:      string;
  label_ur:   string | null;
  icon:       string;
  /** Cohort channel slug — one profession, one circle. */
  slug:       string;
  /** Proof types this profession accepts, most authoritative first. */
  accepts:    DocType[];
  proof_hint: string | null;
  active:     boolean;
  sort_order: number;
}

export const PROFESSION_COLS =
  'key, label, label_ur, icon, slug, accepts, proof_hint, active, sort_order';

export function isDocType(v: unknown): v is DocType {
  return typeof v === 'string' && (DOC_TYPES as readonly string[]).includes(v);
}

/**
 * Load the vocabulary. `activeOnly` is what the apply form wants — a retired
 * profession must not be offered to new applicants — while /nizam and the
 * badge need the full list, since members already hold retired keys and their
 * badges must keep rendering.
 */
export async function loadProfessions(
  db: Db,
  { activeOnly = false }: { activeOnly?: boolean } = {},
): Promise<Profession[]> {
  let query = db.from('ir_professions').select(PROFESSION_COLS).order('sort_order').order('key');
  if (activeOnly) query = query.eq('active', true);

  const { data, error } = await query;
  if (error || !data) return [];
  return data as unknown as Profession[];
}

// ── Lookups ──────────────────────────────────────────────────────────────────
// All take the list explicitly. Nothing here caches: a stale global would
// silently render the wrong label after an admin edit.

export function getProfession(
  list: readonly Profession[],
  key: string | null | undefined,
): Profession | null {
  if (!key) return null;
  return list.find(p => p.key === key) ?? null;
}

export function professionLabel(
  list: readonly Profession[],
  key: string | null | undefined,
): string {
  return getProfession(list, key)?.label ?? '—';
}

export function professionIcon(
  list: readonly Profession[],
  key: string | null | undefined,
): string {
  return getProfession(list, key)?.icon ?? '✅';
}

export function isProfessionKey(
  list: readonly Profession[],
  v: unknown,
): v is string {
  return typeof v === 'string' && list.some(p => p.key === v);
}

/**
 * True when the submitted proof is one this profession actually accepts.
 * Checked server-side on submission so the review queue never fills with
 * requests an admin cannot action (e.g. a "corporate email" for a doctor).
 */
export function acceptsDoc(
  list: readonly Profession[],
  professionKey: string,
  docType: DocType,
): boolean {
  const p = getProfession(list, professionKey);
  return !!p && p.accepts.includes(docType);
}

/**
 * Derive a URL-safe slug from a label, for the admin form's convenience.
 * The admin can override it; this is only the default.
 */
export function slugifyProfession(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Keys are permanent once members hold them, so they get a stricter shape
 * than slugs: lowercase, underscore-separated, no leading digit.
 */
export function isValidProfessionKey(v: string): boolean {
  return /^[a-z][a-z0-9_]{1,39}$/.test(v);
}
