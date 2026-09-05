'use client';
import { useId } from 'react';
import CountUp from '@/components/ui/CountUp';
import {
  EDUCATION_OPTIONS,
  MARITAL_OPTIONS,
  STATE_OPTIONS,
  COMMUNITY_OPTIONS,
  SORT_OPTIONS,
} from '../_shared';

interface DrawerProps {
  open: boolean; onClose: () => void; onClear: () => void;
  stats: { total: number; male: number; female: number; urgent: number };
  contactLimit?: number;
  idFilter: string; setIdFilter: (v: string) => void;
  gender: string; setGender: (v: string) => void;
  ageMin: number; setAgeMin: (v: number) => void;
  ageMax: number; setAgeMax: (v: number) => void;
  state: string; setState: (v: string) => void;
  community: string; setCommunity: (v: string) => void;
  education: string; setEducation: (v: string) => void;
  marital: string; setMarital: (v: string) => void;
  sort: string; setSort: (v: string) => void;
  /**
   * The credit line. Optional because the channel feed reuses this drawer and
   * has no contact credits to spend -- omit it and the strip is not rendered.
   */
  remaining?: number; resetLabel?: string; isAnon?: boolean;
  /**
   * A bottom sheet on a phone either way. `right-on-desktop` also docks it to
   * the right edge from md up, full height, which is what the channel feed
   * wants of it on a mouse-driven screen.
   */
  side?: 'bottom' | 'right-on-desktop';
}

