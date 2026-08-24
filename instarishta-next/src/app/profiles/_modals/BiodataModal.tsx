'use client';
import { useMemo, useState } from 'react';
import { type DeckProfile, textDir, URDU_FONT, isUrgent } from '../_shared';
import { extractBioFields } from '@/lib/bio-extract';
import ReportModal from './ReportModal';

type IconName =
  | 'user' | 'calendar' | 'pin' | 'globe' | 'ruler' | 'briefcase'
  | 'graduation' | 'money' | 'star' | 'book' | 'users' | 'heart' | 'info';

interface BioRow     { label: string; value: string; icon: IconName }
/** A single qualification, split out of an `Education:` line when it carries
 *  enough structure (an institution or a year) to be worth a timeline entry. */
interface EduEntry   { degree: string; institution?: string; year?: string }
/** Father / mother / guardian, or a sibling tally like "2 Brothers (1 married)". */
interface FamilyMember { role: string; detail?: string; initial: string }
interface BioSchema  {
  /** Ad headline, shown at the top of the sheet. */
  title:      string;
  /** Every parsed row, in parse order. The sheet pulls named slots out of this
   *  by regex and renders whatever is left over under "Additional Details". */
  all:        BioRow[];
  education:  EduEntry[];
  family:     FamilyMember[];
  lookingFor: string[];
  /** False when the Card view would show no more than Raw — hides the toggle. */
  hasStructured: boolean;
  about:      string;
}

const FIELD_RE = /^([A-Za-z /؀-ۿ]+?)\s*:\s*(.+)$/;
const YEAR_RE  = /\b(?:19|20)\d{2}\b/;
const SIBLING_RE = /(\d+)\s*(brothers?|sisters?|بھائی|بہن)(?:[^\d\n]{0,20}?(\d+)\s*married)?/gi;

/** Keyword → icon. First hit wins, so order matters for overlapping words. */
const ICONS: [RegExp, IconName][] = [
  [/age|birth|date/i,                'calendar'],
  [/city|address|area|residence/i,   'pin'],
  [/nationality|country|citizen/i,   'globe'],
  [/height|weight|complexion|build/i,'ruler'],
  [/education|qualification|degree/i,'graduation'],
  [/occupation|profession|job|work/i,'briefcase'],
  [/income|salary|earning/i,         'money'],
  [/sect|maslak|namaz|prayer|religious|mazhab/i, 'star'],
  [/quran|hafiz|hifz|deen|aalim/i,   'book'],
  [/guardian|wali|father|mother|sibling|brother|sister|family/i, 'users'],
  [/looking|seeking|expectation|requirement|partner/i, 'heart'],
  [/gender|name|tongue|language|marital/i, 'user'],
];

function iconFor(label: string): IconName {
  return ICONS.find(([rx]) => rx.test(label))?.[1] ?? 'info';
}

/**
 * Split an `Education:` value into timeline entries. Free text gives us no
 * guarantees, so an entry only counts as structured when it yields an
 * institution or a year — otherwise the caller keeps the plain row instead of
 * rendering a timeline of one bare degree.
 */
function parseEduEntries(value: string): EduEntry[] {
  return value
    .split(/\s*[;|]\s*/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const year = part.match(YEAR_RE)?.[0];
      const rest = year ? part.replace(year, ' ') : part;
      const bits = rest.split(/\s*[,،]\s*/).map(s => s.trim()).filter(Boolean);
      return {
        degree:      bits[0] ?? part,
        institution: bits.slice(1).join(', ') || undefined,
        year,
      };
    })
    .filter(e => e.degree);
}

function isStructuredEdu(entries: EduEntry[]): boolean {
  return entries.length > 1 || Boolean(entries[0]?.institution || entries[0]?.year);
}

/**
 * Turn a family row into avatar entries. A `Siblings:` value may pack several
 * tallies ("2 Brothers 1 married, 1 Sister"), so it can expand to many members;
 * a `Father:`/`Wali:` row maps to exactly one.
 */
