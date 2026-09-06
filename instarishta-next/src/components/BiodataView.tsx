'use client';

import { LIVE, accentFor } from '@/lib/live-theme';
import { rtlTextProps } from '@/lib/text-direction';
import { BiodataGlyph } from './biodata-icons';
import type { ResolvedField, ResolvedSection } from '@/lib/biodata/types';

/**
 * The biodata, on the web, from the shared model.
 *
 * This replaces the site's own idea of what a biodata is. It takes
 * `ResolvedSection[]` -- the exact shape the broadcast reel renders -- so the
 * page, the frames screenshotted from the reel, and the show itself are three
 * views of one document rather than three definitions of one.
 *
 * It names no field. Sections, their order, their layout and which details
 * survive are all decided by the registry and `resolveBiodata`; a detail
 * nobody answered never arrives here, so there is no empty row to render and
 * no "N/A" to print.
 *
 * The skin is the show's: aubergine ground, gold carrying structure, rose the
 * human facts, cream what is being said. The rhythm is the reel's -- a gold
 * tile beside every heading, mono labels over cream values, grouped people on
 * a raised card.
 */

/** Urdu needs `dir` for bidi, but stays start-aligned beside its label. */
function rtl(value: string) {
  const { dir, lang, style } = rtlTextProps(value);
  return { dir, lang, fontFamily: style.fontFamily };
}

interface Palette { accent: string; accentBg: string; accentLine: string }

