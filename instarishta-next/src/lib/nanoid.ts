import { customAlphabet } from 'nanoid';

// Same alphabet as the DB function ir_gen_nano_id — must stay in sync.
// 64 chars × 13 length = 64^13 ≈ 302 sextillion unique IDs.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export const nanoid13 = customAlphabet(ALPHABET, 13);

// URL prefix for each entity type.
// profile and post share /p — one share route resolves both by slug, and
// /post/* permanently redirects there. See src/app/p/[slug]/page.tsx.
export const ENTITY_PATH: Record<string, string> = {
  profile:   'p',
  post:      'p',
  story:     's',
  channel:   'c',
  highlight: 'h',
  featured:  'ad',
  biodata:   'bio',
};

export function shareUrl(entityType: string, slug: string): string {
  const prefix = ENTITY_PATH[entityType] ?? entityType;
  return `https://instarishta.me/${prefix}/${slug}`;
}