function parseFamilyMembers(row: BioRow): FamilyMember[] {
  const siblings: FamilyMember[] = [];
  for (const m of row.value.matchAll(SIBLING_RE)) {
    const [, count, relation, married] = m;
    const label = relation.replace(/s$/i, '');
    siblings.push({
      role:    `${count} ${label}${Number(count) > 1 ? 's' : ''}`,
      detail:  married ? `${married} married` : undefined,
      initial: label.charAt(0).toUpperCase(),
    });
  }
  if (siblings.length) return siblings;

  return [{
    role:    row.value,
    detail:  row.label,
    initial: row.label.trim().charAt(0).toUpperCase(),
  }];
}

function parseBiodata(title: string, body: string): BioSchema {
  const PERSONAL  = ['gender','age','city','nationality','mother tongue','language','height','weight','complexion'];
  const PROF      = ['education','qualification','occupation','profession','job','income','salary','earning'];
  const RELIGIOUS = ['sect','maslak','quran','hafiz','namaz','prayer','religious'];
  const FAMILY    = ['guardian','wali','father','mother','siblings','brothers','sisters','family'];

  const personal: BioRow[]  = [];
  const prof: BioRow[]      = [];
  const religious: BioRow[] = [];
  const family: BioRow[]    = [];
  const other: BioRow[]     = [];
  const aboutLines: string[] = [];

  const all: BioRow[] = [];

  const file = (label: string, value: string) => {
    const key = label.toLowerCase();
    const row: BioRow = { label, value, icon: iconFor(key) };
    all.push(row);
    if (PERSONAL.some(k => key.includes(k)))       personal.push(row);
    else if (PROF.some(k => key.includes(k)))      prof.push(row);
    else if (RELIGIOUS.some(k => key.includes(k))) religious.push(row);
    else if (FAMILY.some(k => key.includes(k)))    family.push(row);
    else other.push(row);
  };

  const lines = body.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(FIELD_RE);
    if (m) file(m[1].trim(), m[2].trim());
    else aboutLines.push(line);
  }

  // Feed-sourced ads are unlabelled Urdu prose, so the loop above files nothing.
  // Fall back to regex extraction over the raw text. Only when the ad yielded no
  // labelled lines at all — a form-submitted biodata is authoritative and must
  // not be second-guessed by heuristics.
  const labelled = personal.length + prof.length + religious.length + family.length + other.length;
  if (labelled === 0) {
    for (const f of extractBioFields(body)) file(f.label, f.value);
  }

  // ── Promote flat rows into the richer presentations ──────────────────────
  // Each promotion REMOVES the row from its bucket so a detail never renders
  // twice (once as a chip/timeline entry and again as a plain label/value).

  const LOOKING_RE = /looking|seeking|expectation|requirement|partner/i;
  const lookingFor: string[] = [];
  for (const bucket of [other, personal, prof, religious, family]) {
    for (let i = bucket.length - 1; i >= 0; i--) {
      if (!LOOKING_RE.test(bucket[i].label)) continue;
      lookingFor.unshift(
        ...bucket[i].value.split(/\s*[,،/]\s*/).map(s => s.trim()).filter(Boolean),
      );
      bucket.splice(i, 1);
    }
  }

  const education: EduEntry[] = [];
  for (let i = prof.length - 1; i >= 0; i--) {
    if (!/education|qualification|degree/i.test(prof[i].label)) continue;
    const entries = parseEduEntries(prof[i].value);
    if (!isStructuredEdu(entries)) continue;   // too thin — leave it as a row
    education.unshift(...entries);
    prof.splice(i, 1);
  }

  const familyMembers = family.flatMap(parseFamilyMembers);

  // Whether the Card view has anything Raw doesn't. Computed BEFORE the Summary
  // row is added below, since Summary is synthesised from the title and would
  // otherwise make every profile look structured.
  const hasStructured =
    personal.length > 0 || prof.length > 0 || religious.length > 0 ||
    other.length > 0 || education.length > 0 ||
    familyMembers.length > 0 || lookingFor.length > 0;

  // Rows promoted into the education timeline, the family avatars, or the
  // Looking For chips were spliced out of their bucket (or, for family, are
  // rendered as avatars instead). Keeping `all` to the rows still awaiting a
  // home is what stops the sheet's catch-all from repeating them.
  const survivors = new Set([...personal, ...prof, ...religious, ...other]);

  return {
    title,
    all: all.filter(r => survivors.has(r)),
    education,
    family: familyMembers,
    lookingFor,
    hasStructured,
    about: aboutLines.join('\n').trim(),
  };
}

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  user:       <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  calendar:   <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  pin:        <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
  globe:      <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" /></>,
  ruler:      <><path d="M3 12h18M7 8v8M12 8v8M17 8v8" /></>,
  briefcase:  <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></>,
  graduation: <><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5" /></>,
  money:      <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h5M9.5 14.5h5" /></>,
  star:       <><path d="m12 2 3 6.5 7 1-5 5 1.2 7L12 18l-6.2 3.5L7 14.5l-5-5 7-1z" /></>,
  book:       <><path d="M4 4h9a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" /><path d="M20 4h-4a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h5z" /></>,
  users:      <><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /></>,
  heart:      <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.7 1.1-1a5.5 5.5 0 0 0 0-7.7z" /></>,
  info:       <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
};

