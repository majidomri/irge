'use client';
import { Fragment, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import {
  supabase,
  getChannelBySlug, getBrowsableChannels, getPosts, countPosts,
  incrementViews, incrementLikes,
  subscribeChannel, unsubscribeChannel,
  POST_PAGE_SIZE,
  type IChannel, type IPost,
} from '@/lib/supabase';
import GradientText from '@/components/ui/GradientText';
import TextType from '@/components/ui/TextType';
import ClickSpark from '@/components/ui/ClickSpark';
import FeaturedCarousel from '@/components/FeaturedCarousel';
import FeedFilters, {
  activeCount, applyFeedFilters, EMPTY_FILTERS, type FeedFilterState,
} from './FeedFilters';
import ZuckStories from '@/components/ZuckStories';
import { useChromeAutoHide } from '@/lib/hooks/useChromeAutoHide';
import {
  LikeIcon, CommentIcon, ShareIcon, StoryActionButton,
} from '@/components/StoryIcons';

const MagicRings = dynamic(() => import('@/components/ui/MagicRings'), { ssr: false });
const CommentDrawer = dynamic(() => import('@/components/CommentDrawer'), { ssr: false });
const ShareSheet = dynamic(() => import('@/components/ShareSheet'), { ssr: false });

const POST_CATS = [
  { id: 'all',      label: 'All',       icon: '✦' },
  { id: 'medical',  label: 'Medical',   icon: '🩺', kw: ['doctor','mbbs','surgeon','nurse','pharmacist','dentist','medical','hospital','health'] },
  { id: 'tech',     label: 'Tech',      icon: '💻', kw: ['engineer','software','developer','technology','computer','programming','data','cyber','electronics','mechanical','civil','electrical'] },
  { id: 'business', label: 'Business',  icon: '💼', kw: ['business','entrepreneur','finance','banking','accountant','chartered','mba','manager','marketing','sales','commerce'] },
  { id: 'edu',      label: 'Education', icon: '🎓', kw: ['teacher','professor','lecturer','education','school','university','tutor','academic','phd','research'] },
  { id: 'legal',    label: 'Legal',     icon: '⚖️', kw: ['lawyer','advocate','legal','law','attorney','judge','court','llb','llm'] },
  { id: 'govt',     label: 'Govt',      icon: '🏛️', kw: ['ias','ips','ifs','government','civil service','military','army','navy','air force','police','upsc'] },
];

/** The one chip look the feed's filter rows share. */
function chipStyle(on: boolean) {
  return {
    background:  on ? '#00A86B' : 'rgba(255,255,255,0.08)',
    color:       on ? '#0B0B0A' : 'rgba(255,255,255,0.7)',
    borderColor: on ? '#00A86B' : 'rgba(255,255,255,0.12)',
  };
}

function catOf(p: IPost) {
  const hay = ((p.title ?? '') + ' ' + (p.caption ?? '')).toLowerCase();
  for (const c of POST_CATS.slice(1)) {
    if (c.kw?.some(k => hay.includes(k))) return c.id;
  }
  return 'all';
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Compact "57d" / "5h" style badge — matches the grid card design being copied.
function timeAgoShort(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// ── Audio player (shared) ─────────────────────────────────────────────────────

function fmtTime(s: number) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function AudioPlayer({ url, title, caption, onPlayAttempt }: {
  url: string; title?: string; caption?: string;
  onPlayAttempt?: () => Promise<boolean>;
}) {
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const rafRef     = useRef(0);
  const [playing,  setPlaying]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [current,  setCurrent]  = useState(0);
  const [duration, setDuration] = useState(0);

  const tick = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    setCurrent(a.currentTime);
    if (!a.paused) rafRef.current = requestAnimationFrame(tick);
  }, []);

  const init = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const a = new Audio(url);
    audioRef.current = a;
    a.onloadstart      = () => setLoading(true);
    a.oncanplay        = () => { setLoading(false); setDuration(a.duration || 0); };
    a.ondurationchange = () => setDuration(a.duration || 0);
    a.onended          = () => { setPlaying(false); setCurrent(0); cancelAnimationFrame(rafRef.current); };
    a.onerror          = () => { setLoading(false); setPlaying(false); };
    a.ontimeupdate     = () => setCurrent(a.currentTime);
    return a;
  }, [url]);

  const togglePlay = async () => {
    const a = init();
    if (playing) {
      a.pause(); cancelAnimationFrame(rafRef.current); setPlaying(false);
    } else {
      if (onPlayAttempt) {
        const ok = await onPlayAttempt();
        if (!ok) return;
      }
      a.play().catch(() => {});
      rafRef.current = requestAnimationFrame(tick);
      setPlaying(true);
    }
  };

  const skip = (secs: number) => {
    const a = audioRef.current ?? init();
    const dur = (isFinite(a.duration) && a.duration > 0) ? a.duration : duration;
    const newTime = Math.max(0, Math.min(dur, a.currentTime + secs));
    const wasPlaying = !a.paused;
    if (wasPlaying) a.pause();
    a.currentTime = newTime;
    setCurrent(newTime);
    if (wasPlaying) a.play().catch(() => {});
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    a.currentTime = +e.target.value;
    setCurrent(a.currentTime);
  };

  useEffect(() => () => { audioRef.current?.pause(); cancelAnimationFrame(rafRef.current); }, []);

  const pct = duration ? (current / duration) * 100 : 0;

  const SkipBtn = ({ secs }: { secs: number }) => (
    <button onClick={() => skip(secs)}
      className="flex flex-col items-center justify-center gap-0.5 w-11 h-11 rounded-full border-0"
      style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        {secs < 0
          ? <path d="M11.5 12 6 7v10l5.5-5zm1 0 5.5 5V7L12.5 12z"/>
          : <path d="M12.5 12 18 7v10l-5.5-5zm-1 0L6 7v10l5.5-5z"/>}
      </svg>
      <span className="text-[9px] font-bold leading-none">{Math.abs(secs)}s</span>
    </button>
  );

  return (
    <div className="w-full pt-2">
      {(title || caption) && (
        <div className="text-center mb-5 px-2">
          {title   && <p className="text-lg font-extrabold text-white mb-1 leading-tight">{title}</p>}
          {caption && <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>{caption}</p>}
        </div>
      )}

      {/* Progress */}
      <div className="px-1 mb-4">
        <div className="relative h-5 flex items-center">
          <div className="absolute inset-x-0 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
          <div className="absolute left-0 h-1 rounded-full transition-none" style={{ background: '#00A86B', width: `${pct}%` }} />
          <div className="absolute w-4 h-4 rounded-full bg-white pointer-events-none"
            style={{ left: `calc(${pct}% - 8px)`, boxShadow: '0 1px 6px rgba(0,0,0,0.5)', zIndex: 2 }} />
          <input type="range" min={0} max={duration || 100} step={0.2} value={current}
            onChange={seek}
            className="absolute inset-0 w-full opacity-0 cursor-pointer" style={{ zIndex: 3 }} />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[11px] font-medium tabular-nums" style={{ color: 'rgba(255,255,255,0.45)' }}>{fmtTime(current)}</span>
          <span className="text-[11px] font-medium tabular-nums" style={{ color: 'rgba(255,255,255,0.45)' }}>{fmtTime(duration)}</span>
        </div>
      </div>

      {/* Controls: −5s · play/pause · +5s */}
      <div className="flex items-center justify-center gap-6">
        <SkipBtn secs={-5} />
        {/* Play button with MagicRings halo when playing */}
        <div className="relative" style={{ width: 64, height: 64 }}>
          {playing && (
            <div className="absolute pointer-events-none" style={{ inset: -20, borderRadius: '50%', overflow: 'hidden' }}>
              <MagicRings color="#006241" colorTwo="#00C87A" ringCount={4} speed={1.0} opacity={0.8} baseRadius={0.3} radiusStep={0.14} lineThickness={2} noiseAmount={0.06} fadeIn={0.5} fadeOut={0.4} />
            </div>
          )}
          <button onClick={togglePlay}
            className="w-16 h-16 rounded-full flex items-center justify-center border-0 relative"
            style={{ background: '#00A86B', color: '#fff', boxShadow: '0 6px 24px rgba(0,168,107,0.55)', zIndex: 1 }}>
            {loading ? (
              <span className="block w-6 h-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : playing ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 6h3v12H8zm5 0h3v12h-3z"/></svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 3 }}><path d="M8 6.5v11l9-5.5z"/></svg>
            )}
          </button>
        </div>
        <SkipBtn secs={5} />
      </div>
    </div>
  );
}

