import type {
  AppliesTo,
  BiodataValues,
  FieldDef,
  Option,
  Registry,
  ResolvedBiodata,
  ResolvedField,
  ResolvedGroup,
  ResolvedSection,
  SubField,
  Surface,
  Visibility,
} from './types';
import { REGISTRY } from './registry';

/**
 * The rendering engine, and the whole point of the exercise.
 *
 *   resolve(values) -> only what was actually answered
 *
 * A field with no value never reaches the UI. A section whose fields all
 * came back empty never reaches the UI either. So the biodata page has no
 * "Height: --" rows and no empty "Horoscope" heading; a profile that filled
 * in three things renders three things, beautifully, and a profile that
 * filled in ninety renders ninety.
 */

/* ------------------------------------------------------------------ *
 * Emptiness
 * ------------------------------------------------------------------ */

/** Values that families type meaning "I did not answer". Treated as empty. */
const NULL_WORDS = new Set([
  '', '-', '--', 'n/a', 'na', 'nil', 'none', 'null', 'undefined', 'not applicable',
  'not specified', 'not mentioned', 'not available', 'tbd', 'to be decided', '?',
]);

export function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return NULL_WORDS.has(v.trim().toLowerCase());
  if (typeof v === 'number') return Number.isNaN(v);
  if (typeof v === 'boolean') return false; // false is an answer
  if (Array.isArray(v)) return v.every(isEmpty);
  if (typeof v === 'object') return Object.values(v as object).every(isEmpty);
  return false;
}

/** Strips empties recursively; returns undefined if nothing survives. */
export function compact<T>(v: T): T | undefined {
  if (isEmpty(v)) return undefined;
  if (Array.isArray(v)) {
    const rows = v.map(compact).filter((x) => x !== undefined);
    return rows.length ? (rows as unknown as T) : undefined;
  }
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const c = compact(val);
      if (c !== undefined) out[k] = c;
    }
    return Object.keys(out).length ? (out as T) : undefined;
  }
  if (typeof v === 'string') return v.trim() as unknown as T;
  return v;
}

