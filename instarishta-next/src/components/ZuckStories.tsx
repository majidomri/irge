'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Zuck } from 'zuck.js';
import 'zuck.js/css';
import 'zuck.js/skins/facesnap';
import './zuck-overrides.css';
import { supabase, incrementStoryLikes } from '@/lib/supabase';

const CommentDrawer = dynamic(() => import('./CommentDrawer'), { ssr: false });
const ShareSheet    = dynamic(() => import('./ShareSheet'), { ssr: false });

interface TimelineItem {
  id: string;
  name: string;
  photo: string;
  lastUpdated: number;
  items: { id: string; type: string; length: number; src: string; time: number; likes?: number }[];
}

function currentItemId(): string | null {
  return document
    .querySelector<HTMLElement>('#zuck-modal .story-viewer.viewing .slides .item.active')
    ?.getAttribute('data-item-id') ?? null;
}

function setViewerPaused(paused: boolean) {
  const viewer = document.querySelector<HTMLElement>('#zuck-modal .story-viewer.viewing');
  viewer?.classList.toggle('paused', paused);
  const video = viewer?.querySelector<HTMLVideoElement>('video.media');
  if (video) { if (paused) video.pause(); else video.play().catch(() => {}); }
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
 *
 * zuck.js ships no like/comment/share UI of its own (confirmed by reading
 * its source templates) — this bar is layered on top as a plain fixed
 * overlay above its modal (z-index 100000), driven by zuck's onOpen/onView/
 * onNavigateItem/onClose callbacks rather than trying to inject React into
 * DOM zuck owns. entityId for comments/likes/share is the *current photo's*
 * ir_stories row id, read straight off the active slide's data-item-id
 * since zuck's own callbacks only ever hand back the poster-level story id.
 */
export default function ZuckStories({ channelId }: { channelId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stories, setStories] = useState<TimelineItem[] | null>(null);

  const [openStoryId, setOpenStoryId] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [likeBump, setLikeBump] = useState<Record<string, number>>({});
  const [drawer, setDrawer] = useState<null | 'comment' | 'share'>(null);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);

  useEffect(() => {
    const s = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('ir_story_liked_')) s.add(k.replace('ir_story_liked_', ''));
    }
    setLiked(s);
  }, []);

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

    const refreshActiveItem = () => setActiveItemId(currentItemId());

    Zuck(el, {
      avatars: true,
      skin: 'facesnap',
      backButton: true,
      backNative: false,
      previousTap: true,
      autoFullScreen: false,
      localStorage: true, // lets zuck.js track "seen" rings itself, per-browser
      stories,
      callbacks: {
        onOpen: (storyId: string, cb: () => void) => {
          document.body.style.overflow = 'hidden';
          setOpenStoryId(String(storyId));
          cb(); // builds the viewer DOM, then fires onView — read the DOM there, not here
        },
        onView: (storyId: string, cb?: () => void) => {
          setOpenStoryId(String(storyId));
          refreshActiveItem();
          cb?.();
        },
        onNavigateItem: (storyId: string, nextStoryId: string, cb: () => void) => {
          cb();
          refreshActiveItem();
        },
        onClose: (storyId: string, cb: () => void) => {
          document.body.style.overflow = '';
          setOpenStoryId(null);
          setActiveItemId(null);
          setDrawer(null);
          cb();
        },
      },
    });

    // zuck.js has no documented teardown call — clearing the container is
    // what stops a stale ring set (and its click handlers) from lingering
    // across a channel switch or story re-fetch.
    return () => { el.innerHTML = ''; };
  }, [stories]);

  const activeStory = stories?.find(s => s.id === openStoryId) ?? null;
  const activeItem  = activeStory?.items.find(i => i.id === activeItemId) ?? null;
  const displayLikes = (activeItem?.likes ?? 0) + (activeItemId && liked.has(activeItemId) ? 1 : 0) + (activeItemId ? (likeBump[activeItemId] ?? 0) : 0);

  const doLike = () => {
    if (!activeItemId || liked.has(activeItemId)) return;
    setLiked(prev => new Set(prev).add(activeItemId));
    localStorage.setItem('ir_story_liked_' + activeItemId, '1');
    incrementStoryLikes(activeItemId).catch(() => {});
  };

  const openComment = () => {
    if (!activeItemId) return;
    setViewerPaused(true);
    setDrawer('comment');
  };

  const openShare = async () => {
    if (!activeItemId || shareLoading) return;
    setViewerPaused(true);
    setShareLoading(true);
    try {
      const { data } = await supabase.rpc('ir_create_nano_id', { p_entity_type: 'story', p_entity_id: activeItemId });
      if (data) { setShareSlug(data as string); setDrawer('share'); }
    } finally {
      setShareLoading(false);
    }
  };

  const closeDrawer = () => {
    setDrawer(null);
    setShareSlug(null);
    setViewerPaused(false);
  };

  if (stories !== null && stories.length === 0) return null;

  return (
    <>
      <div ref={containerRef} className="ir-zuck-stories" />

      {openStoryId && activeItemId && (
        <div className="fixed left-0 right-0 bottom-0 flex items-center gap-4 px-5"
          style={{
            zIndex: 100050,
            paddingTop: 22, paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
            background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)',
          }}>
          <button onClick={doLike} className="flex items-center gap-1.5 border-0 bg-transparent cursor-pointer">
            <span className="text-xl">{activeItemId && liked.has(activeItemId) ? '❤️' : '🤍'}</span>
            <span className="text-sm font-semibold text-white">{displayLikes}</span>
          </button>
          <button onClick={openComment} className="flex items-center gap-1.5 border-0 bg-transparent cursor-pointer">
            <span className="text-xl">💬</span>
            <span className="text-sm font-semibold text-white">Comment</span>
          </button>
          <button onClick={openShare} disabled={shareLoading}
            className="flex items-center gap-1.5 border-0 bg-transparent cursor-pointer disabled:opacity-50">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      )}

      {drawer === 'comment' && activeItemId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100060 }}>
          <CommentDrawer entityId={activeItemId} entityType="story" onClose={closeDrawer} />
        </div>
      )}
      {drawer === 'share' && shareSlug && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100060 }}>
          <ShareSheet slug={shareSlug} entityType="story" title={activeStory?.name ?? 'InstaRishta Story'} onClose={closeDrawer} />
        </div>
      )}
    </>
  );
}
