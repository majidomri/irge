'use client';

import { useEffect } from 'react';

import { track, type TrackEntity } from '@/lib/track';

/**
 * Records one `view` for the page it is mounted on.
 *
 * A client component because the source has to come from the browser's own
 * Referer, and because /l/[id] is one of 500 prerendered pages — a server-side
 * count there would be recorded once at build time and never again.
 *
 * This is the measurement the answer-engine work has been missing. The
 * listing permalinks, llms.txt, the markdown views and the Content-Signal
 * header were all built so a rishta could be found and cited from outside;
 * /api/track classifies the referrer, so this is what finally says whether any
 * of that produced a visitor.
 */
export function TrackView({
  entityType,
  entityId,
}: {
  entityType: TrackEntity;
  entityId: string | number;
}) {
  useEffect(() => {
    track(entityType, String(entityId), 'view');
  }, [entityType, entityId]);

  return null;
}