/** Drops every empty key. This is what gets written to the database. */
export function compactValues(values: BiodataValues): BiodataValues {
  const out: BiodataValues = {};
  for (const [k, v] of Object.entries(values)) {
    const c = compact(v);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Applicability
 * ------------------------------------------------------------------ */

const norm = (v: unknown) =>
  typeof v === 'string' ? v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') : v;

export function applies(rule: AppliesTo | undefined, values: BiodataValues): boolean {
  if (!rule) return true;
  const has = (key: string, allowed: string[]) => {
    const v = values[key];
    // An unanswered discriminator never hides a field: better to offer it.
    if (isEmpty(v)) return true;
    return allowed.map(norm).includes(norm(v) as string);
  };
  if (rule.gender && !has('gender', rule.gender)) return false;
  if (rule.religion && !has('religion', rule.religion)) return false;
  if (rule.maritalStatus && !has('maritalStatus', rule.maritalStatus)) return false;
  if (rule.when) {
    const v = values[rule.when.key];
    if (rule.when.truthy !== undefined) {
      if (isEmpty(v) === rule.when.truthy) return false;
    }
    if (rule.when.equals) {
      if (isEmpty(v)) return false; // dependent fields stay hidden until answered
      const vals = Array.isArray(v) ? v : [v];
      if (!vals.some((x) => rule.when!.equals!.map(norm).includes(norm(x) as string))) return false;
    }
  }
  return true;
}

/** Omitted `surfaces` means the field belongs everywhere. */
export function onSurface(x: { surfaces?: Surface[] }, surface: Surface | undefined): boolean {
  if (!surface || !x.surfaces) return true;
  return x.surfaces.includes(surface);
}

const VIS_RANK: Record<Visibility, number> = { public: 0, connected: 1, private: 2 };

export function visibleAt(field: { visibility?: Visibility }, viewer: Visibility): boolean {
  return VIS_RANK[field.visibility ?? 'public'] <= VIS_RANK[viewer];
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

/**
 * A stored value that no longer matches any option -- an option renamed, a
 * value written by an older import, a custom answer on an `allowCustom`
 * field -- must still read as a human sentence, never as `halal-non-veg`.
 */
function prettify(s: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) return s;
  const words = s.split('-');
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function optionLabel(options: Option[] | undefined, value: unknown): string {
  const s = String(value);
  const hit = options?.find((o) => o.value === s || norm(o.label) === norm(s));
  return hit?.label ?? prettify(s);
}

export function optionShort(options: Option[] | undefined, value: unknown): string {
  const s = String(value);
  const hit = options?.find((o) => o.value === s || norm(o.label) === norm(s));
  return hit?.short ?? hit?.label ?? prettify(s);
}

export function formatHeight(cm: unknown): string {
  const n = Number(cm);
  if (!Number.isFinite(n) || n <= 0) return '';
  const inches = Math.round(n / 2.54);
  return `${Math.floor(inches / 12)}'${inches % 12}" (${Math.round(n)} cm)`;
}

export function formatMoney(v: unknown): string {
  if (typeof v === 'string') return v;
  if (!v || typeof v !== 'object') return '';
  const m = v as { amount?: number | string; currency?: string; period?: string };
  if (isEmpty(m.amount)) return '';
  const cur = m.currency || 'INR';
  const amt = typeof m.amount === 'number' ? m.amount.toLocaleString('en-IN') : m.amount;
  return [cur, amt, m.period].filter(Boolean).join(' ');
}

export function formatDate(v: unknown): string {
  const s = String(v);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ageFrom(dob: unknown): number | undefined {
  if (isEmpty(dob)) return undefined;
  const d = new Date(String(dob));
  if (Number.isNaN(d.getTime())) return undefined;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 && a < 130 ? a : undefined;
}

/** One field's value as display text. Returns '' when there is nothing to show. */
export function formatField(field: FieldDef, value: unknown): string {
  if (isEmpty(value)) return '';
  switch (field.type) {
    case 'height':
      return formatHeight(value);
    case 'weight':
      return `${value} ${field.unit ?? 'kg'}`;
    case 'number':
      return field.unit ? `${value} ${field.unit}` : String(value);
    case 'money':
      return formatMoney(value);
    case 'date':
      if (field.format === 'year') {
        const d = new Date(String(value));
        return Number.isNaN(d.getTime()) ? String(value) : String(d.getFullYear());
      }
      return formatDate(value);
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'select':
      return optionLabel(field.options, value);
    case 'multiselect':
    case 'tags':
      return (Array.isArray(value) ? value : [value])
        .filter((v) => !isEmpty(v))
        .map((v) => optionLabel(field.options, v))
        .join(' · ');
    case 'image':
      return Array.isArray(value) ? `${value.length} photo${value.length > 1 ? 's' : ''}` : '1 photo';
    default:
      return String(value).trim();
  }
}

function formatSub(sf: SubField, value: unknown): string {
  if (isEmpty(value)) return '';
  const text =
    sf.type === 'select' ? optionLabel(sf.options, value)
    : sf.type === 'height' ? formatHeight(value)
    : sf.type === 'date' ? formatDate(value)
    : String(value).trim();
  return sf.unit ? `${text} ${sf.unit}` : text;
}

/** A repeater row reduced to headline / detail / meta, empties dropped. */
function resolveRows(field: FieldDef, value: unknown): ResolvedField['rows'] {
  const subs = field.fields ?? [];
  const rows = (Array.isArray(value) ? value : [value])
    .filter((r) => !isEmpty(r))
    .map((r) => {
      const rec = (r ?? {}) as Record<string, unknown>;
      const parts = subs
        .map((sf) => ({ sf, text: formatSub(sf, rec[sf.key]) }))
        .filter((x) => x.text);
      if (!parts.length) return null;
      // `role` names the row ("Brother", "2022"); `primary` is its headline.
      const rolePart = parts.find((x) => x.sf.role);
      const body = parts.filter((x) => x !== rolePart);
      const head = body.find((x) => x.sf.primary) ?? body[0] ?? rolePart!;
      const rest = body.filter((x) => x !== head);
      return {
        role: rolePart?.text,
        primary: head.text,
        secondary: rest.slice(0, 2).map((x) => x.text).join(' · ') || undefined,
        meta: rest.slice(2).map((x) => `${x.sf.label}: ${x.text}`).join(' · ') || undefined,
      };
    })
    .filter(Boolean) as NonNullable<ResolvedField['rows']>;
  return rows.length ? rows : undefined;
}

/* ------------------------------------------------------------------ *
 * Resolve
 * ------------------------------------------------------------------ */

export type ResolveOptions = {
  registry?: Registry;
  /** What the current viewer is allowed to see. Defaults to public. */
  viewer?: Visibility;
  /**
   * Which presenter is asking. The swipe card, the broadcast frame and the
   * web page share this one model and differ only by what they request.
   */
  surface?: Surface;
  /** Section ids to leave out (e.g. 'media' when the page renders photos itself). */
  exclude?: string[];
  /** Cap on quick facts shown over the photograph. */
  maxQuickFacts?: number;
};

export function resolveBiodata(
  rawValues: BiodataValues,
  options: ResolveOptions = {},
): ResolvedBiodata {
  const registry = options.registry ?? REGISTRY;
  const viewer = options.viewer ?? 'public';
  const exclude = new Set(options.exclude ?? []);

  // Derived values that the profile did not state outright.
  const values: BiodataValues = { ...rawValues };
  if (isEmpty(values.age)) {
    const a = ageFrom(values.dateOfBirth);
    if (a !== undefined) values.age = a;
  }

  const applicable = registry.fields.filter((f) => applies(f.appliesTo, values));
  let filled = 0;

  const bySection = new Map<string, ResolvedField[]>();
  const byKey = new Map<string, ResolvedField>();
  const quickFacts: ResolvedBiodata['quickFacts'] = [];

  for (const field of applicable) {
    const value = values[field.key];
    if (isEmpty(value)) continue;
    filled++;
    if (!visibleAt(field, viewer)) continue;

    const rows = field.type === 'repeater' ? resolveRows(field, value) : undefined;
    const display = field.type === 'repeater'
      ? (rows ?? []).map((r) => r.primary).join(' · ')
      : formatField(field, value);
    if (!display && !rows) continue;

    const resolved: ResolvedField = {
      key: field.key,
      label: field.label,
      short: field.shortLabel ?? field.label,
      group: field.group,
      type: field.type,
      icon: field.icon,
      tone: field.tone,
      display,
      raw: value,
      rows,
    };
    byKey.set(field.key, resolved);
    // `surfaces` governs the section body only. A field kept out of the
    // broadcast's pages -- age, height, complexion -- still reaches its icon
    // grid below, because that is a different channel, not a different field.
    if (onSurface(field, options.surface)) {
      const list = bySection.get(field.section) ?? [];
      list.push(resolved);
      bySection.set(field.section, list);
    }

    if (field.quickFact) {
      quickFacts.push({
        key: field.key,
        label: field.shortLabel ?? field.label,
        icon: field.icon,
        display: field.type === 'select'
          ? optionShort(field.options, value)
          : field.type === 'height'
            ? formatHeight(value).replace(/ \(.*\)$/, '')
            : field.type === 'number' && field.key === 'age'
              ? `${value}y`
              : display,
      });
    }
  }

  // "Father's occupation" is not a row of its own -- it is what the father
  // does. Folding happens here, once, so every presenter inherits it.
  const folded = new Set<string>();
  for (const field of applicable) {
    if (!field.pairWith) continue;
    const self = byKey.get(field.key);
    const target = byKey.get(field.pairWith);
    if (!self || !target) continue;
    target.note = target.note ? `${target.note} · ${self.display}` : self.display;
    folded.add(field.key);
  }
  if (folded.size) {
    for (const [id, list] of bySection) {
      bySection.set(id, list.filter((f) => !folded.has(f.key)));
    }
  }

  const sections: ResolvedSection[] = registry.sections
    .filter((s) => !exclude.has(s.id))
    .filter((s) => onSurface(s, options.surface))
    .filter((s) => applies(s.appliesTo, values))
    .filter((s) => visibleAt(s, viewer))
    .map((s) => ({
      id: s.id,
      title: s.title,
      subtitle: s.subtitle,
      icon: s.icon,
      layout: s.layout,
      fields: (bySection.get(s.id) ?? []).sort(
        (a, b) => order(registry, a.key) - order(registry, b.key),
      ),
      groups: groupFields(
        (bySection.get(s.id) ?? []).sort(
          (a, b) => order(registry, a.key) - order(registry, b.key),
        ),
      ),
    }))
    // The rule: an empty section does not exist.
    .filter((s) => s.fields.length > 0)
    .sort((a, b) => sectionOrder(registry, a.id) - sectionOrder(registry, b.id));

  return {
    sections,
    quickFacts: quickFacts.slice(0, options.maxQuickFacts ?? 8),
    filledCount: filled,
    applicableCount: applicable.length,
    completeness: applicable.length ? Math.round((filled / applicable.length) * 100) : 0,
  };
}

/**
 * Splits a section's fields by their `group`, keeping first-seen order and
 * letting ungrouped fields lead. A section where nothing is grouped comes
 * back as one unlabelled group, so presenters can render `groups` blindly.
 */
function groupFields(fields: ResolvedField[]): ResolvedGroup[] {
  const groups: ResolvedGroup[] = [];
  for (const f of fields) {
    const found = groups.find((g) => g.label === f.group);
    if (found) found.fields.push(f);
    else groups.push({ label: f.group, fields: [f] });
  }
  return groups;
}

function order(registry: Registry, key: string): number {
  return registry.fields.find((f) => f.key === key)?.order ?? 9999;
}
function sectionOrder(registry: Registry, id: string): number {
  return registry.sections.find((s) => s.id === id)?.order ?? 9999;
}

/**
 * The form's view of the registry: every applicable field, grouped, in order,
 * with nothing marked required -- because nothing is.
 */
export function formSections(values: BiodataValues, registry: Registry = REGISTRY) {
  return registry.sections
    .filter((s) => applies(s.appliesTo, values))
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      section: s,
      fields: registry.fields
        .filter((x) => x.section === s.id && applies(x.appliesTo, values))
        .sort((a, b) => a.order - b.order),
    }))
    .filter((g) => g.fields.length > 0);
}

/** A one-line summary for cards and search results, built from whatever exists. */
export function headline(values: BiodataValues, registry: Registry = REGISTRY): string {
  const pick = (key: string) => {
    const fd = registry.fields.find((x) => x.key === key);
    const v = values[key];
    return fd && !isEmpty(v) ? formatField(fd, v) : '';
  };
  const age = isEmpty(values.age) ? ageFrom(values.dateOfBirth) : values.age;
  return [
    age ? `${age} yrs` : '',
    formatHeight(values.heightCm).replace(/ \(.*\)$/, ''),
    pick('community'),
    pick('highestQualification') || pick('occupation'),
    pick('city'),
  ].filter(Boolean).join(' · ');
}
