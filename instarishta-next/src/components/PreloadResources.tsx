'use client';

import ReactDOM from 'react-dom';

const SUPABASE_ORIGIN = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');

export default function PreloadResources() {
  if (SUPABASE_ORIGIN) {
    ReactDOM.preconnect(SUPABASE_ORIGIN, { crossOrigin: 'anonymous' });
  }
  ReactDOM.prefetchDNS('https://www.instagram.com');
  return null;
}
