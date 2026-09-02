/**
 * Dynamic biodata: type layer.
 *
 * Everything about a biodata -- which sections exist, which fields live in
 * them, what each field looks like, when it applies -- is DATA, not code.
 * The registry (registry.ts) is the seed for that data; the same shape is
 * stored in Postgres (`sections`, `field_definitions`) so an admin can add
 * "Nikah venue preference" without a deploy.
 *
 * Two rules hold everywhere in this folder:
 *   1. Nothing is ever required. Not one field. Not even name.
 *   2. A value that is absent is not rendered -- not as "N/A", not as an
 *      empty row, and a section whose every field is absent does not render
 *      at all.
 */

export type FieldType =
  | 'text'        // single line
  | 'longtext'    // paragraph
  | 'number'
  | 'select'      // one of options
  | 'multiselect' // many of options
  | 'boolean'     // tri-state in practice: true / false / unset
  | 'date'        // ISO yyyy-mm-dd
  | 'time'        // HH:mm
  | 'height'      // cm under the hood, shown as ft'in" + cm
  | 'weight'      // kg
  | 'money'       // { amount, currency, period }
  | 'phone'
  | 'email'
  | 'url'
  | 'tags'        // free-form list, no fixed options
  | 'image'
  | 'file'
  | 'repeater';   // list of sub-records (siblings, degrees, jobs, relatives)

/** How a value is exposed once the profile is public. */
export type Visibility =
  | 'public'      // anyone who opens the biodata
  | 'connected'   // only after both sides accept
  | 'private';    // owner + admin only, never rendered publicly

/**
 * Where a field is allowed to appear. Omitted means "everywhere".
 *
 * This is the answer to having had three biodatas: the swipe card, the
 * broadcast frame and the web page are different PRESENTERS over one model,
 * and which details each one carries is data here -- not a second field list
 * living inside a component.
 */
export type Surface = 'page' | 'card' | 'broadcast' | 'print';

export type Option = {
  value: string;
  label: string;
  /** Compact form used on the live card / icon grid where space is tight. */
  short?: string;
};

/**
 * Conditional applicability. Every clause is optional; a field with no
 * `appliesTo` applies to everybody. Clauses are ANDed, values inside a
 * clause are ORed.
 */
export type AppliesTo = {
  gender?: string[];
  religion?: string[];
  maritalStatus?: string[];
  /** Show only when another field holds one of these values. */
  when?: { key: string; equals?: string[]; truthy?: boolean };
};

export type SubField = {
  key: string;
  label: string;
  type: Exclude<FieldType, 'repeater'>;
  options?: Option[];
  placeholder?: string;
  /** Sub-field that carries the row's headline in the rendered view. */
  primary?: boolean;
  /** Sub-field that names the row -- "Brother", "2022", "Maternal uncle". */
  role?: boolean;
  /** Appended after the value: `married` turns 1 into "1 married". */
  unit?: string;
};

export type FieldDef = {
  /** Stable storage key. Never rename -- add a new field and migrate. */
  key: string;
  label: string;
  type: FieldType;
  section: string;
  order: number;

  options?: Option[];
  /** For `repeater`. */
  fields?: SubField[];
  /** Row template label for a repeater, e.g. "Add sibling". */
  addLabel?: string;

  placeholder?: string;
  help?: string;
  /** Glyph key used by the live show + view. Free-form; renderer falls back. */
  icon?: string;
  unit?: string;
  /** Narrows how a value is printed. `year` shows a date's year alone. */
  format?: 'year';
  /** Free text is allowed alongside the options (biradari, occupation...). */
  allowCustom?: boolean;
  /** Compact label for tight presenters: "Father's name" -> "Father". */
  shortLabel?: string;
  /**
   * Sub-heading this field sits under, inside its section. Family Details
   * reads far better split into "Parents" and "Siblings & others" than as
   * one flat run of people, and the split belongs in the data rather than
   * in each presenter's head.
   */
  group?: string;
  /**
   * Fold this field's value into another field's line as its note, instead of
   * standing as its own row. `fatherOccupation` pairWith `fatherName` gives
   * one "Father / Mohammed Yusuf / Bank Manager" block rather than two rows.
   */
  pairWith?: string;
  /** Display accent, for presenters that tint by relation. */
  tone?: 'gold' | 'rose' | 'lilac' | 'plain';
  /** Restrict to these surfaces. Omitted = every surface. */
  surfaces?: Surface[];
  appliesTo?: AppliesTo;
  visibility?: Visibility;
  /** Surfaced in the at-a-glance grid over the photo, if it has a value. */
  quickFact?: boolean;
  /** Belongs to the partner-preference mirror rather than the self profile. */
  preference?: boolean;
  /** Where this field was found. Documents the cross-check; not used at runtime. */
  sources?: string[];
};

export type SectionDef = {
  id: string;
  title: string;
  /** Shown under the heading when the section renders. */
  subtitle?: string;
  icon?: string;
  order: number;
  layout: 'list' | 'grid' | 'tags' | 'prose' | 'timeline';
  appliesTo?: AppliesTo;
  visibility?: Visibility;
  /** Restrict to these surfaces. Omitted = every surface. */
  surfaces?: Surface[];
};

export type Registry = {
  sections: SectionDef[];
  fields: FieldDef[];
};

/** The stored document. Sparse by design: absent key === not answered. */
export type BiodataValues = Record<string, unknown>;

/* ---------------- resolved (render-ready) shapes ---------------- */

export type ResolvedField = {
  key: string;
  label: string;
  /** Sub-heading it belongs under, when its section groups its fields. */
  group?: string;
  /** `shortLabel` when the field has one, else `label`. */
  short: string;
  type: FieldType;
  icon?: string;
  tone?: 'gold' | 'rose' | 'lilac' | 'plain';
  /** Value of a field that declared `pairWith` this one. */
  note?: string;
  /** Already formatted for display. Never empty -- empties are dropped. */
  display: string;
  /** Raw value, for renderers that want to do their own thing. */
  raw: unknown;
  /** Only for `repeater`: each row already reduced to non-empty parts. */
  rows?: { role?: string; primary: string; secondary?: string; meta?: string }[];
};

/** Fields under one sub-heading. An unlabelled group leads the section. */
export type ResolvedGroup = {
  label?: string;
  fields: ResolvedField[];
};

export type ResolvedSection = {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  layout: SectionDef['layout'];
  /** Every field in the section, flat -- what most presenters want. */
  fields: ResolvedField[];
  /** The same fields, split by `group`, in order. */
  groups: ResolvedGroup[];
};

export type ResolvedBiodata = {
  sections: ResolvedSection[];
  quickFacts: { key: string; label: string; display: string; icon?: string }[];
  /** 0-100, purely informational -- never a gate. */
  completeness: number;
  filledCount: number;
  applicableCount: number;
};

/**
 * A profile as every presenter now receives it: the meta the app owns, plus
 * the one sparse document. This replaces the old fixed `Profile` type at the
 * component boundary -- the swipe card, the live stage and the web page all
 * take this and ask `resolveBiodata` for whatever they need.
 */
export type ProfileDoc = {
  id: string;
  slug?: string | null;
  status?: 'draft' | 'published' | 'archived';
  tier?: 'standard' | 'premium';
  isUrgent?: boolean;
  isVerified?: boolean;
  /** When the ad was listed. Shown in the card footer. */
  listedAt?: string;
  values: BiodataValues;
};
