import type { MetadataRoute } from 'next';

/**
 * The app was installable in name only -- robots and icons existed, a manifest
 * did not, so /manifest.webmanifest 404d.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'InstaRishta — Trusted Muslim Matrimony & Nikah Matchmaking',
    short_name: 'InstaRishta',
    description:
      'Find verified Muslim marriage proposals on InstaRishta. Trusted nikah matchmaking with family-controlled contact and verified profiles.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#04081b',
    theme_color: '#04081b',
    categories: ['social', 'lifestyle'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
