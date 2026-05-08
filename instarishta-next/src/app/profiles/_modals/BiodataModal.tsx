'use client';
import { useState } from 'react';
import { type DeckProfile, textDir, URDU_FONT, isUrgent } from '../_shared';

interface BioRow     { label: string; value: string }
interface BioSection { heading: string; rows: BioRow[] }
interface BioSchema  { sections: BioSection[]; about: string }

const FIELD_RE = /^([A-Za-z /؀-ۿ]+?)\s*:\s*(.+)$/;

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

  const lines = body.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(FIELD_RE);
    if (m) {
      const key = m[1].trim().toLowerCase();
      const row: BioRow = { label: m[1].trim(), value: m[2].trim() };
      if (PERSONAL.some(k => key.includes(k)))   personal.push(row);
      else if (PROF.some(k => key.includes(k)))   prof.push(row);
      else if (RELIGIOUS.some(k => key.includes(k))) religious.push(row);
      else if (FAMILY.some(k => key.includes(k))) family.push(row);
      else other.push(row);
    } else {
      aboutLines.push(line);
    }
  }

  const sections: BioSection[] = [
    personal.length  && { heading: 'Personal',          rows: personal  },
    prof.length      && { heading: 'Education & Career', rows: prof     },
    religious.length && { heading: 'Religious',          rows: religious },
    family.length    && { heading: 'Family',             rows: family    },
    other.length     && { heading: 'Other Details',      rows: other     },
  ].filter(Boolean) as BioSection[];

  if (title && !body.toLowerCase().includes(title.toLowerCase().slice(0, 15))) {
    sections.unshift({ heading: 'Summary', rows: [{ label: 'Title', value: title }] });
  }

  return { sections, about: aboutLines.join('\n').trim() };
}

function BiodataStructured({ schema, isFemale }: { schema: BioSchema; isFemale: boolean }) {
  const accent = isFemale ? '#C0397A' : '#006241';
  const accentBg = isFemale ? '#FDF0F5' : '#EEF6F0';

  return (
    <div className="flex flex-col gap-3">
      {schema.sections.map(sec => (
        <div key={sec.heading} className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid #F0ECE8' }}>
          <div className="px-4 py-2" style={{ background: accentBg }}>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em]" style={{ color: accent }}>{sec.heading}</p>
          </div>
          <div className="divide-y" style={{ borderColor: '#F7F5F3' }}>
            {sec.rows.map(row => (
              <div key={row.label} className="flex items-start gap-3 px-4 py-2.5">
                <span className="text-[0.7rem] font-semibold shrink-0 w-28" style={{ color: '#A0A0A0' }}>{row.label}</span>
                <span className="text-[0.78rem] font-medium flex-1"
                  dir={textDir(row.value)}
                  style={{ color: '#141413', fontFamily: textDir(row.value) === 'rtl' ? URDU_FONT : 'inherit' }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

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
  const schema = parseBiodata(profile.title, profile.body);

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

          {bioView === 'structured' ? (
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
        </div>
      </section>
    </div>
  );
}
