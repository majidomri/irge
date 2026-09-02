'use client';
import { THEME, TIMING, type Beat } from '@/lib/live-config';
import type { ResolvedField, ResolvedGroup, ResolvedSection } from '@/lib/biodata/types';
import { fieldIcon } from './icons';

/* ------------------------------------------------------------------ *
 * The RishtaSwipe Bio Data drawer, set for broadcast.
 *
 * The elements are the drawer's own: a two-column grid of small icon +
 * label + value, degrees on a circled glyph, family on avatar initials,
 * an address list and preference chips. What changed is the scale and
 * the palette -- the stage is 1080x1920 (3x a 360px viewport) and wears
 * the show's gold-on-aubergine so the biodata beat still matches the
 * wordmark, the host ring, the foil border and the endcard.
 *
 * It is still a presenter over ResolvedSection[] and names no field, so
 * a field added in the admin appears here without touching this file.
 * ------------------------------------------------------------------ */

/**
 * Section heading: the section's own glyph in a tinted tile, then its title.
 *
 * The intro anchors its details with surfaces -- a pill, a foil badge, a
 * white ID tag -- so a heading repeated flat seven times in a row is the one
 * thing on the biodata pages that reads as a different, quieter object. The
 * tile gives every section the same kind of anchor without a new colour.
 */
