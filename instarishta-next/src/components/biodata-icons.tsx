/**
 * Glyphs for the shared biodata model.
 *
 * The registry names an icon per field and per section ('height', 'namaz',
 * 'father', …) and the show has a drawn set for each. This site does not carry
 * an icon package, so these are the same shapes as inline paths, mapped from
 * the registry's names.
 *
 * Every name resolves to something: an unmapped key falls back rather than
 * rendering a hole, so a field added to the registry tomorrow still draws.
 */
import type { ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  rings: <><circle cx="9" cy="15" r="5" /><circle cx="15" cy="15" r="5" /><path d="M12 3v4" /></>,
  ruler: <><path d="M3 12h18M7 8v8M12 8v8M17 8v8" /></>,
  person: <><circle cx="12" cy="5" r="2" /><path d="M12 7v7M9 21l3-7 3 7M8 10h8" /></>,
  palette: <><circle cx="12" cy="12" r="9" /><circle cx="9" cy="9" r="1" /><circle cx="15" cy="9" r="1" /><circle cx="9.5" cy="14" r="1" /></>,
  drop: <><path d="M12 3s6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 6-10 6-10z" /></>,
  heart: <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.7 1.1-1a5.5 5.5 0 0 0 0-7.7z" /></>,
  utensils: <><path d="M4 3v7a2 2 0 0 0 4 0V3M6 10v11" /><path d="M17 3c-1.5 2-2 4-2 6h4c0-2-.5-4-2-6zM17 9v12" /></>,
  moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></>,
  book: <><path d="M4 4h9a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" /><path d="M20 4h-4a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h5z" /></>,
  star: <><path d="m12 2 3 6.5 7 1-5 5 1.2 7L12 18l-6.2 3.5L7 14.5l-5-5 7-1z" /></>,
  graduation: <><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5" /></>,
  briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5V21H3z" /><path d="M9 21v-7h6v7" /></>,
  pin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" /></>,
  sparkles: <><path d="m12 3 1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M18 16.5 19 19l2.5 1-2.5 1L18 23.5 17 21l-2.5-1 2.5-1z" /></>,
  quote: <><path d="M7 7H4v6h6V7l-3 6" /><path d="M17 7h-3v6h6V7l-3 6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
};

/** Registry icon name → the shape above. */
const MAP: Record<string, string> = {
  user: 'user', age: 'calendar', status: 'rings', height: 'ruler', build: 'person',
  complexion: 'palette', blood: 'drop', heart: 'heart', diet: 'utensils',
  smoking: 'info', drinking: 'info',
  faith: 'moon', maslak: 'moon', namaz: 'moon', darga: 'moon',
  quran: 'book', hijab: 'sparkles', beard: 'user', community: 'users',
  star: 'star', birthtime: 'calendar', birthplace: 'globe',
  education: 'graduation', work: 'briefcase', home: 'home',
  family: 'users', father: 'user', mother: 'user', sibling: 'users',
  address: 'pin', city: 'home', interests: 'sparkles', quote: 'quote',
  rings: 'heart', search: 'search', phone: 'info', photo: 'info', verified: 'star',
};

export function BiodataGlyph({ name, color, size = 15, className }: {
  name?: string; color: string; size?: number; className?: string;
}) {
  const shape = P[MAP[name ?? ''] ?? ''] ?? P.info;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      {shape}
    </svg>
  );
}