// ── Post modal ────────────────────────────────────────────────────────────────

function PostModal({
  post, allPosts, liked, onClose, onLike, onNavigate, onPlayAttempt, total, onNeedMore,
}: {
  post: IPost; allPosts: IPost[];
  liked: Set<string>; onClose: () => void;
  onLike: (id: string) => void; onNavigate: (p: IPost) => void;
  onPlayAttempt?: () => Promise<boolean>;
  /** How many posts the channel actually holds, not how many are loaded. */
  total?: number;
  /** Ask the feed for the next page; the viewer runs off the end without it. */
  onNeedMore?: () => void;
}) {
  // Deduped: `image` is the cover and `images` is the carousel, and whether
  // the cover is also the first carousel entry depends on who wrote the row.
  // The show's publisher writes the full set to `images` with `images[0]` as
  // the cover, so a plain concat showed frame one twice and counted "1 / 4"
  // on a three-frame biodata.
  const imgs    = [...new Set(
    [post.image, ...(Array.isArray(post.images) ? post.images : [])]
      .filter((v): v is string => Boolean(v)),
  )];
  const isAudio = !!post.audio_url;
  const isText  = !post.image && !isAudio;
  const hasImg  = imgs.length > 0;

  const [carIdx,  setCarIdx]  = useState(0);
  const [commenting, setCommenting] = useState(false);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const swipeRef    = useRef({ x: 0, y: 0, inCar: false, onControl: false });
  const postIdx     = allPosts.indexOf(post);

  // Lock body scroll while modal is mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setCarIdx(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  /**
   * Where a new post opens.
   *
   * Forward always opens on the first frame. Backward has to open on the
   * LAST one, or the sequence is not reversible: stepping back out of a post
   * and forward again would return you to a different frame than the one you
   * left, and reading a three-frame biodata backwards would skip two thirds
   * of it. `landOnLast` carries that intent across the post change.
   */
  const landOnLast = useRef(false);
  useEffect(() => {
    const last = landOnLast.current ? imgs.length - 1 : 0;
    landOnLast.current = false;
    setCarIdx(last);
    scrollRef.current?.scrollTo({ left: last * (scrollRef.current?.clientWidth ?? 0) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  /**
   * Move the carousel by whole slides, and only by whole slides.
   *
   * `scroll-snap-type: x mandatory` refuses every position that is not a snap
   * point -- setting scrollLeft to 500 on a 1440-wide slide put it straight
   * back to 0. So a mouse wheel, which arrives as a run of small deltas, never
   * accumulated enough to cross the threshold and the carousel simply never
   * moved on a desktop; a short or slow swipe sprang back the same way, which
   * is the stickiness on a phone. Nothing nudges the scroller any more: every
   * input asks for slide n, and this is the one thing that goes there.
   */
  const goToSlide = useCallback((i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(i, imgs.length - 1));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    setCarIdx(next);
  }, [imgs.length]);


  const goPrev = useCallback(() => {
    if (postIdx > 0) onNavigate(allPosts[postIdx - 1]);
  }, [postIdx, allPosts, onNavigate]);

  const goNext = useCallback(() => {
    if (postIdx < allPosts.length - 1) onNavigate(allPosts[postIdx + 1]);
  }, [postIdx, allPosts, onNavigate]);

  /**
   * One sequence, not two.
   *
   * A biodata's frames and the channel's posts were separate axes with a
   * separate control each, which put four chevrons on one screen -- a pair
   * for posts, a pair for frames, and the close button wearing the same
   * glyph again. Nobody can be asked to tell those apart mid-read.
   *
   * So this is the stories model that zuck.js and Instagram both use, and
   * that the story viewer on this very site already follows: forward means
   * the next frame of this biodata, and when the frames run out it means the
   * next post. One direction, one meaning, whatever you drive it with.
   */
  const goForward = useCallback(() => {
    if (carIdx < imgs.length - 1) goToSlide(carIdx + 1);
    else goNext();
  }, [carIdx, imgs.length, goToSlide, goNext]);

  const goBack = useCallback(() => {
    if (carIdx > 0) { goToSlide(carIdx - 1); return; }
    landOnLast.current = true;
    goPrev();
  }, [carIdx, goToSlide, goPrev]);

  /** Nothing further in that direction, so the control is not offered. */
  const atStart = postIdx === 0 && carIdx === 0;
  const atEnd   = postIdx === allPosts.length - 1 && carIdx === imgs.length - 1;

  /**
   * A wheel drives the same sequence, rather than being swallowed by a
   * scroller that cannot accept a partial scroll. Either axis works -- a
   * plain mouse only emits deltaY, and a trackpad's horizontal swipe reads
   * more naturally as sideways -- and one gesture is one step, locked for
   * 320ms so an inertial trackpad flick does not run through the whole set.
   */
  const wheelLock = useRef(0);
  const onCarouselWheel = useCallback((e: React.WheelEvent) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 4) return;
    e.preventDefault();
    const now = Date.now();
    if (now < wheelLock.current) return;
    wheelLock.current = now + 320;
    if (d > 0) goForward(); else goBack();
  }, [goForward, goBack]);

  /**
   * The viewer can only page through posts the feed has loaded, and the feed
   * loads on scroll -- so opening the first post and pressing next stopped at
   * the end of page one, on a channel with far more. Ask for the next page as
   * the end comes into view rather than when it is reached.
   */
  useEffect(() => {
    if (onNeedMore && postIdx >= allPosts.length - 3) onNeedMore();
  }, [postIdx, allPosts.length, onNeedMore]);

  /**
   * Keyboard navigation. The modal had none — not even Escape — so on desktop
   * the only way through a channel was clicking the small chevrons.
   *
   * ←/→ walk the sequence: the next frame, then the next post. ↑/↓ skip a
   * whole biodata at a time, for readers who want the covers only. Escape
   * closes.
   *
   * Arrows keep working while the comment drawer is open, on purpose: the
   * drawer is docked beside the post, not on top of it, so navigating with
   * comments open is the normal way to browse — exactly how YouTube lets you
   * move between Shorts without closing the comment panel. The drawer stays
   * mounted and re-targets itself to the new post.
   *
   * Escape is the one key the drawer does own, and it handles that itself:
   * its listener runs later and stops propagation, so the first Escape closes
   * the drawer and the second closes the post.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (commenting) setCommenting(false); else onClose();
        return;
      }

      // Never hijack typing in an input, textarea or contenteditable.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      if (e.key === 'ArrowLeft')  { e.preventDefault(); goBack(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goForward(); }
      if (e.key === 'ArrowUp')    { e.preventDefault(); goPrev(); }
      if (e.key === 'ArrowDown')  { e.preventDefault(); goNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext, goBack, goForward, onClose, commenting]);

  // Nano-id slugs are get-or-create — resolved on demand rather than
  // fetched for every post in the feed just in case someone shares it.
  const openShare = async () => {
    setShareLoading(true);
    try {
      const { data } = await supabase.rpc('ir_create_nano_id', { p_entity_type: 'post', p_entity_id: post.id });
      if (data) setShareSlug(data as string);
    } finally {
      setShareLoading(false);
    }
  };

  const onSwipeStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipeRef.current = {
      x: t.clientX, y: t.clientY,
      inCar: imgs.length > 1 && !!carouselRef.current?.contains(e.target as Node),
      /**
       * A tap on a control is that control's, not the frame's.
       *
       * THIS is what made the comment button jump. Like, Comment and Share sit
       * in a column down the RIGHT edge, and the right third is the tap zone
       * for "next post" -- so one tap both navigated and opened the drawer,
       * landing you on the next post's comments. Guarding on `commenting` did
       * not help: at touch time the drawer is not open yet.
       *
       * Recorded at touchstart rather than touchend because the element under
       * the finger can change once React re-renders. Same test the double-tap
       * and long-press handlers on this element already use.
       */
      onControl: !!(e.target as Element)?.closest?.(
        'button, a, input, textarea, select, label, [role="button"]',
      ),
    };
  };

  const onSwipeEnd = (e: React.TouchEvent) => {
    /* A swipe inside the carousel is the same swipe: it steps the sequence
       rather than being left to a mandatory-snap scroller that springs back
       from anything short of a full page. */
    void swipeRef.current.inCar;

    /**
     * An overlay owns its own touches.
     *
     * The comment drawer and the share sheet render inside this element, so
     * every tap in them bubbles here — and the drawer docks against the post's
     * right edge, which is the tap zone for "next post". Tapping the comment
     * box therefore jumped to the next post and opened ITS comments. The
     * keyboard handler already declines to act while an overlay is up; this is
     * the same rule for touch.
     */
    if (commenting || shareSlug) return;
    if (swipeRef.current.onControl) return;
    const dx = e.changedTouches[0].clientX - swipeRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeRef.current.y;

    /**
     * A finger that barely moved is a tap, not a swipe — route it to the tap
     * zones instead of discarding it. Stories train people to tap the edges of
     * the frame to move; the post viewer only understood swipes, so those taps
     * did nothing at all.
     *
     * Zones are the outer thirds. The middle third stays inert so tapping the
     * biodata itself never navigates away from it by accident.
     */
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const zone = e.changedTouches[0].clientX / window.innerWidth;
      if (zone < 0.33) goBack();
      else if (zone > 0.67) goForward();
      return;
    }

    if (Math.abs(dx) < 65 || Math.abs(dy) > Math.abs(dx) * 0.9) return;
    if (dx < 0) goForward();
    if (dx > 0) goBack();
  };

  const coverForBg = imgs[carIdx] || imgs[0];

  return (
    // Full-viewport black backdrop — kept separate from the phone-width
    // column below so a real (portrait) photo never stretches to fill an
    // ultra-wide desktop viewport; the leftover sides just stay solid black.
    <div className="fixed inset-0 z-200" style={{ background: '#000' }}>
    {/* A biodata frame is a document, not a snapshot: it is meant to be read
        edge to edge, so an image post gets the whole viewport and the chrome
        floats over it. The 480 cap stays for audio and text posts, where the
        panel below the media is the content and a phone-width column reads
        better than a full-bleed one. `contain` means an uncapped width still
        cannot stretch the frame -- on a wide screen the height limits it and
        the sides simply stay black. */}
    <div className="relative mx-auto flex flex-col overflow-hidden h-full"
      style={{ background: '#0d1117', maxWidth: hasImg && !isAudio ? undefined : 480 }}
      onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>

      {/* Ambient blur */}
      {coverForBg && (
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `url(${coverForBg})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'blur(36px) brightness(0.15)', transform: 'scale(1.18)',
          transition: 'background-image 0.4s',
        }} />
      )}

      {/* Top bar. Over the image, not above it, so the frame keeps the full
          height of the viewport. */}
      <div className={`z-20 flex items-center gap-3 px-4 pb-3 shrink-0 ${
        hasImg && !isAudio ? 'absolute inset-x-0 top-0' : 'relative'
      }`}
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)', background: 'linear-gradient(to bottom,rgba(0,0,0,0.65) 0%,transparent 100%)' }}>
        {/* ✕, not ‹. Close is not a direction, and wearing the same glyph as
            the navigation was a third chevron on a screen that already had
            too many. */}
        <button onClick={onClose} aria-label="Close"
          className="w-9 h-9 rounded-full flex items-center justify-center text-lg border-0"
          style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}>✕</button>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}>
          {postIdx + 1} / {total ?? allPosts.length}
        </span>
        {imgs.length > 1 && (
          <span className="ml-auto text-xs px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>
            {carIdx + 1} / {imgs.length}
          </span>
        )}
      </div>

      {/* ── Image carousel — edge-to-edge, full-bleed; sized to fit screen with no scroll ── */}
      {/* Was a fixed 54dvh with object-cover, which cropped ~44% off a tall
          biodata while leaving ~360px of empty black below the image. flex-1
          lets the carousel absorb whatever the meta/action rows don't use, so
          the image gets the full remaining height. min-h-0 is required or the
          flex child refuses to shrink below its content size. */}
      {hasImg && (
        <div ref={carouselRef}
          onWheel={onCarouselWheel}
          className={`relative z-10 overflow-hidden ${isAudio ? 'shrink-0' : 'flex-1 min-h-0'}`}
          // The action row is back in flow below, so the image takes what is
          // left rather than the whole frame -- it must END above the icons,
          // not run under them.
          style={isAudio ? { height: '32dvh' } : { minHeight: '40dvh' }}>
          <div ref={scrollRef}
            className="ir-no-scrollbar absolute inset-0 flex overflow-x-auto snap-x snap-mandatory"
            style={{
              WebkitOverflowScrolling: 'touch',
              scrollBehavior: 'smooth',
              // A sideways swipe belongs to the carousel; without this it
              // chains to the page and, on iOS, to the back gesture.
              overscrollBehaviorX: 'contain',
            } as React.CSSProperties}>
            {imgs.map((url, i) => (
              <div key={i} className="min-w-full h-full snap-center relative overflow-hidden">
                {/* No per-slide blurred copy here any more. Every slide was
                    painting a blur-2xl of a 1080x1920 image at full size, and
                    the compositor redrew all of them through a drag -- which
                    is most of why the carousel felt sticky. The ambient blur
                    behind the whole modal already fills the frame, and it
                    follows `carIdx`, so nothing is lost but the jank. */}
                <img src={url} alt={`Photo ${i + 1}`}
                  className="relative w-full h-full object-contain select-none"
                  loading={i === 0 ? 'eager' : 'lazy'}
                  style={{ pointerEvents: 'none' }}
                  draggable={false} />
              </div>
            ))}
          </div>

          {/* Dots — overlaid on the image so they are visible without
              scrolling, and each one goes to its own frame rather than just
              reporting which frame you are on. */}
          {imgs.length > 1 && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-2 z-10 flex justify-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}>
              {imgs.map((_, i) => (
                <button key={i}
                  onClick={(e) => { e.stopPropagation(); goToSlide(i); }}
                  aria-label={`Photo ${i + 1}`}
                  aria-current={i === carIdx}
                  className="rounded-full transition-all border-0 p-0"
                  style={{
                    width: i === carIdx ? 18 : 6, height: 6,
                    background: i === carIdx ? '#00A86B' : 'rgba(255,255,255,0.45)',
                  }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Content (fits in viewport, no scroll) ──
          Imported biodata has no title and no caption, so for those posts this
          panel renders nothing — but it still claimed flex-1 and split the
          modal 50/50 with the image, leaving a ~435px empty black band while
          the biodata above it was squeezed. It only earns flex when it has
          something to show; otherwise it collapses and the image takes the
          space. */}
      <div className={`relative z-10 overflow-hidden ${
        hasImg && !isAudio ? 'hidden' : 'px-5 pt-3 pb-2'
      } ${(isAudio || isText) ? 'flex-1 min-h-0' : 'shrink-0'}`}>
        {/* Audio player */}
        {isAudio && (
          <AudioPlayer url={post.audio_url!} title={post.title} caption={post.caption} onPlayAttempt={onPlayAttempt} />
        )}

        {/* Text-only post */}
        {isText && (
          <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {post.title && (
              <p className="text-base font-bold mb-3">
                <GradientText colors={['#00C87A', '#ffffff', '#00A86B', '#ffffff']} animationSpeed={8} className="text-base font-bold">
                  {post.title}
                </GradientText>
              </p>
            )}
            {post.caption && (
              <TextType
                as="p"
                text={post.caption}
                typingSpeed={18}
                deletingSpeed={0}
                pauseDuration={99999}
                loop={false}
                showCursor
                cursorCharacter="▋"
                cursorBlinkDuration={0.6}
                initialDelay={300}
                className="text-sm leading-loose"
                style={{ color: 'rgba(255,255,255,0.72)' }}
              />
            )}
          </div>
        )}

        {/* No title or caption for an image post. On a biodata frame the name,
            the IR id and every fact are already drawn into the picture, so the
            text below it repeated what the reader could see -- and, worse, the
            panel claimed flex-1 to say it, halving the height of the very
            thing it was describing. */}
      </div>

      {/* ── Bottom bar ──
          The story viewer's bar, to the pixel: 64px tall, px-4, a gradient
          scrim instead of a slab, and no rule across the top. The 20px band
          it replaces was 89px of chrome for a 48px row of buttons.

          The one thing it does not copy is the position. Xavio's bar floats
          over the story; this one stays in flow, so the biodata ends above
          the icons rather than running under them. Its height is set by the
          48px buttons plus 8px either side, which is as compact as a
          Material tap target allows. */}
      <div className="relative z-20 shrink-0 flex items-center justify-between gap-3 px-4"
        style={{
          minHeight: 64,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 60%, transparent 100%)',
        }}>
          {/* Every part had `truncate`, so at 390px the row read
              "0 li… · 20 vie… · 2 Sept 2…" -- three clipped words instead of
              one dropped one. The counts are short and fixed, so they never
              shrink; the date is the part that yields, and below 430px it
              stands down altogether -- 380 was too generous: at 390 with a
              three-digit view count it still clipped to "2 Sept 20…". */}
          <div className="flex items-baseline gap-2 min-w-0 text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {/* Was a bare "0" with no icon or label — unreadable as a like
                count next to "3 views". */}
            <span className="font-semibold text-white shrink-0">
              {(() => {
                const n = (post.likes ?? 0) + (liked.has(post.id) ? 1 : 0);
                return `${n} ${n === 1 ? 'like' : 'likes'}`;
              })()}
            </span>
            <span className="shrink-0">·</span>
            <span className="shrink-0">
              {(() => {
                const n = (post.views ?? 0) + 1;
                return `${n} ${n === 1 ? 'view' : 'views'}`;
              })()}
            </span>
            <span className="hidden min-[430px]:inline shrink-0">·</span>
            <span className="hidden min-[430px]:inline truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {fmt(post.created_at)}
            </span>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <StoryActionButton
              ariaLabel={liked.has(post.id) ? 'Liked' : 'Like'}
              onClick={() => onLike(post.id)}
              tone={liked.has(post.id) ? 'pink' : 'white'}
            >
              <LikeIcon size={26} filled={liked.has(post.id)} />
            </StoryActionButton>

            <StoryActionButton ariaLabel="Comments" onClick={() => setCommenting(true)}>
              <CommentIcon size={26} />
            </StoryActionButton>

            <StoryActionButton ariaLabel="Share" onClick={openShare} disabled={shareLoading}>
              <ShareIcon size={26} />
            </StoryActionButton>
          </div>
      </div>

      {/* stageWidth matches the modal column's maxWidth below, so the drawer
          docks against the post's edge rather than the viewport's. */}
      {commenting && (
        <CommentDrawer entityId={post.id} stageWidth={480} onClose={() => setCommenting(false)} />
      )}
      {shareSlug && (
        <ShareSheet slug={shareSlug} entityType="post" title={post.title || 'InstaRishta post'} onClose={() => setShareSlug(null)} />
      )}

      {/* The one pair of arrows, for the one sequence.
          Mid-height, where a mouse expects them, and only where there is a
          mouse: `pointer: coarse` hides them, because a finger has the tap
          zones and the swipe and does not need a target sitting on top of
          the biodata it is reading. Same reasoning zuck.js uses. */}
      {!atStart && (
        <button onClick={goBack} aria-label="Previous"
          className="ir-nav absolute left-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full items-center justify-center text-2xl border-0"
          style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', backdropFilter: 'blur(8px)' }}>‹</button>
      )}
      {!atEnd && (
        <button onClick={goForward} aria-label="Next"
          className="ir-nav absolute right-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full items-center justify-center text-2xl border-0"
          style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', backdropFilter: 'blur(8px)' }}>›</button>
      )}

      {/* Hide native scrollbars on the carousel + scroll content (WebKit + Firefox + IE) */}
      <style>{`
        .ir-no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .ir-no-scrollbar::-webkit-scrollbar { width: 0; height: 0; display: none; }
        .ir-nav { display: flex; }
        @media (pointer: coarse) { .ir-nav { display: none; } }
      `}</style>
    </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ChannelFeedPage() {
  const { slug } = useParams<{ slug: string }>();

  const [channel,  setChannel]  = useState<IChannel | null>(null);
  const [posts,    setPosts]     = useState<IPost[]>([]);
  const [loading,  setLoading]   = useState(true);
  const [error,    setError]     = useState('');
  const [page,     setPage]      = useState(0);
  const [done,     setDone]      = useState(false);
  const [total,    setTotal]     = useState<number | null>(null);
  const [siblings, setSiblings]  = useState<{ id: string; name: string; slug: string }[]>([]);
  const [catFilter, setCatFilter] = useState('all');
  const [filters,  setFilters]   = useState<FeedFilterState>(EMPTY_FILTERS);
  // The feed owns this, not FeedFilters: the trigger lives in the bottom dock
  // on a phone and in the top bar on a desktop, and the panel has to open
  // from both.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // The bottom nav tucks itself away as you scroll down. The dock stands on
  // it, so it has to leave with it -- see the dock's transform below.
  const chromeHidden = useChromeAutoHide();
  const [newBadge, setNewBadge]  = useState(false);

  const [modalPost,  setModalPost]  = useState<IPost | null>(null);
  const [liked,      setLiked]      = useState<Set<string>>(new Set());

  // Audio is unlimited now (no auth gating). Pass a no-op attempter so the
  // AudioPlayer keeps its existing onPlayAttempt contract without changes.
  const handlePlayAttempt = useCallback(async (): Promise<boolean> => true, []);

  const sentinelRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const realtimeRef = useRef<any>(null);

  /**
   * Fetch one page.
   *
   * Two callers can want the same page at the same moment -- the scroll
   * sentinel and the "a filter needs the whole channel" effect -- and the
   * `loading` state flag is set asynchronously, so both sail past it and
   * append the same batch twice. That is what put 17 tiles on screen for 10
   * matching posts. `inFlight` is a ref, so the second caller sees the lock
   * immediately; the id check is the belt to that braces, and also covers a
   * realtime insert arriving for a post already on screen.
   */
  const inFlight = useRef<number | null>(null);

  const loadPosts = useCallback(async (ch: IChannel, pg: number) => {
    if (inFlight.current === pg) return;
    inFlight.current = pg;
    setLoading(true);
    try {
      const batch = await getPosts(ch.id, pg);
      if (batch.length < POST_PAGE_SIZE) setDone(true);
      setPosts(prev => {
        if (pg === 0) return batch;
        const seen = new Set(prev.map(p => p.id));
        return [...prev, ...batch.filter((p: IPost) => !seen.has(p.id))];
      });
      setPage(pg + 1);
    } catch { /* silent */ }
    finally {
      setLoading(false);
      inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const ch = await getChannelBySlug(slug);
        if (!ch) { setError('Channel not found.'); setLoading(false); return; }
        setChannel(ch);
        countPosts(ch.id).then(setTotal).catch(() => {});
        // Every channel, for the strip that lets you swipe from one to the next.
        getBrowsableChannels().then(list => setSiblings((list ?? []) as typeof siblings)).catch(() => {});
        await loadPosts(ch, 0);

        realtimeRef.current = subscribeChannel(ch.id, (post) => {
          setPosts(prev => prev.some((x: IPost) => x.id === post.id) ? prev : [post, ...prev]);
          setNewBadge(true);
          setTimeout(() => setNewBadge(false), 5000);
        });
      } catch (e: unknown) {
        setError((e as Error).message);
        setLoading(false);
      }
    })();

    return () => {
      if (realtimeRef.current) { unsubscribeChannel(realtimeRef.current); realtimeRef.current = null; }
    };
  }, [slug, loadPosts]);

  const filtering = catFilter !== 'all' || activeCount(filters) > 0;

  /**
   * A filter searches the channel, not the scroll position.
   *
   * The feed loads a page at a time and every filter ran over `posts` -- only
   * what had been fetched. Filtering to B.com showed 5 matches at 48 loaded
   * and 10 at 93, and every chip count moved as you scrolled. So the moment a
   * filter is on, pull the rest of the channel; then the matches, the counts
   * and the header all describe the same, whole thing.
   */
  useEffect(() => {
    if (!filtering || !channel || done || loading) return;
    void loadPosts(channel, page);
  }, [filtering, channel, done, loading, page, loadPosts]);

  const loadMore = useCallback(() => {
    if (!channel || loading || done) return;
    void loadPosts(channel, page);
  }, [channel, loading, done, page, loadPosts]);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !channel || done) return;
    const obs = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting && !loading && !done) loadPosts(channel, page); },
      { rootMargin: '400px' }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [channel, page, loading, done, loadPosts]);

  // Liked set
  useEffect(() => {
    const s = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('ir_liked_')) s.add(k.replace('ir_liked_', ''));
    }
    setLiked(s);
  }, []);

  const openPost = (p: IPost) => { setModalPost(p); incrementViews(p.id); };

  const doLike = (id: string) => {
    if (liked.has(id)) return;
    setLiked(prev => new Set([...prev, id]));
    localStorage.setItem('ir_liked_' + id, '1');
    incrementLikes(id);
  };

  // Category chips first -- they are the coarse cut and the one every post
  // can answer -- then the biodata facets on whatever is left.
  const visiblePosts = useMemo(() => {
    const byCat = catFilter === 'all' ? posts : posts.filter(p => catOf(p) === catFilter);
    return applyFeedFilters(byCat, filters);
  }, [posts, catFilter, filters]);

  const usedCats = useMemo(() => new Set(posts.map(catOf)), [posts]);

  /**
   * Qualifications in this channel, most common first.
   *
   * Education rather than location, decided from the data rather than from
   * taste: `state` is set on six of ninety-three posts (only the show
   * profiles), because the ad importer files an extracted place under
   * `country` or `city` and the post table has neither. Education is on most
   * of them and clusters usefully -- B.com, MBA, Graduate, B.Tech -- so it is
   * the facet that actually earns a row of chips today.
   */
  const educations = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of posts) {
      const v = p.education;
      if (typeof v !== 'string' || !v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, n]) => n > 1)              // a one-off is noise, not a facet
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([value, n]) => ({ value, n }));
  }, [posts]);

  /**
   * The three navigation controls, written once and placed twice.
   *
   * A phone puts them in a dock in the thumb arc; a desktop has no thumb arc
   * and no bottom nav to sit above, so there they belong in the bar at the
   * top with everything else you point at. Same chips either way.
   */
  const channelChips = (
    <>
      <span className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-extrabold"
        style={{ background: '#00A86B', color: '#0B0B0A' }}>
        {channel?.name ?? 'Loading…'}
      </span>
      {siblings
        .filter(c => c.slug !== channel?.slug)
        .map(c => (
          <a
            key={c.id}
            href={`/channels/${c.slug}`}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold border no-underline"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.78)',
              borderColor: 'rgba(255,255,255,0.14)',
            }}
          >
            {c.name} ›
          </a>
        ))}
    </>
  );

  const nFilters = activeCount(filters);
  const filterButton = (
    /**
     * Icon only, inverted, with the count as a badge.
     *
     * The word "Filters" cost 87px of a 360px row that the channel strip
     * needs, and the glyph already says it. Light on a dark dock -- the one
     * inverted thing down there -- so it reads as the action among a row of
     * chips rather than as another chip. The count moves to a red badge
     * because it is a state to clear, not a label: it should catch the eye
     * that is scanning past, which a grey pill in the button never did.
     */
    <button
      onClick={() => setFiltersOpen(true)}
      aria-label={nFilters > 0 ? `Filters, ${nFilters} active` : 'Filters'}
      className="relative shrink-0 grid place-items-center rounded-full border-0"
      style={{ width: 36, height: 36, background: '#F3F0EE', color: '#0B0B0A' }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" />
        <line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" />
        <line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" />
        <line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" />
        <line x1="16" x2="16" y1="18" y2="22" />
      </svg>
      {nFilters > 0 && (
        <span
          className="absolute grid place-items-center rounded-full text-[10px] font-extrabold tabular-nums"
          style={{
            top: -3, right: -3, minWidth: 17, height: 17, padding: '0 4px',
            background: '#E5484D', color: '#fff',
            // Against the dock, so the badge reads as attached to the button
            // rather than floating over whatever chip is behind it.
            border: '2px solid rgba(10,20,15,1)',
          }}
        >
          {nFilters}
        </span>
      )}
    </button>
  );

  if (error) return (
    <div className="text-center py-20 px-6">
      <span className="text-5xl block mb-4">⚠️</span>
      <p className="text-base font-medium mb-4" style={{ color: '#696969' }}>{error}</p>
      <a href="/channels" className="rounded-full px-5 py-2.5 text-sm font-bold" style={{ background: '#006241', color: '#fff' }}>← Channels</a>
    </div>
  );

  return (
    <div style={{ background: '#0B0B0A', minHeight: '100vh' }}>

      {/* ── Stories tray + viewer (zuck.js) ──
          The green hero that used to hold this is gone, and with it the
          back button, the channel avatar and the "48 / 93 posts" progress
          counter: a band of chrome above the fold that said how much had
          been fetched rather than showing anything to read. Navigation back
          out of a channel lives in the channel strip in the bottom dock and
          in the site's own bottom nav, both within thumb reach; the stories
          keep their place at the top of the feed, on the page's own ground. */}
      {channel && (
        <div className="px-4 pt-3">
          <ZuckStories channelId={channel.id} />
        </div>
      )}

      {/* ── Featured profiles spotlight ── */}
      <FeaturedCarousel placement="channels" label="Spotlight Profiles" />

      <div className="sticky top-0 z-40" style={{ background: '#0B0B0A' }}>

      {/* ── Desktop control bar ──
          On a phone these three live in the bottom dock. On a desktop there
          is no bottom nav for a dock to stand on and no thumb to reach it
          with, so they sit in the top bar: channels on the left, pages and
          the drawer trigger on the right. */}
      <div className="hidden md:flex items-center gap-3 px-4 py-2.5">
        <div className="flex gap-2 overflow-x-auto items-center flex-1 min-w-0"
          style={{ scrollbarWidth: 'none' }}>
          {channelChips}
        </div>
        {posts.length > 0 && filterButton}
      </div>

      {/* ── Category filter chips ── */}
      {posts.length > 0 && (
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto" style={{ background: '#0B0B0A', boxShadow: '0 1px 0 rgba(255,255,255,0.08)', scrollbarWidth: 'none' }}>
          {POST_CATS.filter(c => c.id === 'all' || usedCats.has(c.id)).map(c => (
            <button
              key={c.id}
              onClick={() => setCatFilter(c.id)}
              className="shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-all"
              style={{
                background:  catFilter === c.id ? '#00A86B' : 'rgba(255,255,255,0.08)',
                color:       catFilter === c.id ? '#0B0B0A' : 'rgba(255,255,255,0.7)',
                borderColor: catFilter === c.id ? '#00A86B' : 'rgba(255,255,255,0.12)',
              }}
            >
              <span>{c.icon}</span>
              {c.label}
              {/* A count over the loaded window is a wrong count: "B.com 2"
                  became "B.com 10" as you scrolled. Shown only once the whole
                  channel is in hand -- the chip still works before then, it
                  just does not claim a number it cannot know. */}
              {c.id !== 'all' && done && (
                <span className="opacity-60">{posts.filter(p => catOf(p) === c.id).length}</span>
              )}
            </button>
          ))}
        </div>
      )}
      </div>

      {/* ── Education chips ──
          The second facet beside profession. See `educations` for why this is
          education and not location. */}
      {educations.length > 0 && (
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto" style={{ background: '#0B0B0A', scrollbarWidth: 'none' }}>
          <button
            onClick={() => setFilters(f => ({ ...f, eduRaw: '' }))}
            className="shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-all"
            style={chipStyle(!filters.eduRaw)}
          >
            🎓 Any study
          </button>
          {educations.map(e => {
            const on = filters.eduRaw === e.value;
            return (
              <button
                key={e.value}
                onClick={() => setFilters(f => ({ ...f, eduRaw: on ? '' : e.value }))}
                className="shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-all"
                style={chipStyle(on)}
              >
                {e.value}
                {done && <span className="opacity-60">{e.n}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/*
        ── Bottom dock: everything you navigate with, inside the thumb arc ──

        Phone only. Channels, pages and the filter trigger are all navigation,
        and navigation at the top of a phone screen needs a second hand, so
        they sit together directly on top of the site's bottom nav: the
        channel strip (swipe sideways for the next group), the pager under
        it, and the filter button at the end of that row.

        One solid surface, flush against the nav below it. It used to be two
        floating rows over a fade with a FAB laid over the corner, which left
        the feed showing through the gaps and through the hole the FAB made
        -- tiles sliding past between the controls.
      */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-[45] flex flex-col gap-2 pt-2.5"
        style={{
          /* Anchored to the floor, not floated 56px above it, with the nav's
             own height as padding. The surface therefore runs all the way
             down behind the nav instead of leaving a band of feed under
             itself -- which is what showed through the moment the nav tucked
             away, and again during the 0.25s it takes to do that.

             z-45 keeps it above the feed but under the nav (z-50), which
             paints on top of the padding rather than being buried by it. */
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 56px)',
          background: 'rgba(10,20,15,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          /* And it leaves with the nav, on the same curve, so the two never
             come apart mid-scroll. */
          transform: chromeHidden ? 'translateY(110%)' : 'translateY(0)',
          transition: 'transform 0.25s ease',
        } as React.CSSProperties}>

        <div className="px-4 flex items-center gap-2">
          <div className="flex gap-2 overflow-x-auto items-center flex-1 min-w-0"
            style={{ scrollbarWidth: 'none' }}>
            {channelChips}
          </div>
          {posts.length > 0 && filterButton}
        </div>
      </div>

      {/* ── Biodata filters ── */}
      {posts.length > 0 && (
        <FeedFilters
          posts={posts} value={filters} onChange={setFilters} matched={visiblePosts}
          open={filtersOpen} onOpenChange={setFiltersOpen}
        />
      )}

      {/* ── New post badge ── */}
      {newBadge && (
        <button
          onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setNewBadge(false); }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl text-sm font-semibold"
          style={{ background: '#141413', color: '#F3F0EE', boxShadow: '0 4px 16px rgba(20,20,19,0.28)' }}
        >↑ New post</button>
      )}

      {/* ── Post grid ── */}
      <div className="px-3 pt-3">
        {!loading && !visiblePosts.length && (
          <div className="text-center py-20 px-6">
            <span className="text-5xl block mb-4">💍</span>
            <p className="text-base font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {catFilter === 'all' ? 'No posts yet.' : 'No posts in this category.'}
            </p>
            {catFilter !== 'all' && (
              <button onClick={() => setCatFilter('all')} className="mt-3 text-sm font-semibold" style={{ color: '#00E08C' }}>Show all</button>
            )}
          </div>
        )}

        <style>{`
          @media (min-width: 640px)  { .ir-post-grid { grid-template-columns: repeat(3, 1fr) !important; } }
          @media (min-width: 900px)  { .ir-post-grid { grid-template-columns: repeat(4, 1fr) !important; } }
          @media (min-width: 1200px) { .ir-post-grid { grid-template-columns: repeat(5, 1fr) !important; } }
        `}</style>
        <ClickSpark sparkColor="#00A86B" sparkRadius={22} sparkCount={8} duration={450}>
        <div className="ir-post-grid grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {visiblePosts.map((post, i) => {
            const cover = post.thumb ?? post.image ?? null;
            const hasImage = !!cover;
            const hasAudio = !!post.audio_url;
            /**
             * A show frame is a known shape: the capture writes 1080x1920 and
             * the publisher writes the biodata facets alongside it, so a post
             * carrying facets is one of ours and its tile can be cut to 9:16
             * and filled edge to edge -- `cover` on a matching aspect crops
             * nothing. An import is an unknown shape and keeps the letterbox,
             * which is what stops it losing a third of its content.
             */
            const isFrame = post.gender != null;
            /* Frames beyond the cover. `images` holds the whole carousel with
               the cover as images[0], so the count is one less than its
               length -- "+3" on a three-frame biodata promised a fourth. */
            const extra = Math.max(
              0,
              [...new Set([post.image, ...(Array.isArray(post.images) ? post.images : [])].filter(Boolean))].length - 1,
            );
            /**
             * The page break, drawn in the feed rather than kept in a tray.
             *
             * A row of numbers above the nav told you a page existed but not
             * where you were in one; a rule you scroll past says both, at the
             * moment it matters, and costs no chrome. It spans the whole grid
             * row -- `1 / -1` -- so the tiles keep their columns.
             *
             * Not while filtering: matches are drawn from the whole channel,
             * so they have no pages to be divided into. Not on a channel that
             * fits in one page either -- "Page 1 · 2 profiles" over a
             * two-post channel is a rule marking nothing.
             */
            const startsPage = !filtering
              && (total ?? 0) > POST_PAGE_SIZE   // one short page has no pages to mark
              && i % POST_PAGE_SIZE === 0;
            const pageNo = Math.floor(i / POST_PAGE_SIZE) + 1;
            const onThisPage = Math.min(POST_PAGE_SIZE, visiblePosts.length - i);

            return (
              <Fragment key={post.id}>
              {startsPage && (
                <div style={{ gridColumn: '1 / -1' }}
                  className={`flex items-baseline gap-2.5 ${i === 0 ? 'pb-1' : 'pt-5 pb-1'}`}>
                  <span className="text-sm font-bold shrink-0" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    Page {pageNo}
                  </span>
                  <span className="text-xs shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {onThisPage} profile{onThisPage === 1 ? '' : 's'}
                  </span>
                  <span className="flex-1" style={{ height: 1, background: 'rgba(255,255,255,0.14)' }} />
                </div>
              )}
              <button
                id={`post-${i}`}
                onClick={() => openPost(post)}
                className="relative overflow-hidden border-0 p-0 cursor-pointer block text-left rounded-2xl"
                style={{ background: '#171715' }}
              >
                {/* 3:4, not the frame's own 9:16.
                    A short ad leaves the bottom third of a 1080x1920 frame
                    empty, and at 9:16 the tile faithfully reproduced that
                    emptiness -- rows of cards that were half nothing. The
                    thumbnail shows the top of the frame instead, which is
                    where the lockup, the facts and the opening lines are. The
                    published image is untouched: it stays a true 9:16 for the
                    stories viewer and for sharing. */}
                <div className="relative w-full overflow-hidden" style={{ aspectRatio: '3/4', background: hasImage ? '#0d0d0c' : hasAudio ? '#0d1e18' : '#1E3932' }}>
                  {cover ? (
                    /* Biodata images are tall documents (typically ~1:1.9), not
                       photos. object-cover on a 3/4 tile cropped 30-45% off
                       them — names and contact rows were being cut away. The
                       whole image has to be visible, so it is letterboxed with
                       object-contain, over a blurred copy of itself so the tile
                       still fills its grid cell instead of showing bars. */
                    <>
                      {/* The blurred fill only exists to hide letterbox bars.
                          A frame has none -- its tile is cut to its own
                          aspect -- so painting one behind it is a gradient
                          smear down both edges of every card. */}
                      {!isFrame && (
                        <img
                          src={cover}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-40"
                          loading="lazy"
                        />
                      )}
                      <img
                        src={cover}
                        alt={post.title ?? ''}
                        className={`relative w-full h-full transition-transform duration-300 hover:scale-105 ${
                          isFrame ? 'object-cover' : 'object-contain'
                        }`}
                        // Anchored to the top so the crop takes the empty
                        // bottom, never the name.
                        style={isFrame ? { objectPosition: 'top' } : undefined}
                        loading="lazy"
                      />
                    </>
                  ) : (
                    /* Text / audio tile */
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2">
                      {hasAudio ? (
                        <>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,168,107,0.25)' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="#00A86B"><path d="M8 6.5v11l9-5.5z"/></svg>
                          </div>
                          <p className="text-[9px] font-semibold text-center leading-snug line-clamp-2 px-1" style={{ color: 'rgba(255,255,255,0.75)' }}>
                            {post.title || 'Voice Post'}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Post</p>
                          <p className="text-[10px] font-semibold text-center leading-snug line-clamp-3 px-1" style={{ color: 'rgba(255,255,255,0.85)' }}>
                            {post.title || post.caption || ''}
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Time-ago badge */}
                  <span className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full"
                    style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                    {timeAgoShort(post.created_at)}
                  </span>
                  {/* Extra-photos badge */}
                  {extra > 0 && (
                    <span className="absolute top-9 right-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                      style={{ background: '#FFB020', color: '#141413' }}>+{extra}</span>
                  )}
                  {hasAudio && hasImage && (
                    <span className="absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.6)' }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="#00A86B"><path d="M8 6.5v11l9-5.5z"/></svg>
                    </span>
                  )}
                  {(post.likes ?? 0) > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(0,0,0,0.3)' }}>
                      <span className="text-white font-bold text-sm">❤ {post.likes}</span>
                    </div>
                  )}
                </div>

                {/* Caption block — text and audio tiles only.
                    On an image post it repeated what the picture already says:
                    a biodata frame carries the name and the IR id in its own
                    lockup, and the age badge on the tile already gives the
                    time. Two lines of chrome under every card, saying nothing
                    new, and pushing the images apart. */}
                {!hasImage && (
                  <div className="px-2.5 py-2">
                    {(post.title || post.caption) && (
                      <p className="text-xs font-bold text-white leading-snug line-clamp-2">
                        {post.title || post.caption}
                      </p>
                    )}
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {channel?.name} · {timeAgoShort(post.created_at)}
                    </p>
                  </div>
                )}
              </button>
              </Fragment>
            );
          })}
        </div>
        </ClickSpark>

        {loading && (
          <div className="ir-post-grid grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl overflow-hidden" style={{ background: '#171715' }}>
                <div style={{ aspectRatio: '3/4', background: '#1f1f1c' }} />
                <div className="h-8" />
              </div>
            ))}
          </div>
        )}
        <div ref={sentinelRef} style={{ height: 1 }} />
      </div>

      {/* Runway under the last row, so the bottom dock never covers a tile.
          The "All 93 posts loaded" line that used to end the feed was the
          same loader-progress count as the header's, and went with it. */}
      <div aria-hidden style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 180px)' }} />

      {/* ── Post modal ── */}
      {modalPost && (
        <PostModal
          post={modalPost}
          allPosts={visiblePosts}
          liked={liked}
          onClose={() => setModalPost(null)}
          onLike={doLike}
          onNavigate={p => { setModalPost(p); incrementViews(p.id); }}
          onPlayAttempt={handlePlayAttempt}
          total={total ?? undefined}
          onNeedMore={loadMore}
        />
      )}

    </div>
  );
}
