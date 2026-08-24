/**
 * The biodata section model — the single shape the UI renders.
 *
 * Two producers feed it and the renderer can't tell them apart:
 *   1. hand-authored biodata.json, keyed by profile id
 *   2. the regex extractor over an unlabelled Urdu ad (bio-extract.ts)
 *
 * Sections are data, not code: headings, order and layout all come from the
 * producer, so adding a section to the JSON needs no change here.
 *
 * The invariant the UI depends on: **nothing empty survives normalisation.**
 * Blank values, empty sections, and unknown types are dropped rather than
 * rendered as a placeholder, so the sheet never shows a dash or a bare heading.
 */

export type IconName =
  | 'user' | 'calendar' | 'pin' | 'globe' | 'ruler' | 'briefcase'
  | 'graduation' | 'money' | 'star' | 'book' | 'users' | 'heart' | 'info';

const ICON_NAMES: readonly IconName[] = [
  'user', 'calendar', 'pin', 'globe', 'ruler', 'briefcase',
  'graduation', 'money', 'star', 'book', 'users', 'heart', 'info',
];

export interface BioField  { label: string; value: string; icon?: IconName }
export interface BioEntry  { title: string; subtitle?: string; meta?: string }
export interface BioPerson { name: string; role?: string; detail?: string }

export type BioSection =
  | { heading: string; type: 'fields';   items: BioField[] }
  | { heading: string; type: 'timeline'; items: BioEntry[] }
  | { heading: string; type: 'people';   items: BioPerson[] }
  | { heading: string; type: 'chips';    items: string[] }
  | { heading: string; type: 'text';     text: string };

/** Keyword → icon, first hit wins. Used when the author omits `icon`. */
const ICONS: [RegExp, IconName][] = [
  [/age|birth|date/i,                            'calendar'],
  [/city|address|area|residence|state/i,         'pin'],
  [/nationality|country|citizen|visa|location/i, 'globe'],
  [/height|weight|complexion|build|physique/i,   'ruler'],
  [/education|qualification|degree/i,            'graduation'],
  [/occupation|profession|job|work|employer/i,   'briefcase'],
  [/income|salary|earning/i,                     'money'],
  [/sect|maslak|namaz|prayer|religious|mazhab/i, 'star'],
  [/quran|hafiz|hifz|deen|aalim/i,               'book'],
  [/guardian|wali|father|mother|sibling|brother|sister|family/i, 'users'],
  [/looking|seeking|expectation|requirement|partner/i,           'heart'],
  [/gender|name|tongue|language|marital/i,       'user'],
];

export function iconFor(label: string): IconName {
  return ICONS.find(([rx]) => rx.test(label))?.[1] ?? 'info';
}

// ── Normalisation ────────────────────────────────────────────────────────────
// biodata.json is hand-authored, so it is parsed defensively: anything that
// isn't the shape we expect is skipped rather than thrown on. A typo in one
// section must not blank the whole sheet.

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function asIcon(v: unknown): IconName | undefined {
  return ICON_NAMES.includes(v as IconName) ? (v as IconName) : undefined;
}

function normalizeOne(raw: unknown): BioSection | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const heading = str(s.heading);
  if (!heading) return null;

  const rawItems = Array.isArray(s.items) ? s.items : [];

  switch (str(s.type) || 'fields') {
    case 'fields': {
      const items = rawItems.flatMap((i): BioField[] => {
        if (!i || typeof i !== 'object') return [];
        const o = i as Record<string, unknown>;
        const label = str(o.label), value = str(o.value);
        // A field with no value is the exact thing we refuse to render.
        return label && value ? [{ label, value, icon: asIcon(o.icon) ?? iconFor(label) }] : [];
      });
      return items.length ? { heading, type: 'fields', items } : null;
    }
    case 'timeline': {
      const items = rawItems.flatMap((i): BioEntry[] => {
        if (!i || typeof i !== 'object') return [];
        const o = i as Record<string, unknown>;
        const title = str(o.title);
        return title
          ? [{ title, subtitle: str(o.subtitle) || undefined, meta: str(o.meta) || undefined }]
          : [];
      });
      return items.length ? { heading, type: 'timeline', items } : null;
    }
    case 'people': {
      const items = rawItems.flatMap((i): BioPerson[] => {
        if (!i || typeof i !== 'object') return [];
        const o = i as Record<string, unknown>;
        const name = str(o.name);
        return name
          ? [{ name, role: str(o.role) || undefined, detail: str(o.detail) || undefined }]
          : [];
      });
      return items.length ? { heading, type: 'people', items } : null;
    }
    case 'chips': {
      const items = rawItems.map(str).filter(Boolean);
      return items.length ? { heading, type: 'chips', items } : null;
    }
    case 'text': {
      const text = str(s.text);
      return text ? { heading, type: 'text', text } : null;
    }
    default:
      return null;   // unknown type — skip rather than guess
  }
}

/** Prune arbitrary input down to renderable sections. Never throws. */
export function normalizeSections(input: unknown): BioSection[] {
  const raw = Array.isArray(input)
    ? input
    : Array.isArray((input as { sections?: unknown })?.sections)
      ? (input as { sections: unknown[] }).sections
      : [];
  return raw.map(normalizeOne).filter((s): s is BioSection => s !== null);
}

/** Convenience for producers building `fields` sections from loose pairs. */
export function fieldsSection(
  heading: string,
  pairs: { label: string; value: string }[],
): BioSection | null {
  return normalizeOne({ heading, type: 'fields', items: pairs });
}
