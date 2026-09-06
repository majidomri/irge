/**
 * Client-side event queue for /api/track.
 *
 * Batched rather than one request per event, because impressions arrive in
 * bursts: scrolling a page of 48 cards would otherwise be 48 requests, which
 * is both wasteful and the fastest way to trip the rate limit this site
 * already enforces on itself.
 *
 * Flushes on a timer and, more importantly, on `visibilitychange` — the one
 * moment a browser guarantees before a tab goes away. `pagehide`/`unload` are
 * not reliable on mobile Safari, which is most of this audience.
 *
 * sendBeacon first so the flush survives the navigation that usually follows a
 * click; fetch with keepalive as the fallback. Never throws: analytics must
 * not be able to break a page it is only watching.
 */
export type TrackEntity = 'profile' | 'biodata' | 'post' | 'story' | 'channel';
export type TrackEvent = 'view' | 'impression' | 'click' | 'share' | 'listen' | 'contact';

interface QueuedEvent {
  entityType: TrackEntity;
  entityId: string;
  event: TrackEvent;
}

const queue: QueuedEvent[] = [];

/** Matches MAX_BATCH on the server; flush early rather than have rows dropped. */
const MAX_QUEUE = 60;
const FLUSH_MS = 4000;

let timer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

/**
 * Impressions repeat as a card scrolls in and out of view. One per card per
 * page is the honest number, so the rest are dropped here rather than sent and
 * deduplicated later.
 */
const seen = new Set<string>();

function flush(): void {
  if (queue.length === 0) return;

  const events = queue.splice(0, queue.length);
  const body = JSON.stringify({ url: window.location.href, events });

  try {
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/track', blob)) return;
    }
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // A failed send is a lost event, which is the correct thing to lose.
  }
}

function bind(): void {
  if (listenersBound || typeof document === 'undefined') return;
  listenersBound = true;

  // The reliable one. visibilitychange fires when a tab is backgrounded or
  // closed on every browser that matters, including iOS Safari.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

export function track(entityType: TrackEntity, entityId: string, event: TrackEvent): void {
  if (typeof window === 'undefined' || !entityId) return;

  if (event === 'impression') {
    const key = `${entityType}:${entityId}`;
    if (seen.has(key)) return;
    seen.add(key);
  }

  bind();
  queue.push({ entityType, entityId, event });

  if (queue.length >= MAX_QUEUE) {
    flush();
    return;
  }

  // A click or a share is usually the last thing that happens before a
  // navigation, so do not sit on it for the full window.
  if (event === 'click' || event === 'share' || event === 'contact') {
    flush();
    return;
  }

  if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, FLUSH_MS);
  }
}