function BioIcon({ name, color }: { name: IconName; color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="shrink-0 mt-0.5" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

/**
 * One field slot on the sheet. `always` slots render even with no value (as
 * "—"), mirroring RishtaSwipe, which prints N/A for Gotra and Rashi rather than
 * dropping the row — the sheet keeps the same shape for every profile.
 */
interface Slot {
  label: string;
  match: RegExp;
  icon: IconName;
  always?: boolean;
  fallback?: string;
}

const PERSONAL_SLOTS: Slot[] = [
  { label: 'Religion',       match: /religion|مذہب/i,                icon: 'star',      always: true, fallback: 'Islam' },
  { label: 'Caste',          match: /caste|biradari|community/i,     icon: 'users',     always: true },
  { label: 'Age',            match: /\bage\b/i,                      icon: 'calendar',  always: true },
  { label: 'Height',         match: /height/i,                       icon: 'ruler',     always: true },
  { label: 'Marital Status', match: /marital/i,                      icon: 'heart',     always: true },
  { label: 'Occupation',     match: /occupation|profession/i,        icon: 'briefcase' },
  { label: 'Income',         match: /income|salary|earning/i,        icon: 'money' },
  { label: 'Diet',           match: /diet/i,                         icon: 'info' },
  { label: 'Blood Group',    match: /blood/i,                        icon: 'info' },
  { label: 'Physique',       match: /physique|build|complexion/i,    icon: 'user' },
  { label: 'Smoking',        match: /smoking/i,                      icon: 'info' },
  { label: 'Drinking',       match: /drinking/i,                     icon: 'info' },
  { label: 'Birth Date',     match: /birth date|date of birth|dob/i, icon: 'calendar',  always: true },
  { label: 'Birth Time',     match: /birth time|time of birth/i,     icon: 'calendar',  always: true },
  { label: 'Birth Place',    match: /birth place|place of birth/i,   icon: 'pin',       always: true },
];

// Maslak / Namaz / Quran replace RishtaSwipe's Gotra / Rashi / Manglik. Those
// three are Hindu matrimonial concepts (patrilineal clan, Vedic moon sign, Mars
// affliction) with no meaning here, and nothing in the feed or the /biodata form
// could ever fill them. These are the equivalents the form already collects, so
// they live in Religious Background rather than Personal Details.
const RELIGIOUS_SLOTS: Slot[] = [
  { label: 'Sect',             match: /^sect|مسلک/i,        icon: 'star', always: true },
  { label: 'Maslak',           match: /maslak/i,            icon: 'star', always: true },
  { label: 'Namaz',            match: /namaz|prayer/i,      icon: 'star', always: true },
  { label: 'Quran Memorised',  match: /quran|hafiz|hifz/i,  icon: 'book', always: true },
  { label: 'Religious Traits', match: /religious trait/i,   icon: 'book' },
];

const ADDRESS_SLOTS: Slot[] = [
  { label: 'Area',         match: /^area|residence/i,        icon: 'pin',   always: true },
  { label: 'City / State', match: /city|state|location/i,     icon: 'globe', always: true },
  { label: 'Nationality',  match: /nationality|citizenship/i, icon: 'globe' },
  { label: 'Visa Status',  match: /visa/i,                    icon: 'globe' },
];

const EMPTY = '—';

function Field({ label, value, icon, accent }: {
  label: string; value: string; icon: IconName; accent: string;
}) {
  const dir = textDir(value);
  return (
    <div className="flex items-start gap-2.5">
      <BioIcon name={icon} color={accent} />
      <div className="min-w-0 flex-1">
        <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.06em]" style={{ color: '#A0A0A0' }}>
          {label}
        </span>
        {/* dir drives bidi ordering, but text stays start-aligned: the labels
            are left-aligned Latin, and letting an Urdu value float to the
            column's right edge visually detaches it from its label. */}
        <span className="block text-[0.78rem] font-medium"
          dir={dir}
          lang={dir === 'rtl' ? 'ur' : undefined}
          style={{
            color: value ? '#141413' : '#C4C4C4',
            textAlign: 'left',
            fontFamily: dir === 'rtl' ? URDU_FONT : 'inherit',
          }}>
          {value || EMPTY}
        </span>
      </div>
    </div>
  );
}

function Section({ heading, accent, accentBg, children }: {
  heading: string; accent: string; accentBg: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid #F0ECE8' }}>
      <div className="px-4 py-2" style={{ background: accentBg }}>
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em]" style={{ color: accent }}>{heading}</p>
      </div>
      {children}
    </div>
  );
}