function Heading({ label, icon, delay = 0 }: { label: string; icon?: string; delay?: number }) {
  const Icon = fieldIcon(icon);
  return (
    <div
      className="flex items-center"
      style={{
        gap: 18,
        animation: `ir-fade-up 460ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
      }}
    >
      {Icon && (
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: 58,
            height: 58,
            borderRadius: 16,
            background: 'rgba(229,180,92,0.14)',
            border: '1px solid rgba(229,180,92,0.34)',
            boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
          }}
        >
          <Icon style={{ width: 30, height: 30, color: THEME.gold }} strokeWidth={2.2} />
        </span>
      )}
      <span
        style={{
          fontFamily: THEME.sans,
          fontSize: 38,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: THEME.gold,
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** The drawer's separator between sections. */
function Separator() {
  return <div style={{ height: 1, background: THEME.hairline }} />;
}

/**
 * One detail: glyph, quiet label, loud value. The drawer's
 * `flex items-start gap-3` cell, tripled.
 */
function Detail({
  icon,
  label,
  value,
  note,
  delay = 0,
}: {
  icon?: string;
  label: string;
  value: string;
  note?: string;
  delay?: number;
}) {
  const Icon = fieldIcon(icon);
  return (
    <div
      className="flex items-start"
      style={{
        gap: 18,
        minWidth: 0,
        animation: `ir-line-in ${TIMING.rowEnterMs}ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
      }}
    >
      {Icon && (
        <Icon
          style={{ width: 34, height: 34, marginTop: 6, color: THEME.gold, flexShrink: 0 }}
          strokeWidth={2}
        />
      )}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: THEME.mono,
            fontSize: 19,
            fontWeight: 500,
            letterSpacing: '0.11em',
            textTransform: 'uppercase',
            color: THEME.muted,
            marginBottom: 4,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: THEME.sans,
            fontSize: 30,
            fontWeight: 700,
            color: THEME.cream,
            lineHeight: 1.12,
            letterSpacing: '-0.015em',
            overflowWrap: 'anywhere',
          }}
        >
          {value}
        </div>
        {note && (
          <div style={{ fontFamily: THEME.sans, fontSize: 24, color: THEME.muted, marginTop: 3 }}>
            {note}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A row on a circular badge -- the drawer's education entry (a glyph in a
 * tinted circle) and its family entry (an avatar initial) are the same
 * shape, so they are the same component here.
 */
function PersonRow({
  initial,
  icon,
  title,
  subtitle,
  meta,
  tone = 'plain',
  delay = 0,
}: {
  initial?: string;
  icon?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  tone?: 'gold' | 'rose' | 'lilac' | 'plain';
  delay?: number;
}) {
  const t = TONES[tone];
  const Icon = !initial ? fieldIcon(icon) : null;
  return (
    <div
      className="flex items-center"
      style={{
        gap: 24,
        minWidth: 0,
        animation: `ir-line-in ${TIMING.rowEnterMs}ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
      }}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: 62,
          height: 62,
          borderRadius: 999,
          background: t.bg,
          border: `1px solid ${t.bd}`,
          color: t.fg,
        }}
      >
        {initial ? (
          <span style={{ fontFamily: THEME.sans, fontSize: 26, fontWeight: 700 }}>{initial}</span>
        ) : (
          Icon && <Icon style={{ width: 32, height: 32 }} strokeWidth={2} />
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: THEME.sans,
            fontSize: 30,
            fontWeight: 700,
            color: THEME.cream,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontFamily: THEME.sans, fontSize: 24, color: THEME.muted, marginTop: 2 }}>
            {subtitle}
          </div>
        )}
        {meta && (
          <div style={{ fontFamily: THEME.mono, fontSize: 19, color: THEME.muted, marginTop: 2 }}>
            {meta}
          </div>
        )}
      </div>
    </div>
  );
}

const TONES = {
  gold: { fg: THEME.gold, bg: 'rgba(229,180,92,0.12)', bd: 'rgba(229,180,92,0.30)' },
  rose: { fg: THEME.rose, bg: 'rgba(240,114,140,0.13)', bd: 'rgba(240,114,140,0.30)' },
  lilac: { fg: '#C7A6D6', bg: 'rgba(199,166,214,0.13)', bd: 'rgba(199,166,214,0.30)' },
  plain: { fg: THEME.gold, bg: 'rgba(229,180,92,0.10)', bd: 'rgba(229,180,92,0.22)' },
} as const;

/** The drawer's preference badges. */
const CHIP_TONES = [
  { bg: 'rgba(240,114,140,0.16)', bd: 'rgba(240,114,140,0.38)' },
  { bg: 'rgba(229,180,92,0.15)', bd: 'rgba(229,180,92,0.38)' },
  { bg: 'rgba(199,166,214,0.15)', bd: 'rgba(199,166,214,0.38)' },
];

function Chip({ children, index = 0, delay = 0 }: { children: React.ReactNode; index?: number; delay?: number }) {
  const t = CHIP_TONES[index % CHIP_TONES.length];
  return (
    <span
      style={{
        fontFamily: THEME.sans,
        fontSize: 28,
        fontWeight: 600,
        color: THEME.cream,
        background: t.bg,
        border: `1px solid ${t.bd}`,
        borderRadius: 999,
        padding: '12px 28px',
        animation: `ir-fade-up 420ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
      }}
    >
      {children}
    </span>
  );
}

/** The sub-heading over a group of fields, e.g. Parents. */
function GroupLabel({ label, delay = 0 }: { label: string; delay?: number }) {
  return (
    <div
      style={{
        fontFamily: THEME.mono,
        fontSize: 19,
        fontWeight: 600,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'rgba(233, 218, 236, 0.55)',
        animation: `ir-fade-up 420ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
      }}
    >
      {label}
    </div>
  );
}

/**
 * One stop on a timeline: a dot on a running rule, the qualification, then
 * where and when. Degrees read as a sequence this way rather than as a set
 * of unrelated badges.
 */
function TimelineRow({
  title,
  subtitle,
  meta,
  last = false,
  delay = 0,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  last?: boolean;
  delay?: number;
}) {
  return (
    <div
      className="flex"
      style={{
        gap: 20,
        animation: `ir-line-in ${TIMING.rowEnterMs}ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
      }}
    >
      <div className="flex flex-col items-center" style={{ width: 16, flexShrink: 0 }}>
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 999,
            background: THEME.gold,
            marginTop: 8,
            flexShrink: 0,
          }}
        />
        {!last && <span style={{ flex: 1, width: 2, background: THEME.goldDim, marginTop: 6 }} />}
      </div>
      <div style={{ minWidth: 0, paddingBottom: last ? 0 : 22 }}>
        {meta && (
          <div
            style={{
              fontFamily: THEME.mono,
              fontSize: 19,
              letterSpacing: '0.14em',
              color: THEME.muted,
              marginBottom: 4,
            }}
          >
            {meta}
          </div>
        )}
        <div
          style={{
            fontFamily: THEME.sans,
            fontSize: 30,
            fontWeight: 700,
            color: THEME.cream,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontFamily: THEME.sans, fontSize: 24, color: THEME.muted, marginTop: 3 }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

function Prose({ label, text, delay = 0 }: { label: string; text: string; delay?: number }) {
  return (
    <div style={{ animation: `ir-fade-up 460ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both` }}>
      <div
        style={{
          fontFamily: THEME.mono,
          fontSize: 19,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: THEME.muted,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <p style={{ fontFamily: THEME.sans, fontSize: 30, lineHeight: 1.44, color: THEME.cream }}>{text}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** A repeater row keeps its own eyebrow; a plain field uses its short label. */
function fieldRows(field: ResolvedField) {
  if (field.rows?.length) {
    return field.rows.map((r, i) => {
      const count = Number(r.primary);
      // A count with a relation reads as "2 Sisters", not "2" over "Sister".
      const title =
        r.role && Number.isFinite(count)
          ? `${r.primary} ${r.role}${count > 1 ? 's' : ''}`
          : r.primary;
      return {
        key: `${field.key}-${i}`,
        label: r.role ?? field.short,
        title,
        value: r.primary,
        note: [r.secondary, r.meta].filter(Boolean).join(' · ') || undefined,
      };
    });
  }
  return [{
    key: field.key,
    label: field.short,
    title: field.display,
    value: field.display,
    note: field.note,
  }];
}

/** Tag-ish values are always chips -- the drawer's badges -- whatever
 *  layout the section happens to declare. */
function isChipField(f: ResolvedField) {
  return f.type === 'tags' || f.type === 'multiselect';
}

function ChipRow({
  field,
  base,
  hideLabel = false,
}: {
  field: ResolvedField;
  base: number;
  hideLabel?: boolean;
}) {
  const parts = field.display.split(' · ');
  return (
    <div style={{ minWidth: 0 }}>
      {!hideLabel && (
      <div
        style={{
          fontFamily: THEME.mono,
          fontSize: 19,
          fontWeight: 500,
          letterSpacing: '0.11em',
          textTransform: 'uppercase',
          color: THEME.muted,
          marginBottom: 10,
        }}
      >
        {field.short}
      </div>
      )}
      <div className="flex flex-wrap" style={{ gap: 14 }}>
        {parts.map((t, i) => (
          <Chip key={t} index={i} delay={base + i * 60}>
            {t}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** The badge-row body of a grid section, for one group of its fields. */
function GridBody({
  fields,
  section,
  stagger,
}: {
  fields: ResolvedField[];
  section: ResolvedSection;
  stagger: (i: number) => number;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      {fields.flatMap((f, fi) => {
        const tone = f.tone ?? 'plain';
        const person = tone !== 'plain';

        if (person || f.rows?.length) {
          return fieldRows(f).map((r, i) => (
            <PersonRow
              key={r.key}
              initial={person ? r.label.charAt(0).toUpperCase() : undefined}
              icon={f.icon ?? section.icon}
              title={r.title}
              subtitle={r.note}
              meta={person ? undefined : r.label}
              tone={tone}
              delay={stagger(fi + i)}
            />
          ));
        }

        return [
          <Detail
            key={f.key}
            icon={f.icon ?? section.icon}
            label={f.short}
            value={f.display}
            note={f.note}
            delay={stagger(fi)}
          />,
        ];
      })}
    </div>
  );
}

function SectionBlock({ section, base }: { section: ResolvedSection; base: number }) {
  const stagger = (i: number) => base + 40 + i * TIMING.rowStaggerMs;
  const chipFields = section.fields.filter(isChipField);
  const plainFields = section.fields.filter((f) => !isChipField(f));

  return (
    <div className="flex flex-col" style={{ gap: 24 }} data-section-id={section.id}>
      <Heading label={section.title} icon={section.icon} delay={base} />

      {section.layout === 'timeline' ? (
        // Every row of every repeater, in order, as one running timeline.
        <div className="flex flex-col">
          {(() => {
            const rows = section.fields.flatMap((f) =>
              f.rows?.length
                ? fieldRows(f).map((r) => ({ ...r, icon: f.icon }))
                : [{ key: f.key, label: f.short, title: f.display, value: f.display, note: f.note }],
            );
            return rows.map((r, i) => (
              <TimelineRow
                key={r.key}
                meta={r.label}
                title={r.title}
                subtitle={r.note}
                last={i === rows.length - 1}
                delay={stagger(i)}
              />
            ));
          })()}
        </div>
      ) : section.layout === 'grid' ? (
        <div className="flex flex-col" style={{ gap: 24 }}>
          {section.groups.map((group, gi) => (
            <div
              key={group.label ?? gi}
              className="flex flex-col"
              data-group-card={group.label || undefined}
              style={
                group.label
                  ? {
                      gap: 16,
                      padding: 20,
                      borderRadius: 18,
                      background: 'rgba(247,239,230,0.045)',
                      border: `1px solid ${THEME.hairline}`,
                    }
                  : { gap: 14 }
              }
            >
              {group.label && <GroupLabel label={group.label} delay={stagger(gi)} />}
              <GridBody fields={group.fields} section={section} stagger={stagger} />
            </div>
          ))}
        </div>
      ) : section.layout === 'tags' ? (
        <div className="flex flex-wrap" style={{ gap: 14 }}>
          {section.fields.flatMap((f, fi) =>
            f.display.split(' · ').map((t, i) => (
              <Chip key={`${f.key}-${t}`} index={fi + i} delay={base + 40 + (fi + i) * 60}>
                {t}
              </Chip>
            )),
          )}
        </div>
      ) : section.layout === 'prose' ? (
        <div className="flex flex-col" style={{ gap: 26 }}>
          {section.fields.map((f, i) => (
            <Prose key={f.key} label={f.short} text={f.display} delay={stagger(i)} />
          ))}
        </div>
      ) : (
        // The drawer's Personal Details block: two across, glyph + label + value.
        <div className="flex flex-col" style={{ gap: 34 }}>
        {chipFields.map((f, i) => (
          <ChipRow
            key={f.key}
            field={f}
            base={stagger(i)}
            hideLabel={f.short.toLowerCase() === section.title.toLowerCase()}
          />
        ))}
        <div className="grid grid-cols-2" style={{ columnGap: 44, rowGap: 28 }}>
          {plainFields.flatMap((f, fi) =>
            fieldRows(f).map((r, i) => (
              <Detail
                key={r.key}
                icon={f.icon ?? section.icon}
                label={r.label}
                value={r.value}
                note={r.note}
                delay={stagger(fi + i)}
              />
            )),
          )}
        </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function BiodataReel({ sections, beat }: { sections: ResolvedSection[]; beat: Beat }) {
  return (
    <>
      <style>{`
        @keyframes ir-line-in { 0% { opacity:0; transform: translateY(18px); } 100% { opacity:1; transform: translateY(0); } }
        @keyframes ir-fade-up { 0% { opacity:0; transform: translateY(14px); } 100% { opacity:1; transform: translateY(0); } }
      `}</style>

      {beat === 'profile' && (
        <div className="flex flex-col" style={{ gap: 22 }}>
          {sections.map((s, i) => (
            <div key={s.id} className="flex flex-col" style={{ gap: 22 }}>
              {i > 0 && <Separator />}
              <SectionBlock section={s} base={i * 160} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
