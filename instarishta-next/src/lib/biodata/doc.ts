import type { BiodataValues, ProfileDoc } from './types';
import { isEmpty } from './resolve';

/**
 * Small readers for the handful of things a presenter needs *outside* the
 * resolved sections: the name in the header, the photographs, the display id.
 *
 * They exist so no component reaches into `values` with a string literal.
 */

export function name(v: BiodataValues): string | undefined {
  return typeof v.fullName === 'string' && v.fullName.trim() ? v.fullName : undefined;
}

export function photos(v: BiodataValues): string[] {
  const p = v.photos;
  if (typeof p === 'string') return [p];
  return Array.isArray(p) ? (p.filter((x) => typeof x === 'string') as string[]) : [];
}

export function voiceNote(v: BiodataValues): string | undefined {
  return typeof v.voiceNoteUrl === 'string' ? v.voiceNoteUrl : undefined;
}

/** 'bride' | 'groom' -> 'Bride' | 'Groom', or undefined when unanswered. */
export function genderLabel(v: BiodataValues): string | undefined {
  const g = v.gender;
  if (typeof g !== 'string' || !g) return undefined;
  return g.charAt(0).toUpperCase() + g.slice(1);
}

/** "Hyderabad, Telangana" from whichever place fields were answered. */
export function place(v: BiodataValues): string | undefined {
  const parts = [v.city, v.state, v.country].filter((x) => !isEmpty(x)) as string[];
  return parts.length ? parts.slice(0, 2).join(', ') : undefined;
}

/** Anything unique enough to key a list on. */
export function docKey(d: ProfileDoc): string {
  return d.slug ?? d.id;
}