/** Two columns above a small phone; one below, so Urdu keeps a usable measure. */
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 px-4 py-3">{children}</div>;
}

function BiodataStructured({ schema, isFemale }: { schema: BioSchema; isFemale: boolean }) {
  const accent = isFemale ? '#C0397A' : '#006241';
  const accentBg = isFemale ? '#FDF0F5' : '#EEF6F0';

  // Each slot claims at most one row, and a claimed row can't be claimed again,
  // so a value shows up in exactly one place on the sheet.
  const claimed = new Set<BioRow>();
  const fill = (slots: Slot[]) => slots.map(slot => {
    const row = schema.all.find(r => !claimed.has(r) && slot.match.test(r.label));
    if (row) claimed.add(row);
    return { slot, value: row?.value ?? slot.fallback ?? '' };
  }).filter(f => f.value || f.slot.always);

  const personal  = fill(PERSONAL_SLOTS);
  const religious = fill(RELIGIOUS_SLOTS);

  // Claim the plain `Education:` row (if the parser left one unstructured) so
  // the Educational Details section can show it instead of Additional Details.
  const eduRow = schema.education.length
    ? undefined
    : schema.all.find(r => !claimed.has(r) && /education|qualification|degree/i.test(r.label));
  if (eduRow) claimed.add(eduRow);
  const educationFallback: EduEntry[] = eduRow ? [{ degree: eduRow.value }] : [{ degree: EMPTY }];

  const address   = fill(ADDRESS_SLOTS);
  const leftover  = schema.all.filter(r => !claimed.has(r));

  return (
    <div className="flex flex-col gap-3">
      {schema.title && (
        <Section accent={accent} accentBg={accentBg} heading="Summary">
          <div className="px-4 py-3">
            <p className="text-[0.85rem] font-bold"
              dir={textDir(schema.title)}
              lang={textDir(schema.title) === 'rtl' ? 'ur' : undefined}
              style={{ color: '#141413', lineHeight: 1.8, fontFamily: textDir(schema.title) === 'rtl' ? URDU_FONT : 'inherit' }}>
              {schema.title}
            </p>
          </div>
        </Section>
      )}

      <Section accent={accent} accentBg={accentBg} heading="Personal Details">
        <Grid>
          {personal.map(f => <Field key={f.slot.label} label={f.slot.label} value={f.value} icon={f.slot.icon} accent={accent} />)}
        </Grid>
      </Section>

      <Section accent={accent} accentBg={accentBg} heading="Religious Background">
        <Grid>
          {religious.map(f => <Field key={f.slot.label} label={f.slot.label} value={f.value} icon={f.slot.icon} accent={accent} />)}
        </Grid>
      </Section>

      <Section accent={accent} accentBg={accentBg} heading="Educational Details">
          <ul className="flex flex-col gap-3 px-4 py-3 m-0 list-none">
            {/* A single unstructured `Education:` row still belongs in this
                section — it renders as a one-entry timeline rather than being
                stranded under Additional Details. */}
            {(schema.education.length ? schema.education : educationFallback).map((edu, i) => (
              <li key={`${edu.degree}-${i}`} className="flex items-start gap-3">
                <span className="rounded-full p-1.5 shrink-0" style={{ background: accentBg }}>
                  <BioIcon name="graduation" color={accent} />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.8rem] font-bold" dir={textDir(edu.degree)}
                    style={{ color: '#141413', fontFamily: textDir(edu.degree) === 'rtl' ? URDU_FONT : 'inherit' }}>
                    {edu.degree}
                  </p>
                  {edu.institution && (
                    <p className="text-[0.72rem]" dir={textDir(edu.institution)}
                      style={{ color: '#696969', fontFamily: textDir(edu.institution) === 'rtl' ? URDU_FONT : 'inherit' }}>
                      {edu.institution}
                    </p>
                  )}
                  {edu.year && <p className="text-[0.65rem]" style={{ color: '#A0A0A0' }}>{edu.year}</p>}
                </div>
              </li>
            ))}
          </ul>
      </Section>

      <Section accent={accent} accentBg={accentBg} heading="Family Details">
        <div className="flex flex-col gap-3 px-4 py-3">
          {(schema.family.length
            ? schema.family
            // Father and Mother are fixed rows on the RishtaSwipe sheet, so they
            // hold their place here even when the ad names nobody.
            : [{ role: EMPTY, detail: 'Father', initial: 'F' },
               { role: EMPTY, detail: 'Mother', initial: 'M' }]
          ).map((m, i) => (
            <div key={`${m.role}-${i}`} className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full flex items-center justify-center text-[0.8rem] font-bold shrink-0"
                style={{ background: accentBg, color: accent }}>
                {m.initial}
              </span>
              <div className="min-w-0">
                <p className="text-[0.78rem] font-semibold" dir={textDir(m.role)}
                  style={{ color: m.role === EMPTY ? '#C4C4C4' : '#141413', fontFamily: textDir(m.role) === 'rtl' ? URDU_FONT : 'inherit' }}>
                  {m.role}
                </p>
                {m.detail && <p className="text-[0.68rem]" style={{ color: '#A0A0A0' }}>{m.detail}</p>}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section accent={accent} accentBg={accentBg} heading="Address">
        <Grid>
          {address.map(f => <Field key={f.slot.label} label={f.slot.label} value={f.value} icon={f.slot.icon} accent={accent} />)}
        </Grid>
      </Section>

      <Section accent={accent} accentBg={accentBg} heading="Looking For">
        {schema.lookingFor.length > 0 ? (
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {schema.lookingFor.map((tag, i) => (
              <span key={`${tag}-${i}`} className="rounded-full px-3 py-1 text-[0.7rem] font-semibold"
                dir={textDir(tag)}
                style={{ background: accentBg, color: accent, fontFamily: textDir(tag) === 'rtl' ? URDU_FONT : 'inherit' }}>
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="px-4 py-3 text-[0.78rem]" style={{ color: '#C4C4C4' }}>
            No partner preferences stated in this ad.
          </p>
        )}
      </Section>

      {leftover.length > 0 && (
        <Section accent={accent} accentBg={accentBg} heading="Additional Details">
          <Grid>
            {leftover.map(row => <Field key={row.label} label={row.label} value={row.value} icon={row.icon} accent={accent} />)}
          </Grid>
        </Section>
      )}

      {schema.about && (
        <div className="rounded-2xl p-4" style={{ background: '#FAFAF9', border: '1.5px solid #F0ECE8' }}>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: '#A0A0A0' }}>About</p>
          <p className="text-sm"
            dir={textDir(schema.about)}
            lang={textDir(schema.about) === 'rtl' ? 'ur' : undefined}
            style={{ color: '#3A3A3A', lineHeight: textDir(schema.about) === 'rtl' ? 2.1 : 1.7, fontFamily: textDir(schema.about) === 'rtl' ? URDU_FONT : 'inherit' }}>
            {schema.about}
          </p>
        </div>
      )}
    </div>
  );
}

export default function BiodataModal({ profile, onClose }: { profile: DeckProfile; onClose: () => void }) {
  const isFemale = profile.gender === 'female';
  const [igOpen,    setIgOpen]    = useState(false);
  const [bioView,   setBioView]   = useState<'raw' | 'structured'>('raw');
  const [reporting, setReporting] = useState(false);
  // Parsing now includes regex extraction over the full ad text, so keep it off
  // the render path — re-running it on every toggle click would be wasteful.
  const schema = useMemo(
    () => parseBiodata(profile.title, profile.body),
    [profile.title, profile.body],
  );

  return (
    <div className="fixed inset-0 z-200 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <section className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: '#fff', maxHeight: '90vh', overflowY: 'auto', zIndex: 1 }}>

        <div className="sticky top-0 flex items-center justify-between px-5 py-3.5" style={{ background: '#1E3932', color: '#fff', zIndex: 2 }}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'rgba(255,255,255,0.55)' }}>InstaRishta Biodata</p>
            <p className="text-sm font-bold">Profile IR #{profile._num}</p>
          </div>
          <div className="flex items-center gap-2">
            {schema.hasStructured && (
              <div className="flex rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }}>
                <button onClick={() => setBioView('raw')}
                  className="px-3 py-1 text-[10px] font-bold transition-colors"
                  style={{ background: bioView === 'raw' ? 'rgba(255,255,255,0.25)' : 'transparent', color: '#fff' }}>
                  Raw
                </button>
                <button onClick={() => setBioView('structured')}
                  className="px-3 py-1 text-[10px] font-bold transition-colors"
                  style={{ background: bioView === 'structured' ? 'rgba(255,255,255,0.25)' : 'transparent', color: '#fff' }}>
                  Card
                </button>
              </div>
            )}
            {profile.instagram_post_id && (
              <button onClick={() => setIgOpen(v => !v)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.15)' }}
                aria-label="View Instagram post">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/>
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
                </svg>
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold"
              style={{ background: 'rgba(255,255,255,0.15)' }}>×</button>
          </div>
        </div>

        {igOpen && profile.instagram_post_id && (
          <div className="px-4 pt-4">
            <iframe
              src={`https://www.instagram.com/p/${profile.instagram_post_id}/embed/`}
              className="w-full rounded-2xl"
              style={{ height: 480, border: 'none' }}
              allowFullScreen
              title="Instagram post"
            />
          </div>
        )}

        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold shrink-0"
              style={{ background: isFemale ? '#FDF0F5' : '#EEF6F0', color: isFemale ? '#C0397A' : '#006241' }}>
              {isFemale ? '♀' : '♂'}
            </div>
            <div>
              <p className="text-sm font-extrabold" style={{ color: '#141413' }}>{isFemale ? 'Bride (دلہن)' : 'Groom (دولہا)'}</p>
              <p className="text-xs mt-0.5" style={{ color: '#A0A0A0' }}>InstaRishta Profile #{profile._num}</p>
              {isUrgent(profile.body) && (
                <span className="inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                  style={{ background: '#FFF3EE', color: '#CF4500' }}>Urgent</span>
              )}
            </div>
          </div>

          {bioView === 'structured' && schema.hasStructured ? (
            <BiodataStructured schema={schema} isFemale={isFemale} />
          ) : (
            <div className="rounded-2xl p-4"
              style={{ background: '#FAFAF9', border: '1.5px solid #F0ECE8' }}>
              <p className="text-base font-bold mb-3"
                dir={textDir(profile.title)}
                lang={textDir(profile.title) === 'rtl' ? 'ur' : undefined}
                style={{ color: '#141413', lineHeight: 1.7, fontFamily: textDir(profile.title) === 'rtl' ? URDU_FONT : 'inherit' }}>
                {profile.title}
              </p>
              <p className="text-sm"
                dir={textDir(profile.body)}
                lang={textDir(profile.body) === 'rtl' ? 'ur' : undefined}
                style={{ color: '#3A3A3A', lineHeight: textDir(profile.body) === 'rtl' ? 2.2 : 1.7, textAlign: 'justify', fontFamily: textDir(profile.body) === 'rtl' ? URDU_FONT : 'inherit' }}>
                {profile.body}
              </p>
            </div>
          )}

          <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: '1px solid #F0ECE8' }}>
            <p className="text-xs" style={{ color: '#A0A0A0' }}>instarishta.me</p>
            <p className="text-xs font-semibold" style={{ color: '#006241' }}>IR #{profile._num}</p>
          </div>

          <button onClick={() => setReporting(true)}
            className="mt-3 text-xs font-semibold flex items-center gap-1.5"
            style={{ color: '#CF4500' }}>
            🚩 Report this profile
          </button>
        </div>
      </section>

      {reporting && (
        <ReportModal
          entityType="profile"
          entityId={profile.id != null ? String(profile.id) : String(profile._num)}
          profileNum={profile._num}
          label={`IR #${profile._num}`}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  );
}
