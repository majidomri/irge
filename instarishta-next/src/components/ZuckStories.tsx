'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Zuck } from 'zuck.js';
import 'zuck.js/css';
import 'zuck.js/skins/facesnap';
import './zuck-overrides.css';
import { supabase, incrementStoryLikes } from '@/lib/supabase';
import {
  LikeIcon, CommentIcon, ShareIcon, ViewersIcon, StoryActionButton,
} from './StoryIcons';

const CommentDrawer = dynamic(() => import('./CommentDrawer'), { ssr: false });
const ShareSheet    = dynamic(() => import('./ShareSheet'), { ssr: false });
const StoryViewersSheet = dynamic(() => import('./StoryViewersSheet'), { ssr: false });

interface TimelineItem {
  id: string;
  name: string;
  photo: string;
  lastUpdated: number;
  /** Server-computed: every item in this group already watched by this viewer. */
  seen: boolean;
  /** This group is the signed-in viewer's own stories. */
  isSelf: boolean;
  items: {
    id: string; type: string; length: number; src: string; time: number;
    likes?: number; seen?: boolean; viewCount?: number;
  }[];
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
  const [viewersOpen, setViewersOpen] = useState(false);

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
      // zuck.js can track seen-rings in localStorage, but that is per-browser
      // and invisible to us. /api/stories now returns a real `seen` per group
      // from ir_story_views, so the server is the source of truth — a member
      // who watched on their phone sees a grey ring on their laptop too.
      localStorage: false,
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

  /**
   * Arrow-key navigation for the open story.
   *
   * zuck.js binds its own `onkeyup` on #zuck-modal — Escape closes, Enter and
   * Space advance — but it has no arrow keys, and because it is bound to the
   * element rather than the window it only fires while that container happens
   * to hold focus. Clicking a ring does not reliably give it focus, so in
   * practice the keyboard did nothing.
   *
   * This drives the same public modal API zuck.js exposes on the container, so
   * timers, transitions and the callbacks above all stay in sync — reaching
   * for `next()`/`previous()` rather than re-implementing navigation.
   */
  useEffect(() => {
    if (!openStoryId) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      const modalEl = document.querySelector('#zuck-modal') as (HTMLElement & {
        modal?: { next?: () => void; previous?: () => void; close?: () => void };
      }) | null;
      const modal = modalEl?.modal;
      if (!modal) return;

      if (e.key === 'ArrowRight') { e.preventDefault(); modal.next?.(); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); modal.previous?.(); }
      if (e.key === 'Escape')     { e.preventDefault(); modal.close?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openStoryId]);

  // Record the watch. Fires once per item per mount; the route is idempotent
  // on (story_id, viewer_id) so a re-watch never double-counts, and a failure
  // is deliberately silent — a lost view must not interrupt the story.
  const recordedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeItemId || recordedRef.current.has(activeItemId)) return;
    recordedRef.current.add(activeItemId);
    fetch(`/api/stories/${activeItemId}/view`, { method: 'POST' }).catch(() => {});
  }, [activeItemId]);

  const activeStory = stories?.find(s => s.id === openStoryId) ?? null;
  const activeItem  = activeStory?.items.find(i => i.id === activeItemId) ?? null;
  const displayLikes = Number(activeItem?.likes ?? 0)
    + (activeItemId && liked.has(activeItemId) ? 1 : 0)
    + Number(activeItemId ? likeBump[activeItemId] ?? 0 : 0);

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

  const openViewers = () => {
    if (!activeItemId) return;
    setViewerPaused(true);
    setViewersOpen(true);
  };

  const closeViewers = () => {
    setViewersOpen(false);
    setViewerPaused(false);
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
        /* Bottom bar — mirrors the Xavio story viewer: poster chip on the
           left, icon-only action cluster on the right. 64 px tall so the
           48 px buttons clear Material's tap-target minimum. */
        <div className="fixed left-0 right-0 bottom-0 flex items-center justify-between gap-3 px-4"
          style={{
            zIndex: 100050,
            height: 64, paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0px)',
            background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 60%, transparent 100%)',
          }}>
          <div className="flex items-center gap-2.5 min-w-0">
            {activeStory?.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeStory.photo} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
            )}
            <span className="text-white text-[15px] font-semibold truncate max-w-[36vw]">
              {activeStory?.name}
            </span>
            {displayLikes > 0 && (
              <span className="shrink-0 text-[13px] font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {displayLikes} {displayLikes === 1 ? 'like' : 'likes'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <StoryActionButton
              ariaLabel={activeItemId && liked.has(activeItemId) ? 'Liked' : 'Like'}
              onClick={doLike}
              tone={activeItemId && liked.has(activeItemId) ? 'pink' : 'white'}
            >
              <LikeIcon size={26} filled={!!activeItemId && liked.has(activeItemId)} />
            </StoryActionButton>

            <StoryActionButton ariaLabel="Comments" onClick={openComment}>
              <CommentIcon size={26} />
            </StoryActionButton>

            <StoryActionButton ariaLabel="Share" onClick={openShare} disabled={shareLoading}>
              <ShareIcon size={26} />
            </StoryActionButton>

            {/* Owner-only. There is deliberately no reply-privately action:
                InstaRishta has no DM channel, and the comment chips are the
                only sanctioned way to reach a poster. */}
            {activeStory?.isSelf && (
              <StoryActionButton ariaLabel={`Viewers (${activeItem?.viewCount ?? 0})`} onClick={openViewers}>
                <ViewersIcon size={26} />
              </StoryActionButton>
            )}
          </div>
        </div>
      )}

      {drawer === 'comment' && activeItemId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100060 }}>
          <CommentDrawer entityId={activeItemId} entityType="story" onClose={closeDrawer} />
        </div>
      )}
      {viewersOpen && activeItemId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100060 }}>
          <StoryViewersSheet storyId={activeItemId} onClose={closeViewers} />
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
