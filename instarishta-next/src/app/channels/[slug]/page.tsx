'use client';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import {
  getChannelBySlug, getPosts, getStories,
  incrementViews, incrementLikes,
  subscribeChannel, unsubscribeChannel,
  POST_PAGE_SIZE,
  type IChannel, type IPost, type IStory,
} from '@/lib/supabase';
import GradientText from '@/components/ui/GradientText';
import TextType from '@/components/ui/TextType';
import ClickSpark from '@/components/ui/ClickSpark';
import { useUsageLimit } from '@/hooks/useUsageLimit';
import AuthModal from '@/components/AuthModal';

const MagicRings = dynamic(() => import('@/components/ui/MagicRings'), { ssr: false });

const POST_CATS = [
  { id: 'all',      label: 'All',       icon: '✦' },
  { id: 'medical',  label: 'Medical',   icon: '🩺', kw: ['doctor','mbbs','surgeon','nurse','pharmacist','dentist','medical','hospital','health'] },
  { id: 'tech',     label: 'Tech',      icon: '💻', kw: ['engineer','software','developer','technology','computer','programming','data','cyber','electronics','mechanical','civil','electrical'] },
  { id: 'business', label: 'Business',  icon: '💼', kw: ['business','entrepreneur','finance','banking','accountant','chartered','mba','manager','marketing','sales','commerce'] },
  { id: 'edu',      label: 'Education', icon: '🎓', kw: ['teacher','professor','lecturer','education','school','university','tutor','academic','phd','research'] },
  { id: 'legal',    label: 'Legal',     icon: '⚖️', kw: ['lawyer','advocate','legal','law','attorney','judge','court','llb','llm'] },
  { id: 'govt',     label: 'Govt',      icon: '🏛️', kw: ['ias','ips','ifs','government','civil service','military','army','navy','air force','police','upsc'] },
];

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

const STORY_DURATION = 5000;

// ── Story viewer ──────────────────────────────────────────────────────────────

