'use client';
import { useEffect, useRef, useState } from 'react';
import * as ZuckModule from 'zuck.js';
import 'zuck.js/css';
import './zuck-overrides.css';

// zuck.js is published as a plain CommonJS `module.exports = Zuck` — its own
// .d.ts claims a default export, but under Next's bundler that shape doesn't
// always land on `.default` (it can come through as the module object
// itself, or with the function hiding under `.default` depending on how the
// chunk gets interop-wrapped). Caught live: `import Zuck from 'zuck.js'`
// built and typechecked fine but threw "is not a function" at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Zuck = ((ZuckModule as any).default ?? ZuckModule) as (el: HTMLElement, options: Record<string, unknown>) => unknown;

interface TimelineItem {
  id: string;
  name: string;
  photo: string;
  lastUpdated: string;
  items: { id: string; type: string; length: number; src: string; time: string }[];
}

/**
 * Story tray + full-screen viewer, powered by zuck.js (MIT,
 * https://github.com/ramonszo/zuck.js) instead of the previous hand-rolled
 * flat-list viewer. Replaces the old per-image slideshow with the grouped,
 * per-poster ring UX the library is built for — data is grouped server-side
 * in /api/stories (see that route for why: resolving a poster's display
 * name needs a privileged query, ir_user_profiles isn't publicly readable).
 *
 * zuck.js owns the DOM it's given directly (it isn't a React component), so
 * this wrapper mounts it imperatively in an effect and clears the container
 * on unmount/re-fetch rather than trying to reconcile it with React.
 */
export default function ZuckStories({ channelId }: { channelId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stories, setStories] = useState<TimelineItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/stories?channel_id=${channelId}`);
        const data = await res.json().catch(() => ({ stories: [] }));
        if (!cancelled) setStories(data.stories ?? []);
      } catch {
        if (!cancelled) setStories([]);
      }
    })();
    return () => { cancelled = true; };
  }, [channelId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !stories || stories.length === 0) return;

    Zuck(el, {
      avatars: true,
      backButton: true,
      backNative: false,
      previousTap: true,
      autoFullScreen: false,
      localStorage: true, // lets zuck.js track "seen" rings itself, per-browser
      stories,
    });

    // zuck.js has no documented teardown call — clearing the container is
    // what stops a stale ring set (and its click handlers) from lingering
    // across a channel switch or story re-fetch.
    return () => { el.innerHTML = ''; };
  }, [stories]);

  if (stories !== null && stories.length === 0) return null;

  return <div ref={containerRef} className="ir-zuck-stories" />;
}