function Detail({ field, accent }: { field: ResolvedField; accent: string }) {
  const rows = field.rows?.length
    ? field.rows.map((r) => ({
        label: r.role ?? field.short,
        value: r.primary,
        note: [r.secondary, r.meta].filter(Boolean).join(' · '),
      }))
    : [{ label: field.short, value: field.display, note: field.note ?? '' }];

  return (
    <>
      {rows.map((r, i) => {
        const { fontFamily, ...dir } = rtl(r.value);
        return (
          <div key={`${field.key}-${i}`} className="flex items-start gap-2.5 min-w-0">
            <BiodataGlyph name={field.icon} color={accent} className="shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="block text-[0.6rem] font-medium uppercase tracking-[0.14em]"
                style={{ color: LIVE.muted, fontFamily: LIVE.mono }}>
                {r.label}
              </span>
              <span className="block text-[0.86rem] font-bold mt-0.5" {...dir}
                style={{ color: LIVE.cream, textAlign: 'left', fontFamily }}>
                {r.value}
              </span>
              {r.note && (
                <span className="block text-[0.7rem] mt-0.5" style={{ color: LIVE.muted }}>
                  {r.note}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function Chips({ values, palette }: { values: string[]; palette: Palette }) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((t) => {
        const { fontFamily, ...dir } = rtl(t);
        return (
          <span key={t} className="rounded-full px-3 py-1.5 text-[0.72rem] font-semibold" {...dir}
            style={{
              background: palette.accentBg, color: palette.accent,
              border: `1px solid ${palette.accentLine}`, fontFamily,
            }}>
            {t}
          </span>
        );
      })}
    </div>
  );
}

function Body({ section, palette }: { section: ResolvedSection; palette: Palette }) {
  if (section.layout === 'tags') {
    return (
      <Chips values={section.fields.flatMap((f) => f.display.split(' · '))} palette={palette} />
    );
  }

  if (section.layout === 'prose') {
    return (
      <div className="flex flex-col gap-3">
        {section.fields.map((f) => {
          const { fontFamily, ...dir } = rtl(f.display);
          return (
            <div key={f.key}>
              <span className="block text-[0.6rem] font-medium uppercase tracking-[0.14em] mb-1"
                style={{ color: LIVE.muted, fontFamily: LIVE.mono }}>
                {f.short}
              </span>
              <p className="text-[0.86rem]" {...dir}
                style={{
                  color: 'rgba(247,239,230,0.86)',
                  lineHeight: dir.dir === 'rtl' ? 2.1 : 1.7,
                  fontFamily,
                }}>
                {f.display}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  if (section.layout === 'timeline') {
    const stops = section.fields.flatMap((f) =>
      f.rows?.length
        ? f.rows.map((r) => ({ when: r.role, what: r.primary, where: [r.secondary, r.meta].filter(Boolean).join(' · ') }))
        : [{ when: undefined, what: f.display, where: f.note ?? '' }],
    );
    return (
      <ol className="flex flex-col gap-4 m-0 list-none pl-5"
        style={{ borderLeft: `1px solid ${LIVE.goldDim}` }}>
        {stops.map((s, i) => {
          const { fontFamily, ...dir } = rtl(s.what);
          return (
            <li key={i} className="relative">
              <span className="absolute rounded-full"
                style={{
                  left: -25, top: 6, width: 9, height: 9, background: LIVE.gold,
                  boxShadow: `0 0 0 4px ${LIVE.goldFaint}`,
                }} />
              {s.when && (
                <span className="block text-[0.64rem] font-bold tracking-[0.12em]"
                  style={{ color: LIVE.rose, fontFamily: LIVE.mono }}>{s.when}</span>
              )}
              <span className="block text-[0.9rem] font-bold mt-0.5" {...dir}
                style={{ color: LIVE.cream, fontFamily }}>{s.what}</span>
              {s.where && (
                <span className="block text-[0.72rem] mt-0.5" style={{ color: LIVE.muted }}>{s.where}</span>
              )}
            </li>
          );
        })}
      </ol>
    );
  }

  // Grids and lists share the two-column detail layout. A labelled group gets
  // its own raised card, the way the reel keeps a family together.
  return (
    <div className="flex flex-col gap-3.5">
      {section.groups.map((group, gi) => (
        <div key={group.label ?? gi}
          className={group.label ? 'rounded-xl p-3.5' : undefined}
          style={group.label
            ? { background: 'rgba(247,239,230,0.035)', border: `1px solid ${LIVE.hairline}` }
            : undefined}>
          {group.label && (
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] mb-3"
              style={{ color: palette.accent, fontFamily: LIVE.mono }}>
              {group.label}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            {group.fields.map((f) =>
              f.type === 'tags' || f.type === 'multiselect' ? (
                <div key={f.key} className="sm:col-span-2">
                  <span className="block text-[0.6rem] font-medium uppercase tracking-[0.14em] mb-1.5"
                    style={{ color: LIVE.muted, fontFamily: LIVE.mono }}>{f.short}</span>
                  <Chips values={f.display.split(' · ')} palette={palette} />
                </div>
              ) : (
                <Detail key={f.key} field={f} accent={palette.accent} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BiodataView({
  sections,
  isFemale,
}: {
  sections: ResolvedSection[];
  isFemale: boolean;
}) {
  const palette = accentFor(isFemale);

  return (
    <div className="flex flex-col gap-3">
      {sections.map((section) => (
        <div key={section.id} className="rounded-2xl"
          style={{ border: `1px solid ${LIVE.hairline}`, background: LIVE.card }}>
          <div className="flex items-center gap-3 px-4 pt-4 pb-1">
            <span className="flex items-center justify-center shrink-0"
              style={{
                width: 34, height: 34, borderRadius: 11,
                background: palette.accentBg, border: `1px solid ${palette.accentLine}`,
              }}>
              <BiodataGlyph name={section.icon} color={palette.accent} size={17} />
            </span>
            <p className="text-[0.95rem] font-extrabold tracking-[-0.01em]" style={{ color: palette.accent }}>
              {section.title}
            </p>
          </div>
          {section.subtitle && (
            <p className="px-4 text-[0.62rem] uppercase tracking-[0.13em]"
              style={{ color: LIVE.muted, fontFamily: LIVE.mono }}>
              {section.subtitle}
            </p>
          )}
          <div className="px-4 py-3">
            <Body section={section} palette={palette} />
          </div>
        </div>
      ))}
    </div>
  );
}
