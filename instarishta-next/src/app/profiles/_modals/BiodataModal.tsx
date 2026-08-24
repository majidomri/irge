'use client';
import { useMemo, useState } from 'react';
import { type DeckProfile, textDir, URDU_FONT, isUrgent } from '../_shared';
import { extractBioFields } from '@/lib/bio-extract';
import { type BioSection, normalizeSections } from '@/lib/biodata-schema';
import BiodataSheet from './BiodataSheet';
import ReportModal from './ReportModal';

interface BioRow { label: string; value: string }

const FIELD_RE   = /^([A-Za-z /؀-ۿ]+?)\s*:\s*(.+)$/;
const YEAR_RE    = /\b(?:19|20)\d{2}\b/;
const SIBLING_RE = /(\d+)\s*(brothers?|sisters?|بھائی|بہن)(?:[^\d\n]{0,20}?(\d+)\s*married)?/gi;

/**
 * Split an `Education:` value into timeline entries. Free text gives us no
 * guarantees, so an entry only counts as structured when it yields an
 * institution or a year — otherwise the caller keeps the plain row instead of
 * rendering a timeline of one bare degree.
 */
function parseEduEntries(value: string) {
  return value
    .split(/\s*[;|]\s*/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const year = part.match(YEAR_RE)?.[0];
      const rest = year ? part.replace(year, ' ') : part;
      const bits = rest.split(/\s*[,،]\s*/).map(b => b.trim()).filter(Boolean);
      return { title: bits[0] ?? part, subtitle: bits.slice(1).join(', '), meta: year ?? '' };
    })
    .filter(e => e.title);
}

function isStructuredEdu(entries: { subtitle: string; meta: string }[]): boolean {
  return entries.length > 1 || Boolean(entries[0]?.subtitle || entries[0]?.meta);
}

/**
 * Turn a family row into people entries. A `Siblings:` value may pack several
 * tallies ("2 Brothers 1 married, 1 Sister"), so it can expand to many rows;
 * a `Father:`/`Wali:` row maps to exactly one.
 */
function parseFamily(row: BioRow) {
  const siblings = [...row.value.matchAll(SIBLING_RE)].map(m => {
    const [, count, relation, married] = m;
    const label = relation.replace(/s$/i, '');
    return {
      name:   `${count} ${label}${Number(count) > 1 ? 's' : ''}`,
      role:   'Siblings',
      detail: married ? `${married} married` : '',
    };
  });
  return siblings.length ? siblings : [{ name: row.value, role: row.label, detail: '' }];
}

export interface ParsedBiodata {
  sections: BioSection[];
  /** False when the Card view would show no more than Raw — hides the toggle. */
  hasStructured: boolean;
}

/**
 * Build renderable sections from an ad.
 *
 * Everything is handed to `normalizeSections`, the same pruner the authored
 * biodata.json goes through — so empty values and empty sections disappear by
 * construction and the sheet can never render a blank slot.
 */
function parseBiodata(title: string, body: string): ParsedBiodata {
  const PERSONAL  = ['gender','age','city','nationality','mother tongue','language','height','weight','complexion','marital'];
  const PROF      = ['education','qualification','occupation','profession','job','income','salary','earning','employer'];
  const RELIGIOUS = ['sect','maslak','quran','hafiz','namaz','prayer','religious'];
  const FAMILY    = ['guardian','wali','father','mother','siblings','brothers','sisters','family'];
  const LOOKING   = /looking|seeking|expectation|requirement|partner/i;

  const personal: BioRow[]  = [];
  const prof: BioRow[]      = [];
  const religious: BioRow[] = [];
  const family: BioRow[]    = [];
  const other: BioRow[]     = [];
  const aboutLines: string[] = [];

  const file = (label: string, value: string) => {
    const key = label.toLowerCase();
    const row = { label, value };
    if (PERSONAL.some(k => key.includes(k)))       personal.push(row);
    else if (PROF.some(k => key.includes(k)))      prof.push(row);
    else if (RELIGIOUS.some(k => key.includes(k))) religious.push(row);
    else if (FAMILY.some(k => key.includes(k)))    family.push(row);
    else other.push(row);
  };

  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(FIELD_RE);
    if (m) file(m[1].trim(), m[2].trim());
    else aboutLines.push(line);
  }

  // Feed-sourced ads are unlabelled Urdu prose, so the loop above files nothing.
  // Fall back to regex extraction over the raw text — but only when the ad
  // yielded no labelled lines at all, since a /biodata form submission is
  // authoritative and must not be second-guessed by heuristics.
  if (!personal.length && !prof.length && !religious.length && !family.length && !other.length) {
    for (const f of extractBioFields(body)) file(f.label, f.value);
  }

  // Promote rows into richer presentations, splicing each out of its bucket so
  // nothing renders twice.
  const lookingFor: string[] = [];
  for (const bucket of [other, personal, prof, religious, family]) {
    for (let i = bucket.length - 1; i >= 0; i--) {
      if (!LOOKING.test(bucket[i].label)) continue;
      lookingFor.unshift(...bucket[i].value.split(/\s*[,،/]\s*/).map(t => t.trim()).filter(Boolean));
      bucket.splice(i, 1);
    }
  }

  const education: { title: string; subtitle: string; meta: string }[] = [];
  for (let i = prof.length - 1; i >= 0; i--) {
    if (!/education|qualification|degree/i.test(prof[i].label)) continue;
    const entries = parseEduEntries(prof[i].value);
    if (!isStructuredEdu(entries)) continue;   // too thin — leave it as a row
    education.unshift(...entries);
    prof.splice(i, 1);
  }

  const about = aboutLines.join('\n').trim();

  const sections = normalizeSections([
    { heading: 'Summary',              type: 'fields',   items: title ? [{ label: 'Title', value: title }] : [] },
    { heading: 'Personal Details',     type: 'fields',   items: personal },
    { heading: 'Educational Details',  type: 'timeline', items: education },
    { heading: 'Education & Career',   type: 'fields',   items: prof },
    { heading: 'Religious Background', type: 'fields',   items: religious },
    { heading: 'Family Details',       type: 'people',   items: family.flatMap(parseFamily) },
    { heading: 'Looking For',          type: 'chips',    items: lookingFor },
    { heading: 'Other Details',        type: 'fields',   items: other },
  ]);

  // Summary is just the ad headline, so it doesn't count as structure: a sheet
  // of Summary + About shows nothing Raw doesn't already.
  const hasStructured = sections.some(s => s.heading !== 'Summary');

  const withAbout = about
    ? [...sections, ...normalizeSections([{ heading: 'About', type: 'text', text: about }])]
    : sections;

  return { sections: withAbout, hasStructured };
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
            <BiodataSheet sections={schema.sections} isFemale={isFemale} />
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
