/**
 * The /nizam palette. One definition, imported by every tab.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * The admin shell is dark (NizamClient sets `background: BG` on the page), but
 * five tabs — Analytics, Payments, Vitals, Claims and the user detail pane —
 * were written against a LIGHT palette: `#fff` cards, `#E8E4E0` hairlines,
 * `#141413` text. Each had its own private copy of those hex values, so nothing
 * connected them to the shell and nothing flagged the mismatch. The result was
 * white panels sitting on a near-black page, and table headers in `#767676` on
 * `#FAFAF9` that were effectively invisible once the surrounding chrome went
 * dark.
 *
 * The fix is not to darken those hexes in five places — that just recreates the
 * same drift with different numbers. Every colour the admin uses is named here,
 * and every tab imports from here.
 *
 * ── Reading the names ────────────────────────────────────────────────────────
 * SURFACE/PANEL/SUBTLE are backgrounds, in increasing lightness; TEXT/MUTED/
 * FAINT are foregrounds, in decreasing prominence. The semantic three — GREEN,
 * RED, AMBER — are tuned to be legible ON the dark panels, which is why they
 * are lighter than the values the light theme used (`#15803D` green and
 * `#B91C1C` red both fail against `#0f2419`).
 */

/** Page background — the darkest surface. */
export const BG = '#0a1a14';

/** Cards, panels, table bodies: one step up from the page. */
export const PANEL = '#0f2419';

/** Table header rows and inset wells: a hint lighter than PANEL. */
export const SUBTLE = 'rgba(255,255,255,0.04)';

/** Hairlines between rows and around cards. */
export const BORDER = 'rgba(255,255,255,0.08)';

/** A heavier divider, for a border that has to read as a real edge. */
export const BORDER_STRONG = 'rgba(255,255,255,0.14)';

/** Primary text. */
export const TEXT = '#fff';

/** Secondary text — labels, timestamps, counts. */
export const MUTED = 'rgba(255,255,255,0.55)';

/** Tertiary text — column headers, placeholders, disabled states. */
export const FAINT = 'rgba(255,255,255,0.38)';

/**
 * The brand green, and its wash.
 *
 * `#00A86B` rather than the site's `#006241`: the darker green is meant for
 * green-on-white and disappears against PANEL.
 */
export const GREEN    = '#00A86B';
export const GREEN_BG = 'rgba(0,168,107,0.12)';

/** Destructive actions and failures. Matches the Delete buttons already in the shell. */
export const RED    = '#e5484d';
export const RED_BG = 'rgba(229,72,77,0.14)';

/** Warnings, pending states, "needs work". */
export const AMBER    = '#f5a524';
export const AMBER_BG = 'rgba(245,165,36,0.14)';

/** A second chart series that must not read as success or failure. */
export const NEUTRAL = '#8aa0b4';

/** The standard card. Spread it, then override what a particular card needs. */
export const CARD: React.CSSProperties = {
  background:   PANEL,
  border:       `1px solid ${BORDER}`,
  borderRadius: 12,
  padding:      14,
  color:        TEXT,
};

/**
 * A pill button/filter chip in its two states.
 *
 * Selected is a filled green rather than the light theme's near-black fill —
 * on a dark page "darker than the background" cannot express selection, so the
 * accent has to carry it.
 */
export function chip(selected: boolean): React.CSSProperties {
  return {
    fontSize:     12,
    padding:      '5px 11px',
    borderRadius: 999,
    border:       `1px solid ${selected ? GREEN : BORDER}`,
    background:   selected ? GREEN_BG : 'transparent',
    color:        selected ? GREEN : MUTED,
    cursor:       'pointer',
  };
}

/** Text inputs and selects, which inherit a white background otherwise. */
export const FIELD: React.CSSProperties = {
  background:   'rgba(255,255,255,0.06)',
  border:       `1px solid ${BORDER}`,
  borderRadius: 8,
  color:        TEXT,
  padding:      '5px 10px',
  fontSize:     12,
};
