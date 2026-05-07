'use client';

import { useEffect } from 'react';

export default function ViewTracker({ slug, source }: { slug: string; source?: string }) {
  useEffect(() => {
    fetch('/api/share', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ slug, event: 'view', source }),
    }).catch(() => {});
  }, [slug, source]);

  return null;
}