function DualRangeSlider({ valueMin, valueMax, onMin, onMax }: {
  valueMin: number; valueMax: number;
  onMin: (v: number) => void; onMax: (v: number) => void;
}) {
  const MIN = 18, MAX = 60;
  const pct = (v: number) => ((v - MIN) / (MAX - MIN)) * 100;
  const minPct = pct(valueMin);
  const maxPct = pct(valueMax);
  return (
    <div className="relative" style={{ height: 28, marginTop: 6 }}>
      <div className="absolute inset-x-0 rounded-full" style={{ top: 10, height: 4, background: '#E8E4E0' }} />
      <div className="absolute rounded-full" style={{ top: 10, height: 4, background: '#006241', left: `${minPct}%`, right: `${100 - maxPct}%` }} />
      {/* The visible thumbs are the divs below; these inputs are the actual
          controls and are transparent, so without a name they are two
          unlabelled sliders to anyone not looking at the screen. */}
      <input type="range" min={MIN} max={MAX} value={valueMin}
        aria-label="Minimum age"
        onChange={e => onMin(Math.min(+e.target.value, valueMax - 1))}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
        style={{ height: 28, zIndex: valueMin > (MIN + MAX) / 2 ? 5 : 3 }} />
      <input type="range" min={MIN} max={MAX} value={valueMax}
        aria-label="Maximum age"
        onChange={e => onMax(Math.max(+e.target.value, valueMin + 1))}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
        style={{ height: 28, zIndex: valueMin > (MIN + MAX) / 2 ? 3 : 5 }} />
      <div className="absolute pointer-events-none rounded-full"
        style={{ top: 4, left: `calc(${minPct}% - 8px)`, width: 16, height: 16, background: '#fff', border: '2px solid #006241', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', zIndex: 6 }} />
      <div className="absolute pointer-events-none rounded-full"
        style={{ top: 4, left: `calc(${maxPct}% - 8px)`, width: 16, height: 16, background: '#fff', border: '2px solid #006241', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', zIndex: 6 }} />
    </div>
  );
}

function CSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  /* A <p> beside a <select> names nothing: Lighthouse flagged every one of
     these as an unlabelled form element. `useId` keeps the pair unique even
     though this drawer renders five of them, and now the channel feed too. */
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[10px] font-semibold uppercase tracking-[0.05em] mb-1" style={{ color: '#A0A0A0' }}>{label}</label>
      <select id={id} value={value} onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg px-2.5 py-2 text-xs border outline-none"
        style={{ borderColor: '#E0DBD6', background: '#FAF9F8', color: '#141413' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export default function FilterDrawer(props: DrawerProps) {
  const { open, onClose, onClear, stats,
    idFilter, setIdFilter, gender, setGender,
    ageMin, setAgeMin, ageMax, setAgeMax,
    state, setState, community, setCommunity,
    education, setEducation, marital, setMarital,
    sort, setSort, remaining, resetLabel, side = 'bottom' } = props;
  const docksRight = side === 'right-on-desktop';

  const STAT_COLORS = ['#141413', '#006241', '#C0397A', '#CF4500'];

  return (
    <>
      {open && <div className="fixed inset-0 z-90" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />}
      <div
        className={`ir-fd fixed inset-x-0 bottom-0 z-100 transition-transform duration-300 ${
          docksRight ? 'ir-fd-r md:inset-y-0 md:left-auto md:right-0 md:w-[420px]' : ''
        }`}
        style={{
          // The axis is a media query away, so the offset is a variable the
          // CSS below picks up rather than a transform written here. Shape and
          // height live in that stylesheet too: written inline they would
          // outrank the media query and the desktop dock would keep the
          // sheet's rounded top and its 88vh.
          ['--ir-fd-off' as string]: open ? '0%' : '100%',
          background: '#fff',
          overflowY: 'auto',
        } as React.CSSProperties}>
        <style>{`
          .ir-fd {
            transform: translateY(var(--ir-fd-off));
            border-radius: 20px 20px 0 0;
            box-shadow: 0 -4px 32px rgba(0,0,0,0.15);
            max-height: 88vh;
          }
          @media (min-width: 768px) {
            .ir-fd-r {
              transform: translateX(var(--ir-fd-off));
              max-height: none; height: 100%;
              border-radius: 0;
              box-shadow: -4px 0 32px rgba(0,0,0,0.15);
            }
          }
        `}</style>
        <div className="flex justify-center pt-2.5 pb-1 sticky top-0 bg-white z-10">
          <div className="w-8 h-1 rounded-full" style={{ background: '#D1CDC7' }} />
        </div>

        <div className="px-4 pb-6 pt-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold" style={{ color: '#141413' }}>Filters</h2>
            <button onClick={onClose} className="text-xs font-semibold" style={{ color: '#696969' }}>✕ Close</button>
          </div>

          <div className="flex mb-3" style={{ borderBottom: '1px solid #F0ECE8', paddingBottom: 10 }}>
            {[
              { label: 'Total',  value: stats.total },
              { label: 'Groom',  value: stats.male },
              { label: 'Bride',  value: stats.female },
              { label: 'Urgent', value: stats.urgent },
            ].map((s, i) => (
              <div key={s.label} className="flex-1 text-center"
                style={{ borderLeft: i > 0 ? '1px solid #F0ECE8' : 'none' }}>
                <strong className="block text-base font-extrabold leading-tight" style={{ color: STAT_COLORS[i] }}>
                  <CountUp to={s.value} duration={1.2} />
                </strong>
                <span className="text-[9px] font-medium uppercase tracking-wide" style={{ color: '#B0A8A0' }}>{s.label}</span>
              </div>
            ))}
          </div>

          {remaining != null && (
          <div className="flex items-center justify-between mb-3 rounded-lg px-2.5 py-1.5"
            style={{ background: remaining <= 3 ? '#FFF3EE' : '#F7F5F3' }}>
            <span className="text-[11px] font-medium" style={{ color: remaining <= 3 ? '#CF4500' : '#696969' }}>
              {`${remaining} credit${remaining !== 1 ? 's' : ''} remaining`}
            </span>
            {resetLabel && <span className="text-[10px]" style={{ color: '#A0A0A0' }}>resets {resetLabel}</span>}
          </div>
          )}

          <div className="mb-3">
            <div className="flex items-center justify-between mb-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color: '#A0A0A0' }}>Age Range</p>
              <p className="text-[11px] font-semibold" style={{ color: '#006241' }}>{ageMin} – {ageMax}</p>
            </div>
            <DualRangeSlider valueMin={ageMin} valueMax={ageMax} onMin={setAgeMin} onMax={setAgeMax} />
          </div>

          <div className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: '#A0A0A0' }}>Gender</p>
            <div className="flex gap-1.5">
              {[['all','All'],['female','Bride'],['male','Groom']].map(([v, l]) => (
                <button key={v} onClick={() => setGender(v)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                  style={{
                    background:  gender === v ? '#006241' : '#FAF9F8',
                    color:       gender === v ? '#fff' : '#696969',
                    borderColor: gender === v ? '#006241' : '#E0DBD6',
                  }}>{l}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-2.5 gap-y-2.5 mb-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] mb-1" style={{ color: '#A0A0A0' }}>Profile ID</p>
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={idFilter}
                aria-label="Profile ID"
                onChange={e => setIdFilter(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 42"
                className="w-full rounded-lg px-2.5 py-2 text-xs border outline-none"
                style={{ borderColor: '#E0DBD6', background: '#FAF9F8', color: '#141413' }} />
            </div>
            <CSelect label="Sort" value={sort} onChange={setSort} options={SORT_OPTIONS} />
            <CSelect label="State / Location" value={state} onChange={setState} options={STATE_OPTIONS} />
            <CSelect label="Community" value={community} onChange={setCommunity} options={COMMUNITY_OPTIONS} />
            <CSelect label="Education" value={education} onChange={setEducation} options={EDUCATION_OPTIONS} />
            <CSelect label="Marital Status" value={marital} onChange={setMarital} options={MARITAL_OPTIONS} />
          </div>

          <div className="flex gap-2">
            <button onClick={onClear} className="flex-1 py-2.5 rounded-full text-xs font-semibold border"
              style={{ borderColor: '#D1CDC7', color: '#696969' }}>Clear all</button>
            <button onClick={onClose} className="flex-1 py-2.5 rounded-full text-xs font-bold"
              style={{ background: '#006241', color: '#fff' }}>Apply</button>
          </div>
        </div>
      </div>
    </>
  );
}
