'use client';
import { textDir, URDU_FONT } from '../_shared';
import { type BioSection, type IconName, iconFor } from '@/lib/biodata-schema';
import { LIVE, accentFor } from '@/lib/live-theme';

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

function BioIcon({ name, color, size = 14, className = 'shrink-0 mt-0.5' }: {
  name: IconName; color: string; size?: number; className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

/**
 * Urdu needs `dir` for correct bidi ordering, but the text stays start-aligned:
 * labels are left-aligned Latin, and letting an Urdu value float to the right
 * edge of its column visually detaches it from the label it belongs to.
 */
function rtlProps(value: string) {
  const dir = textDir(value);
  return {
    dir,
    lang: dir === 'rtl' ? 'ur' : undefined,
    fontFamily: dir === 'rtl' ? URDU_FONT : 'inherit',
  };
}

interface Palette { accent: string; accentBg: string; accentLine: string }

/**
 * A heading is a glyph in a tinted tile beside a line of accent type -- the
 * anchor the show's reel uses. The old tinted header strip is gone: on a dark
 * ground a full-width band reads as a separate object sitting on the card
 * rather than as the card's own title.
 */
function SectionShell({ heading, accent, accentBg, accentLine, children }: Palette & {
  heading: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl" style={{ border: `1px solid ${LIVE.hairline}`, background: LIVE.card }}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-1">
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: 34, height: 34, borderRadius: 11,
            background: accentBg, border: `1px solid ${accentLine}`,
          }}
        >
          <BioIcon name={iconFor(heading)} color={accent} size={17} className="shrink-0" />
        </span>
        <p className="text-[0.95rem] font-extrabold tracking-[-0.01em]" style={{ color: accent }}>
          {heading}
        </p>
      </div>
      {children}
    </div>
  );
}

function SectionBody({ section, accent, accentBg, accentLine }: Palette & { section: BioSection }) {
  switch (section.type) {
    case 'fields':
      // Two columns above a small phone, one below so Urdu keeps a usable measure.
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 px-4 py-3">
          {section.items.map(f => {
            const { fontFamily, ...dirAttrs } = rtlProps(f.value);
            return (
              <div key={f.label} className="flex items-start gap-2.5">
                <BioIcon name={f.icon ?? 'info'} color={accent} />
                <div className="min-w-0 flex-1">
                  <span className="block text-[0.6rem] font-medium uppercase tracking-[0.14em]"
                    style={{ color: LIVE.muted, fontFamily: LIVE.mono }}>
                    {f.label}
                  </span>
                  <span className="block text-[0.86rem] font-bold mt-0.5" {...dirAttrs}
                    style={{ color: LIVE.cream, textAlign: 'left', fontFamily }}>
                    {f.value}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      );

    case 'timeline':
      return (
        <ul className="flex flex-col gap-3 px-4 py-3 m-0 list-none">
          {section.items.map((e, i) => {
            const { fontFamily, ...dirAttrs } = rtlProps(e.title);
            return (
              <li key={`${e.title}-${i}`} className="flex items-start gap-3">
                <span className="rounded-full p-1.5 shrink-0" style={{ background: accentBg }}>
                  <BioIcon name="graduation" color={accent} />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.88rem] font-bold" {...dirAttrs}
                    style={{ color: LIVE.cream, fontFamily }}>
                    {e.title}
                  </p>
                  {e.subtitle && (
                    <p className="text-[0.72rem]" {...rtlProps(e.subtitle)}
                      style={{ color: LIVE.muted, fontFamily: rtlProps(e.subtitle).fontFamily }}>
                      {e.subtitle}
                    </p>
                  )}
                  {/* The year, in the show's rose -- the one warm mark on a
                      timeline that is otherwise gold and cream. */}
                  {e.meta && (
                    <p className="text-[0.64rem] font-bold tracking-[0.12em] mt-0.5"
                      style={{ color: LIVE.rose, fontFamily: LIVE.mono }}>{e.meta}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      );

    case 'people':
      return (
        <div className="flex flex-col gap-3 px-4 py-3">
          {section.items.map((p, i) => {
            const { fontFamily, ...dirAttrs } = rtlProps(p.name);
            return (
              <div key={`${p.name}-${i}`} className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full flex items-center justify-center text-[0.8rem] font-bold shrink-0"
                  style={{ background: accentBg, color: accent, border: `1px solid ${accentLine}` }}>
                  {(p.role || p.name).trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-[0.85rem] font-bold" {...dirAttrs}
                    style={{ color: LIVE.cream, fontFamily }}>
                    {p.name}
                  </p>
                  {(p.role || p.detail) && (
                    <p className="text-[0.7rem]" style={{ color: LIVE.muted }}>
                      {[p.role, p.detail].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );

    case 'chips':
      return (
        <div className="flex flex-wrap gap-2 px-4 py-3">
          {section.items.map((tag, i) => {
            const { fontFamily, ...dirAttrs } = rtlProps(tag);
            return (
              <span key={`${tag}-${i}`} className="rounded-full px-3 py-1.5 text-[0.72rem] font-semibold"
                {...dirAttrs}
                style={{ background: accentBg, color: accent, border: `1px solid ${accentLine}`, fontFamily }}>
                {tag}
              </span>
            );
          })}
        </div>
      );

    case 'text': {
      const { fontFamily, ...dirAttrs } = rtlProps(section.text);
      return (
        <p className="text-sm px-4 py-3" {...dirAttrs}
          style={{
            color: 'rgba(247,239,230,0.86)',
            lineHeight: dirAttrs.dir === 'rtl' ? 2.1 : 1.7,
            fontFamily,
          }}>
          {section.text}
        </p>
      );
    }
  }
}

/**
 * Renders whatever sections it is given, in the order given. It does no
 * pruning of its own — `normalizeSections` guarantees every section here has
 * at least one renderable item, so there is no empty-state branch to hit.
 */
export default function BiodataSheet({ sections, isFemale }: {
  sections: BioSection[]; isFemale: boolean;
}) {
  const palette = accentFor(isFemale);

  return (
    <div className="flex flex-col gap-3">
      {sections.map(section => (
        <SectionShell key={section.heading} heading={section.heading} {...palette}>
          <SectionBody section={section} {...palette} />
        </SectionShell>
      ))}
    </div>
  );
}
