'use client';
import { useMemo, useState } from 'react';
import { type DeckProfile, isUrgent } from '../_shared';
import { extractBioFields } from '@/lib/bio-extract';
import { type BioSection, normalizeSections } from '@/lib/biodata-schema';
import { LIVE, accentFor } from '@/lib/live-theme';
import ReportModal from '@/components/ReportModal';

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
}

/**
 * Build renderable sections from an ad.
 *
 * Everything is handed to `normalizeSections`, the same pruner the authored
 * biodata.json goes through — so empty values and empty sections disappear by
 * construction and the sheet can never render a blank slot.
 */
function parseBiodata(body: string): ParsedBiodata {
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
    { heading: 'Personal Details',     type: 'fields',   items: personal },
    { heading: 'Educational Details',  type: 'timeline', items: education },
    { heading: 'Education & Career',   type: 'fields',   items: prof },
    { heading: 'Religious Background', type: 'fields',   items: religious },
    { heading: 'Family Details',       type: 'people',   items: family.flatMap(parseFamily) },
    { heading: 'Looking For',          type: 'chips',    items: lookingFor },
    { heading: 'Other Details',        type: 'fields',   items: other },
  ]);

  // About carries the advertiser's original wording verbatim. It is always
  // appended, which is what lets the sheet be the only view — an ad that
  // yields no fields still shows its full text here.
  const withAbout = about
    ? [...sections, ...normalizeSections([{ heading: 'About', type: 'text', text: about }])]
    : sections;

  return { sections: withAbout };
}

export default function BiodataModal({ profile, authored, onClose }: {
  profile: DeckProfile;
  /** Hand-authored sections from /nizam, if this profile has any. */
  authored?: unknown;
  onClose: () => void;
}) {
  const isFemale = profile.gender === 'female';
  const { accent, accentBg, accentLine } = accentFor(isFemale);
  const [igOpen,    setIgOpen]    = useState(false);
  const [reporting, setReporting] = useState(false);

  // Authored biodata wins outright: someone read the ad and wrote this down, so
  // it beats anything the regex extractor infers. Parsing is the fallback, and
  // is memoised because it runs the extractor over the whole ad.



  return (
    <div className="fixed inset-0 z-200 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <section className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          // The show's ground, with its warm bloom at the top -- the same
          // surface the broadcast and the published frames are painted on.
          background: `radial-gradient(120% 62% at 50% 0%, ${LIVE.raise} 0%, ${LIVE.ground} 56%, ${LIVE.ground2} 100%)`,
          border: `1px solid ${LIVE.hairline}`,
          maxHeight: '90vh', overflowY: 'auto', zIndex: 1,
        }}>

        {/* One header, not three. The dark bar, the avatar identity row below
            it and the Summary/Title field were all restating the same thing —
            gender and profile number — so they are merged here. */}
        <div className="sticky top-0 flex items-center gap-3 px-5 py-3"
          style={{
            background: LIVE.ground2, color: LIVE.cream,
            borderBottom: `1px solid ${LIVE.goldDim}`, zIndex: 2,
          }}>
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
            style={{ background: accentBg, color: accent, border: `1px solid ${accentLine}` }}>
            {isFemale ? '♀' : '♂'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold truncate">{isFemale ? 'Bride (دلہن)' : 'Groom (دولہا)'}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[11px] font-semibold tracking-[0.14em]"
                style={{ color: LIVE.muted, fontFamily: LIVE.mono }}>IR #{profile._num}</p>
              {isUrgent(profile.body) && (
                <span className="rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em]"
                  style={{ background: LIVE.roseDim, color: LIVE.rose, border: `1px solid rgba(240,114,140,0.45)` }}>Urgent</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {profile.instagram_post_id && (
              <button onClick={() => setIgOpen(v => !v)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(247,239,230,0.10)', color: LIVE.cream }}
                aria-label="View Instagram post">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/>
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
                </svg>
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold"
              style={{ background: 'rgba(247,239,230,0.10)', color: LIVE.cream }}>×</button>
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
          {/* One view only. There is no raw fallback because there is nothing
              for it to add: an ad that yields no structured fields still
              produces an About section carrying the complete original text. */}
          {/* The post image, nothing else. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/* Keyed on `id`, not `_num`: _num is the row's position in the
              currently filtered list and shifts the moment anyone filters, so
              an image keyed on it would follow the wrong profile. */}
          <img
            src={`/api/post-image/IR-${profile.id ?? profile._num}`}
            alt={`Biodata IR #${profile._num}`}
            className="w-full rounded-2xl"
            style={{ display: 'block' }}
          />

          <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: `1px solid ${LIVE.goldDim}` }}>
            <p className="text-xs" style={{ color: LIVE.muted }}>instarishta.me</p>
            <p className="text-xs font-bold tracking-[0.14em]"
              style={{ color: LIVE.gold, fontFamily: LIVE.mono }}>IR #{profile._num}</p>
          </div>

          <button onClick={() => setReporting(true)}
            className="mt-3 text-xs font-semibold flex items-center gap-1.5"
            style={{ color: LIVE.muted }}>
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
