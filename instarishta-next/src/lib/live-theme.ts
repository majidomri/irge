/**
 * The live show's palette, for the surfaces that have to match it.
 *
 * A rishta now appears in four places -- the broadcast, the frames published
 * to the channel feed, the share card, and this site's biodata sheet -- and
 * the first three already draw from `THEME` in the show's repo. This is that
 * same palette, so the fourth stops looking like a different service.
 *
 * Deep aubergine ground, mehndi gold carrying structure, rose carrying the
 * human facts, cream for what is being said. Dark on purpose: it is the
 * show's ground, and a rishta seen on air and then opened here should be
 * recognisably the same document.
 *
 * Kept in sync by hand. The values live in the show's `src/lib/live-config.ts`
 * and there is no shared package between the two apps; if they change there,
 * they change here.
 */
export const LIVE = {
  ground: '#1C0A21',
  ground2: '#150718',
  raise: '#2A1131',
  /** Section cards, over the ground. */
  card: 'rgba(42, 17, 49, 0.38)',
  gold: '#E5B45C',
  goldDim: 'rgba(229, 180, 92, 0.30)',
  goldFaint: 'rgba(229, 180, 92, 0.12)',
  rose: '#F0728C',
  roseDim: 'rgba(240, 114, 140, 0.16)',
  cream: '#F7EFE6',
  muted: '#B9A2BE',
  hairline: 'rgba(247, 239, 230, 0.10)',
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
} as const;

/**
 * Gold for a groom, rose for a bride.
 *
 * The sheet already tinted itself by gender -- green and pink before this --
 * and the show's palette has its own two accents, so the signal survives the
 * re-skin rather than being dropped in it.
 */
export function accentFor(isFemale: boolean) {
  return isFemale
    ? { accent: LIVE.rose, accentBg: LIVE.roseDim, accentLine: 'rgba(240, 114, 140, 0.40)' }
    : { accent: LIVE.gold, accentBg: LIVE.goldFaint, accentLine: LIVE.goldDim };
}