function StoryViewer({
  stories,
  initialIdx,
  onClose,
}: { stories: IStory[]; initialIdx: number; onClose: () => void }) {
  const [idx, setIdx]         = useState(initialIdx);
  const [paused, setPaused]   = useState(false);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef  = useRef(0);    // when current timer segment started
  const elapsedRef = useRef(0);  // ms elapsed before current segment

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  const advance = useCallback((dir: number) => {
    const next = idx + dir;
    if (next < 0 || next >= stories.length) { onClose(); return; }
    elapsedRef.current = 0;
    setIdx(next);
  }, [idx, stories.length, onClose]);

  const startFrom = useCallback((elapsed: number) => {
    clearTimer();
    startRef.current = Date.now();
    elapsedRef.current = elapsed;
    const remaining = STORY_DURATION - elapsed;
    timerRef.current = setTimeout(() => advance(1), remaining);
  }, [advance]);

  // Start/restart timer whenever idx changes or paused toggles
  useEffect(() => {
    if (paused) {
      // Record how much time elapsed before pause
      elapsedRef.current = elapsedRef.current + (Date.now() - startRef.current);
      clearTimer();
    } else {
      startFrom(elapsedRef.current);
    }
    return clearTimer;
  }, [idx, paused, startFrom]);

  // Reset elapsed when idx changes
  useEffect(() => { elapsedRef.current = 0; }, [idx]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setPaused(true);
  };
  const handlePointerUp = () => setPaused(false);

  const handleTap = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    advance(e.clientX < window.innerWidth * 0.4 ? -1 : 1);
  };

  const story = stories[idx];

  return (
    <div
      className="fixed inset-0 z-300 bg-black flex flex-col select-none"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClick={handleTap}
    >
      {/* Progress bars */}
      <div className="absolute top-3 left-3 right-3 flex gap-1 z-20">
        {stories.map((_, i) => (
          <div key={i} className="flex-1 h-0.75 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.3)' }}>
            {i < idx ? (
              <div className="h-full w-full bg-white" />
            ) : i === idx ? (
              <div
                key={`${idx}-${paused}`}
                className="h-full bg-white"
                style={{
                  animation: `storyTick ${STORY_DURATION - elapsedRef.current}ms linear forwards`,
                  animationPlayState: paused ? 'paused' : 'running',
                  width: '0%',
                }}
              />
            ) : (
              <div className="h-full w-0 bg-white" />
            )}
          </div>
        ))}
      </div>

      {/* Close */}
      <button
        onClick={e => { e.stopPropagation(); onClose(); }}
        className="absolute top-10 right-3.5 z-20 w-9 h-9 rounded-full flex items-center justify-center text-lg border-0"
        style={{ background: 'rgba(0,0,0,0.45)', color: '#fff' }}
      >✕</button>

      {/* Counter */}
      <div className="absolute top-10 left-3.5 z-20 text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.65)' }}>
        {idx + 1} / {stories.length}
      </div>

      {/* Pause indicator */}
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <span className="text-2xl text-white">⏸</span>
          </div>
        </div>
      )}

      {/* Image */}
      <img
        src={story.image}
        alt="Story"
        className="absolute inset-0 w-full h-full object-contain"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
        draggable={false}
      />

      {/* Tap zone hints */}
      <div className="absolute inset-y-0 left-0 w-2/5 z-10 pointer-events-none flex items-center pl-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>‹</div>
      </div>

      <style>{`
        @keyframes storyTick { from { width: 0%; } to { width: 100%; } }
      `}</style>
    </div>
  );
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
    a.currentTime = Math.max(0, Math.min(duration || 0, a.currentTime + secs));
    setCurrent(a.currentTime);
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
  post, allPosts, liked, onClose, onLike, onNavigate, onPlayAttempt,
}: {
  post: IPost; allPosts: IPost[];
  liked: Set<string>; onClose: () => void;
  onLike: (id: string) => void; onNavigate: (p: IPost) => void;
  onPlayAttempt?: () => Promise<boolean>;
}) {
  const imgs    = [post.image, ...(Array.isArray(post.images) ? post.images.filter(Boolean) : [])].filter(Boolean);
  const isAudio = !!post.audio_url;
  const isText  = !post.image && !isAudio;
  const hasImg  = imgs.length > 0;

  const [carIdx,  setCarIdx]  = useState(0);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const swipeRef    = useRef({ x: 0, y: 0, inCar: false });
  const postIdx     = allPosts.indexOf(post);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setCarIdx(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Reset carousel position when post changes
  useEffect(() => { setCarIdx(0); scrollRef.current?.scrollTo({ left: 0 }); }, [post.id]);

  const onSwipeStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipeRef.current = {
      x: t.clientX, y: t.clientY,
      inCar: imgs.length > 1 && !!carouselRef.current?.contains(e.target as Node),
    };
  };

  const onSwipeEnd = (e: React.TouchEvent) => {
    if (swipeRef.current.inCar) return;
    const dx = e.changedTouches[0].clientX - swipeRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeRef.current.y;
    if (Math.abs(dx) < 65 || Math.abs(dy) > Math.abs(dx) * 0.9) return;
    if (dx < 0 && postIdx < allPosts.length - 1) onNavigate(allPosts[postIdx + 1]);
    if (dx > 0 && postIdx > 0) onNavigate(allPosts[postIdx - 1]);
  };

  const coverForBg = imgs[carIdx] || imgs[0];

  return (
    <div className="fixed inset-0 z-200 flex flex-col"
      style={{ background: '#0d1117' }}
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

      {/* Top bar */}
      <div className="relative z-10 flex items-center gap-3 px-4 pt-11 pb-3 shrink-0"
        style={{ background: 'linear-gradient(to bottom,rgba(0,0,0,0.65) 0%,transparent 100%)' }}>
        <button onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center text-xl border-0"
          style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}>‹</button>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}>
          {postIdx + 1} / {allPosts.length}
        </span>
        {imgs.length > 1 && (
          <span className="ml-auto text-xs px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>
            {carIdx + 1} / {imgs.length}
          </span>
        )}
      </div>

      {/* ── Image carousel (60 % of viewport height) ── */}
      {hasImg && (
        <div ref={carouselRef} className="relative z-10 shrink-0 overflow-hidden" style={{ height: '60vh' }}>
          <div ref={scrollRef}
            className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
            {imgs.map((url, i) => (
              <div key={i} className="min-w-full h-full snap-center flex items-center justify-center px-5 py-3">
                <img src={url} alt={`Photo ${i + 1}`}
                  className="max-w-full max-h-full object-contain select-none"
                  loading={i === 0 ? 'eager' : 'lazy'}
                  style={{ borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', pointerEvents: 'none' }}
                  draggable={false} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Scrollable content ── */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 pt-4 pb-2" style={{ scrollbarWidth: 'none' }}>
        {/* Carousel dots — below image, above text */}
        {imgs.length > 1 && (
          <div className="flex justify-center gap-1.5 mb-4">
            {imgs.map((_, i) => (
              <span key={i} className="rounded-full transition-all"
                style={{
                  width: i === carIdx ? 18 : 6, height: 6,
                  background: i === carIdx ? '#00A86B' : 'rgba(255,255,255,0.3)',
                }} />
            ))}
          </div>
        )}

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

        {/* Image post text */}
        {hasImg && !isAudio && (
          <div className="mt-1">
            {post.title   && <p className="text-sm font-bold text-white mb-1.5">{post.title}</p>}
            {post.caption && <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>{post.caption}</p>}
          </div>
        )}
      </div>

      {/* ── Bottom bar ── */}
      <div className="relative z-10 px-5 py-4 shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.4)' }}>
        <div className="flex items-center gap-4">
          <button onClick={() => onLike(post.id)}
            className="flex items-center gap-1.5 border-0 bg-transparent cursor-pointer">
            <span className="text-xl">{liked.has(post.id) ? '❤️' : '🤍'}</span>
            <span className="text-sm font-semibold text-white">{(post.likes ?? 0) + (liked.has(post.id) ? 1 : 0)}</span>
          </button>
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>👁 {(post.views ?? 0) + 1}</span>
          <span className="text-xs ml-auto" style={{ color: 'rgba(255,255,255,0.35)' }}>{fmt(post.created_at)}</span>
        </div>
      </div>

      {/* Prev / next post arrows */}
      {postIdx > 0 && (
        <button onClick={() => onNavigate(allPosts[postIdx - 1])}
          className="absolute left-2 z-20 w-9 h-9 rounded-full flex items-center justify-center text-xl border-0"
          style={{ top: 'calc(11vh + 50px)', background: 'rgba(255,255,255,0.13)', color: '#fff' }}>‹</button>
      )}
      {postIdx < allPosts.length - 1 && (
        <button onClick={() => onNavigate(allPosts[postIdx + 1])}
          className="absolute right-2 z-20 w-9 h-9 rounded-full flex items-center justify-center text-xl border-0"
          style={{ top: 'calc(11vh + 50px)', background: 'rgba(255,255,255,0.13)', color: '#fff' }}>›</button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ChannelFeedPage() {
  const { slug } = useParams<{ slug: string }>();

  const [channel,  setChannel]  = useState<IChannel | null>(null);
  const [posts,    setPosts]     = useState<IPost[]>([]);
  const [stories,  setStories]   = useState<IStory[]>([]);
  const [loading,  setLoading]   = useState(true);
  const [error,    setError]     = useState('');
  const [page,     setPage]      = useState(0);
  const [done,     setDone]      = useState(false);
  const [catFilter, setCatFilter] = useState('all');
  const [newBadge, setNewBadge]  = useState(false);

  const [storyOpen,  setStoryOpen]  = useState(false);
  const [storyStart, setStoryStart] = useState(0);

  const [modalPost,  setModalPost]  = useState<IPost | null>(null);
  const [liked,      setLiked]      = useState<Set<string>>(new Set());
  const [audioGate,  setAudioGate]  = useState(false);

  const { consume: consumeAudio } = useUsageLimit('audio');

  const handlePlayAttempt = useCallback(async (): Promise<boolean> => {
    const ok = await consumeAudio();
    if (!ok) { setAudioGate(true); return false; }
    return true;
  }, [consumeAudio]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const realtimeRef = useRef<any>(null);

  const seenKey  = 'ir_seen_stories';
  const getSeen  = () => { try { return JSON.parse(localStorage.getItem(seenKey) ?? '[]') as string[]; } catch { return []; } };
  const markSeen = (id: string) => { const s = getSeen(); if (!s.includes(id)) localStorage.setItem(seenKey, JSON.stringify([...s, id])); };

  const loadPosts = useCallback(async (ch: IChannel, pg: number) => {
    setLoading(true);
    try {
      const batch = await getPosts(ch.id, pg);
      if (batch.length < POST_PAGE_SIZE) setDone(true);
      setPosts(prev => pg === 0 ? batch : [...prev, ...batch]);
      setPage(pg + 1);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const ch = await getChannelBySlug(slug);
        if (!ch) { setError('Channel not found.'); setLoading(false); return; }
        setChannel(ch);
        const [, storyData] = await Promise.all([loadPosts(ch, 0), getStories(ch.id)]);
        // latest stories first
        setStories([...storyData].sort((a, b) => b.created_at.localeCompare(a.created_at)));

        realtimeRef.current = subscribeChannel(ch.id, (post) => {
          setPosts(prev => [post, ...prev]);
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

  const visiblePosts = useMemo(() => {
    if (catFilter === 'all') return posts;
    return posts.filter(p => catOf(p) === catFilter);
  }, [posts, catFilter]);

  const usedCats = useMemo(() => new Set(posts.map(catOf)), [posts]);

  if (error) return (
    <div className="text-center py-20 px-6">
      <span className="text-5xl block mb-4">⚠️</span>
      <p className="text-base font-medium mb-4" style={{ color: '#696969' }}>{error}</p>
      <a href="/channels" className="rounded-full px-5 py-2.5 text-sm font-bold" style={{ background: '#006241', color: '#fff' }}>← Channels</a>
    </div>
  );

  return (
    <div style={{ background: '#F8F7F6', minHeight: '100vh' }}>

      {/* ── Channel hero ── */}
      <div style={{ background: '#1E3932', color: '#fff' }} className="relative px-4 pb-6 pt-5">
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign('/channels')}
            className="w-9 h-9 rounded-full flex items-center justify-center text-xl border-0 shrink-0"
            style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
          >‹</button>
          {channel?.cover_image && (
            <div className="w-10 h-10 rounded-full overflow-hidden shrink-0" style={{ border: '2px solid rgba(255,255,255,0.3)' }}>
              <img src={channel.cover_image} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-extrabold truncate">
              <GradientText colors={['#00C87A', '#ffffff', '#00A86B', '#ffffff']} animationSpeed={6} className="font-extrabold">
                {channel?.name ?? 'Loading…'}
              </GradientText>
            </h1>
            {channel?.description && (
              <p className="text-xs truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>{channel.description}</p>
            )}
          </div>
          <span className="text-xs font-semibold shrink-0" style={{ color: 'rgba(255,255,255,0.55)' }}>{posts.length} posts</span>
        </div>

        {/* Stories strip */}
        {stories.length > 0 && (
          <div className="flex gap-3.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {stories.map((s, i) => {
              const seen = getSeen().includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => { markSeen(s.id); setStoryStart(i); setStoryOpen(true); }}
                  className="shrink-0 flex flex-col items-center gap-1.5 border-0 bg-transparent p-0 cursor-pointer"
                >
                  <div className="w-15 h-15 rounded-full p-[2.5px]"
                    style={{ background: seen ? 'rgba(255,255,255,0.25)' : 'linear-gradient(135deg,#00754A,#004f33)' }}>
                    <div className="w-full h-full rounded-full overflow-hidden" style={{ border: '2px solid #1E3932' }}>
                      <img src={s.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  </div>
                  <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.65)', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Story {i + 1}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Category filter chips ── */}
      {posts.length > 0 && (
        <div className="sticky top-0 z-30 px-4 py-3 flex gap-2 overflow-x-auto" style={{ background: '#fff', boxShadow: '0 1px 0 #F0ECE8', scrollbarWidth: 'none' }}>
          {POST_CATS.filter(c => c.id === 'all' || usedCats.has(c.id)).map(c => (
            <button
              key={c.id}
              onClick={() => setCatFilter(c.id)}
              className="shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-all"
              style={{
                background:  catFilter === c.id ? '#141413' : '#fff',
                color:       catFilter === c.id ? '#fff'    : '#696969',
                borderColor: catFilter === c.id ? '#141413' : '#E8E4E0',
              }}
            >
              <span>{c.icon}</span>
              {c.label}
              {c.id !== 'all' && <span className="opacity-60">{posts.filter(p => catOf(p) === c.id).length}</span>}
            </button>
          ))}
        </div>
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
      <div className="p-1">
        {!loading && !visiblePosts.length && (
          <div className="text-center py-20 px-6">
            <span className="text-5xl block mb-4">💍</span>
            <p className="text-base font-medium" style={{ color: '#696969' }}>
              {catFilter === 'all' ? 'No posts yet.' : 'No posts in this category.'}
            </p>
            {catFilter !== 'all' && (
              <button onClick={() => setCatFilter('all')} className="mt-3 text-sm font-semibold" style={{ color: '#006241' }}>Show all</button>
            )}
          </div>
        )}

        <ClickSpark sparkColor="#00A86B" sparkRadius={22} sparkCount={8} duration={450}>
        <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {visiblePosts.map(post => {
            const hasImage = !!post.image;
            const hasAudio = !!post.audio_url;
            return (
              <button
                key={post.id}
                onClick={() => openPost(post)}
                className="relative overflow-hidden border-0 p-0 cursor-pointer block"
                style={{ aspectRatio: '1', background: hasImage ? '#F3F0EE' : hasAudio ? '#0d1e18' : '#1E3932' }}
              >
                {hasImage ? (
                  <img
                    src={post.thumb ?? post.image}
                    alt={post.title ?? ''}
                    className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                    loading="lazy"
                  />
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
                {/* Badges */}
                {Array.isArray(post.images) && post.images.length > 0 && (
                  <span className="absolute top-1 right-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                    style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}>⬛{1 + post.images.length}</span>
                )}
                {hasAudio && hasImage && (
                  <span className="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.55)' }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="#00A86B"><path d="M8 6.5v11l9-5.5z"/></svg>
                  </span>
                )}
                {(post.likes ?? 0) > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                    style={{ background: 'rgba(0,0,0,0.3)' }}>
                    <span className="text-white font-bold text-sm">❤ {post.likes}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
        </ClickSpark>

        {loading && (
          <div className="grid gap-0.5 mt-0.5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="animate-pulse" style={{ aspectRatio: '1', background: '#F3F0EE' }} />
            ))}
          </div>
        )}
        <div ref={sentinelRef} style={{ height: 1 }} />
      </div>

      {/* Load more / done */}
      {done && posts.length > 0 && (
        <p className="text-center text-xs py-6 pb-20" style={{ color: '#A0A0A0' }}>
          All {posts.length} posts loaded
        </p>
      )}

      {/* ── Story viewer ── */}
      {storyOpen && stories.length > 0 && (
        <StoryViewer
          stories={stories}
          initialIdx={storyStart}
          onClose={() => setStoryOpen(false)}
        />
      )}

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
        />
      )}

      {audioGate && (
        <AuthModal
          feature="audio"
          onClose={() => setAudioGate(false)}
          onSuccess={() => setAudioGate(false)}
        />
      )}
    </div>
  );
}
