'use client';
import { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect, useTransition, memo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, usePathname } from 'next/navigation';
import GradientText from '@/components/ui/GradientText';
import CountUp from '@/components/ui/CountUp';
import FeaturedCarousel from '@/components/FeaturedCarousel';
import { useContactCredits } from '@/lib/hooks/useContactCredits';
import { useInterests } from '@/lib/hooks/useInterests';
import { afterNextPaint } from '@/lib/scheduling';
import {
  type Profile,
  type DeckProfile,
  type FilterParams,
  textDir,
  URDU_FONT,
  isUrgent,
  EDUCATION_OPTIONS,
  MARITAL_OPTIONS,
  STATE_OPTIONS,
  COMMUNITY_OPTIONS,
  SORT_OPTIONS,
  activeFilterCount as countFilters,
} from './_shared';

// Lazy chunks — only load when the user opens them.
const MagicRings    = dynamic(() => import('@/components/ui/MagicRings'), { ssr: false });
const ContactModal  = dynamic(() => import('./_modals/ContactModal'),     { ssr: false });
const BiodataModal  = dynamic(() => import('./_modals/BiodataModal'),     { ssr: false });
const PaymentModal  = dynamic(() => import('./_modals/PaymentModal'),     { ssr: false });
const InterestModal = dynamic(() => import('./_modals/InterestModal'),    { ssr: false });
const AuthModal     = dynamic(() => import('@/components/AuthModal'),      { ssr: false });
const PhoneGateModal = dynamic(() => import('@/components/PhoneGateModal'), { ssr: false });
const FilterDrawer  = dynamic(() => import('./_components/FilterDrawer'), { ssr: false });

export type { Profile } from './_shared';

// ── AudioBtn ──────────────────────────────────────────────────────────────────

function AudioBtn({ url }: { url?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(0);

  const tick = useCallback(() => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    setProgress(a.currentTime / a.duration);
    if (!a.paused) rafRef.current = requestAnimationFrame(tick);
  }, []);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) {
      const a = new Audio(url);
      audioRef.current = a;
      a.onloadstart = () => setState('loading');
      a.oncanplay   = () => { setState('playing'); a.play().catch(() => {}); rafRef.current = requestAnimationFrame(tick); };
      a.onended     = () => { setState('idle'); setProgress(0); };
      a.onerror     = () => setState('idle');
      setState('loading');
    } else if (state === 'playing') {
      audioRef.current.pause();
      cancelAnimationFrame(rafRef.current);
      setState('paused');
    } else {
      audioRef.current.play().catch(() => {});
      rafRef.current = requestAnimationFrame(tick);
      setState('playing');
    }
  }, [state, url, tick]);

  useEffect(() => () => {
    audioRef.current?.pause();
    cancelAnimationFrame(rafRef.current);
  }, []);

  if (!url) {
    return (
      <button disabled
        className="w-10 h-10 rounded-full flex items-center justify-center border shrink-0"
        style={{ borderColor: '#E8E4E0', color: '#D1CDC7', cursor: 'not-allowed' }}
        aria-label="No voice preview">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 6.5v11l9-5.5z"/></svg>
      </button>
    );
  }

  const r = 15, circ = 2 * Math.PI * r;
  const dash = circ * (1 - progress);
  const active = state !== 'idle';

  return (
    <div className="relative shrink-0" style={{ width: 40, height: 40 }}>
      {state === 'playing' && (
        <div className="absolute pointer-events-none" style={{ inset: -14, borderRadius: '50%', overflow: 'hidden' }}>
          <MagicRings color="#006241" colorTwo="#00A86B" ringCount={4} speed={1.2} opacity={0.7} baseRadius={0.28} radiusStep={0.13} lineThickness={1.8} noiseAmount={0.05} />
        </div>
      )}
      <button
        onClick={toggle}
        className="w-10 h-10 rounded-full flex items-center justify-center border relative"
        style={{ borderColor: active ? '#006241' : '#D1CDC7', color: active ? '#006241' : '#696969' }}
        aria-label="Play voice intro"
      >
        {active && (
          <svg className="absolute inset-0 w-full h-full" style={{ transform: 'rotate(-90deg)' }} viewBox="0 0 40 40">
            <circle cx="20" cy="20" r={r} fill="none" stroke="#D7EDE5" strokeWidth="2.5" />
            <circle cx="20" cy="20" r={r} fill="none" stroke="#006241" strokeWidth="2.5"
              strokeDasharray={circ} strokeDashoffset={dash} strokeLinecap="round" />
          </svg>
        )}
        <span className="relative z-10 flex items-center justify-center">
          {state === 'loading' ? (
            <span className="block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
          ) : state === 'playing' ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 6h3v12H8zm5 0h3v12h-3z"/></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 6.5v11l9-5.5z"/></svg>
          )}
        </span>
      </button>
    </div>
  );
}

// ── ProfileCard ───────────────────────────────────────────────────────────────

const ProfileCard = memo(function ProfileCard({
  profile, onContact, onBiodata, canContact, remaining, resetLabel, onLimitHit,
  onInterest, interestStatus,
}: {
  profile: DeckProfile;
  onContact: (p: DeckProfile) => void;
  onBiodata: (p: DeckProfile) => void;
  canContact: boolean;
  remaining: number;
  resetLabel: string;
  onLimitHit?: () => void;
  onInterest: (p: DeckProfile) => void;
  interestStatus: string | null;
}) {
  const interestSent = interestStatus !== null;
  const interestAccepted = interestStatus === 'accepted' || interestStatus === 'connected';
  const cardRef         = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [limitToast,   setLimitToast]   = useState(false);
  const downloadingRef  = useRef(false);
  // The ref guards re-entry; the state is what the person can see.
  const [downloading, setDownloading] = useState(false);

  const lastTapRef      = useRef(0);
  const longTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef    = useRef(false);
  const movedRef        = useRef(false);
  const startRef        = useRef({ x: 0, y: 0 });

  const isFemale = profile.gender === 'female';
  const urgent   = isUrgent(profile.body);
  const longBody = profile.body.length > 200;

  const titleDir = useMemo(() => textDir(profile.title), [profile.title]);
  const bodyDir  = useMemo(() => textDir(profile.body),  [profile.body]);

  const cancelLong = useCallback(() => {
    if (longTimerRef.current) clearTimeout(longTimerRef.current);
    longTimerRef.current = null;
  }, []);

  /**
   * Render the card to a PNG and hand it over.
   *
   * `toPng` walks the subtree, inlines its styles and rasterises at 2x — tens
   * to hundreds of milliseconds on the main thread, and it used to run inside
   * the click. That put the whole export inside the interaction: nothing
   * painted until it finished, so the button appeared dead and the tap scored
   * its full cost as INP.
   *
   * Now the pending state paints first and the export starts after that frame.
   * The work is the same; the person just isn't waiting on a frozen button.
   */
  const handleDownload = useCallback(() => {
    if (!cardRef.current || downloadingRef.current) return;
    downloadingRef.current = true;
    setDownloading(true);
    if (navigator.vibrate) navigator.vibrate(10);

    afterNextPaint(async () => {
      try {
        const { toPng } = await import('html-to-image');
        if (!cardRef.current) return;

        const dataUrl = await toPng(cardRef.current, {
          backgroundColor: '#fff',
          pixelRatio: 2,
          filter: node => !(node instanceof Element && node.hasAttribute('data-no-capture')),
        });

        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `instarishta-${profile._num}.png`;
        a.click();
      } catch {}

      downloadingRef.current = false;
      setDownloading(false);
    });
  }, [profile._num]);

  const handleContact = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canContact) {
      if (onLimitHit) { onLimitHit(); return; }
      setLimitToast(true);
      setTimeout(() => setLimitToast(false), 3000);
      return;
    }
    onContact(profile);
  }, [canContact, onLimitHit, onContact, profile]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
    movedRef.current = false;
    longFiredRef.current = false;
    cancelLong();
    longTimerRef.current = setTimeout(() => {
      longFiredRef.current = true;
      if (navigator.vibrate) navigator.vibrate(18);
      onBiodata(profile);
    }, 600);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - startRef.current.x);
    const dy = Math.abs(t.clientY - startRef.current.y);
    if (dx > 12 || dy > 12) { movedRef.current = true; cancelLong(); }
  };

  const onTouchEnd = () => {
    cancelLong();
    if (movedRef.current || longFiredRef.current) return;
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      handleDownload();
    } else {
      lastTapRef.current = now;
    }
  };

  return (
    <div
      ref={cardRef}
      className="overflow-hidden relative"
      style={{ background: '#fff', border: '1.5px solid #F0ECE8', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={cancelLong}
      onDoubleClick={e => { if (!(e.target as Element).closest('button,a')) handleDownload(); }}
      onContextMenu={e => { if (!(e.target as Element).closest('button,a')) { e.preventDefault(); onBiodata(profile); } }}
    >
      {limitToast && (
        <div data-no-capture className="absolute inset-x-0 top-0 z-10 py-2 text-center text-xs font-semibold"
          style={{ background: '#CF4500', color: '#fff', borderRadius: '20px 20px 0 0' }}>
          No credits left · Upgrade your plan
        </div>
      )}

      {/* Paints before the export starts, so the card is visibly busy rather
          than unresponsive. data-no-capture keeps it out of the PNG. */}
      {downloading && (
        <div data-no-capture className="absolute inset-x-0 top-0 z-10 py-2 text-center text-xs font-semibold"
          style={{ background: '#00A86B', color: '#fff', borderRadius: '20px 20px 0 0' }}>
          Saving card…
        </div>
      )}

      <div className="flex items-center justify-between px-4 pt-4 pb-3" style={{ borderBottom: '1px solid #F0ECE8' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
            style={{ background: isFemale ? '#FDF0F5' : '#EEF6F0', color: isFemale ? '#C0397A' : '#006241' }}>
            {isFemale ? '♀' : '♂'}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.07em]" style={{ color: '#A0A0A0' }}>IR #{profile._num}</p>
            <p className="text-xs font-bold capitalize" style={{ color: isFemale ? '#C0397A' : '#006241' }}>
              {isFemale ? 'Bride' : 'Groom'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {urgent && (
            <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: '#FFF3EE', color: '#CF4500' }}>Urgent</span>
          )}
        </div>
      </div>

      <div className="px-4 py-3.5">
        <p className="font-bold mb-2"
          dir={titleDir}
          lang={titleDir === 'rtl' ? 'ur' : undefined}
          style={{
            color: '#141413', lineHeight: 1.6, fontSize: '0.95rem',
            textAlign: titleDir === 'rtl' ? 'center' : 'left',
            fontFamily: titleDir === 'rtl' ? URDU_FONT : 'inherit',
          }}>
          {profile.title}
        </p>
        <p
          dir={bodyDir}
          lang={bodyDir === 'rtl' ? 'ur' : undefined}
          style={{
            color: '#4B4B4B', fontSize: '0.87rem',
            lineHeight: bodyDir === 'rtl' ? 1.85 : 1.6,
            textAlign: bodyDir === 'rtl' ? 'justify' : 'left',
            fontFamily: bodyDir === 'rtl' ? URDU_FONT : 'inherit',
            display: '-webkit-box', WebkitBoxOrient: 'vertical',
            WebkitLineClamp: expanded ? undefined : 5,
            overflow: expanded ? 'visible' : 'hidden',
          }}>
          {profile.body}
        </p>
        {longBody && (
          <button onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
            className="text-xs font-semibold mt-1.5"
            style={{ color: '#006241', direction: 'ltr' }}>
            {expanded ? 'Read less' : 'Read more'}
          </button>
        )}
      </div>

      <div className="px-4 pb-3 pt-1 flex gap-2 items-center">
        {canContact ? (
          <button onClick={handleContact}
            className="flex-1 rounded-full py-2.5 text-sm font-bold flex items-center justify-center gap-2"
            style={{ background: '#006241', color: '#fff' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
            Contact
          </button>
        ) : (
          <button onClick={handleContact}
            className="flex-1 rounded-full py-2.5 text-sm font-bold flex items-center justify-center gap-2"
            style={{ background: '#1E3932', color: '#fff' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Get Credits
          </button>
        )}
        <AudioBtn url={profile.audio_url} />
        {/* Interest — private, costs no contact credit. */}
        <button
          onClick={e => { e.stopPropagation(); if (!interestSent) onInterest(profile); }}
          disabled={interestSent}
          className="w-10 h-10 rounded-full flex items-center justify-center border shrink-0"
          style={interestAccepted
            ? { borderColor: '#00A86B', background: '#00A86B', color: '#fff' }
            : interestSent
              ? { borderColor: '#00A86B', background: '#EEF6F0', color: '#006241' }
              : { borderColor: '#D1CDC7', color: '#696969' }}
          title={
            interestAccepted ? 'They want to connect — see My interests'
            : interestSent   ? 'Interest sent — awaiting their reply'
            : 'Express interest (free)'
          }>
          <svg width="15" height="15" viewBox="0 0 24 24"
            fill={interestSent ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21.2l7.7-7.8 1.1-1a5.5 5.5 0 0 0 0-7.8z"/>
          </svg>
        </button>
      </div>

      <div className="mx-4 mb-3 rounded-xl px-3 py-2.5 flex items-center justify-between"
        style={{ background: '#EEF6F0', border: '1px solid #D7EDE5' }}>
        <div>
          <p className="text-[0.72rem] font-extrabold tracking-[-0.01em]" style={{ color: '#006241' }}>
            InstaRishta<span style={{ color: '#141413' }}>.me</span>
          </p>
          <p className="text-[0.6rem] font-medium" style={{ color: '#696969' }}>Trusted Muslim Matrimony · IR #{profile._num}</p>
        </div>
        <p className="text-[0.58rem] font-semibold text-right" style={{ color: '#A0A0A0', maxWidth: 100 }}>
          instarishta.me/profiles
        </p>
      </div>

      {/* The biodata was reachable only by long-press, right-click, or a line
          of 10px grey type nobody reads -- a whole structured view hidden
          behind a gesture. The gestures still work; this is the way in. */}
      <div data-no-capture className="px-4 pb-2.5 flex justify-between items-center gap-2">
        <button
          onClick={e => { e.stopPropagation(); onBiodata(profile); }}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold"
          style={{ background: '#EEF6F0', color: '#006241', border: '1px solid #CFE6D8' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 4h9a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" />
            <path d="M20 4h-4a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h5z" />
          </svg>
          Biodata
        </button>
        <span className="text-[10px]" style={{ color: '#D1CDC7' }}>double-tap to save · ↕ swipe</span>
      </div>
    </div>
  );
}, (prev, next) =>
  prev.profile._num   === next.profile._num   &&
  prev.profile.title  === next.profile.title  &&
  prev.profile.body   === next.profile.body   &&
  prev.canContact     === next.canContact     &&
  prev.remaining      === next.remaining      &&
  prev.resetLabel     === next.resetLabel     &&
  prev.interestStatus === next.interestStatus
);

// ── SwipeDeck ─────────────────────────────────────────────────────────────────

function SwipeDeck({
  profiles, onContact, onBiodata, canContact, remaining, resetLabel, onLimitHit,
  onInterest, statusFor,
}: {
  profiles: DeckProfile[];
  onContact: (p: DeckProfile) => void;
  onBiodata: (p: DeckProfile) => void;
  canContact: boolean;
  remaining: number;
  resetLabel: string;
  onLimitHit?: () => void;
  onInterest: (p: DeckProfile) => void;
  statusFor: (profileId: number | undefined) => string | null;
}) {
  const [idx,     setIdx]     = useState(0);
  const [swipeX,  setSwipeX]  = useState(0);
  const [animOut, setAnimOut] = useState<'left' | 'right' | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const dirRef    = useRef<'h' | 'v' | null>(null);
  const dragging  = useRef(false);
  const inAnim    = useRef(false);
  const deckRef   = useRef<HTMLDivElement>(null);

  useEffect(() => { setIdx(0); setSwipeX(0); setAnimOut(null); }, [profiles]);

  useLayoutEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;
    const top = deck.querySelector<HTMLElement>('.deck-top');
    if (top) deck.style.height = (top.offsetHeight + 52) + 'px';
  });

  const goNext = useCallback(() => {
    if (inAnim.current || idx >= profiles.length - 1) return;
    inAnim.current = true;
    setAnimOut('left');
    setTimeout(() => { setIdx(i => i + 1); setSwipeX(0); setAnimOut(null); inAnim.current = false; }, 310);
  }, [idx, profiles.length]);

  const goPrev = useCallback(() => {
    if (idx <= 0) return;
    setIdx(i => i - 1); setSwipeX(0);
  }, [idx]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    startXRef.current = t.clientX;
    startYRef.current = t.clientY;
    dirRef.current = null;
    dragging.current = true;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startXRef.current;
    const dy = e.touches[0].clientY - startYRef.current;
    if (!dirRef.current) {
      if (Math.abs(dx) > Math.abs(dy) + 4)       dirRef.current = 'h';
      else if (Math.abs(dy) > Math.abs(dx) + 4)  dirRef.current = 'v';
    }
    if (dirRef.current === 'h') setSwipeX(dx);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const dx = e.changedTouches[0].clientX - startXRef.current;
    if (dirRef.current === 'h') {
      if (dx < -55) goNext();
      else if (dx > 55) goPrev();
      else setSwipeX(0);
    } else {
      setSwipeX(0);
    }
  };

  const visible = profiles.slice(idx, idx + 4);
  if (!visible.length) return null;

  const layerStyle = (i: number): React.CSSProperties => {
    const transforms = [
      'translateY(0px) scale(1)',
      'translateY(18px) scale(0.962)',
      'translateY(33px) scale(0.924)',
      'translateY(46px) scale(0.886)',
    ];
    const zIndexes = [10, 9, 8, 7];
    return {
      position: 'absolute',
      left: 0, right: 0, top: 0,
      zIndex: zIndexes[i],
      transform: i === 0
        ? (animOut === 'left'  ? 'translateX(-110%) scale(0.92)'
         : animOut === 'right' ? 'translateX(110%) scale(0.92)'
         : `translateX(${swipeX}px) scale(${Math.max(0.92, 1 - Math.abs(swipeX) * 0.0003)})`)
        : transforms[i],
      transition: i === 0 && animOut ? 'transform 0.3s ease, opacity 0.3s ease' : i === 0 ? 'none' : 'transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)',
      opacity: i === 0 && animOut ? 0 : 1,
      pointerEvents: i === 0 ? 'auto' : 'none',
      borderRadius: 20,
      willChange: 'transform',
      touchAction: 'pan-y',
    };
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-0.5">
        <span className="text-xs font-semibold" style={{ color: '#A0A0A0' }}>{idx + 1} / {profiles.length}</span>
        <div className="flex gap-2">
          <button onClick={goPrev} disabled={idx === 0}
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm border transition-all"
            style={{ borderColor: '#D1CDC7', color: idx === 0 ? '#D1CDC7' : '#141413' }}>←</button>
          <button onClick={goNext} disabled={idx >= profiles.length - 1}
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm border transition-all"
            style={{ borderColor: '#D1CDC7', color: idx >= profiles.length - 1 ? '#D1CDC7' : '#141413' }}>→</button>
        </div>
      </div>

      <div ref={deckRef} className="relative w-full" style={{ minHeight: 200 }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onTouchCancel={() => { dragging.current = false; setSwipeX(0); }}>
        {visible.map((p, i) => (
          <div key={`${p._num}-${i}`} style={layerStyle(i)} className={i === 0 ? 'deck-top' : ''}>
            <ProfileCard
              profile={p}
              onContact={onContact}
              onBiodata={onBiodata}
              canContact={canContact}
              remaining={remaining}
              resetLabel={resetLabel}
              onLimitHit={onLimitHit}
              onInterest={onInterest}
              interestStatus={statusFor(p.id)}
            />
          </div>
        ))}
      </div>

      <p className="text-center text-xs mt-16 pt-2" style={{ color: '#C0B8B0' }}>← swipe to browse →</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ProfilesClientProps {
  profiles:        DeckProfile[];        // full server-filtered list — no pagination
  stats:           { total: number; male: number; female: number; urgent: number };
  filters:         FilterParams;         // current filter values (from URL)
  initialFeatured?: { id: string; title: string; description: string | null; image_url: string | null; link_url: string | null }[];
  /** Hand-authored biodata sections keyed by feed profile id. Most profiles
   *  have no entry — BiodataModal falls back to parsing the ad text. */
  authoredBiodata?: Record<string, unknown>;
}

export default function ProfilesClient({
  profiles,
  stats,
  filters,
  initialFeatured,
  authoredBiodata,
}: ProfilesClientProps) {
  const totalCount = profiles.length;
  const router   = useRouter();
  const pathname = usePathname();

  // Mirror server-provided filters in local state. Local state drives UI;
  // changes get pushed to the URL, the server re-renders, and this component
  // receives a new `filters` prop — at which point the effect below re-syncs.
  const [search,     setSearch]     = useState(filters.search);
  const [idFilter,   setIdFilter]   = useState(filters.idFilter);
  const [ageMin,     setAgeMin]     = useState(filters.ageMin);
  const [ageMax,     setAgeMax]     = useState(filters.ageMax);

  // Re-sync if the server-provided values change (browser back/forward, etc.)
  useEffect(() => { setSearch(filters.search);     }, [filters.search]);
  useEffect(() => { setIdFilter(filters.idFilter); }, [filters.idFilter]);
  useEffect(() => { setAgeMin(filters.ageMin);     }, [filters.ageMin]);
  useEffect(() => { setAgeMax(filters.ageMax);     }, [filters.ageMax]);

  const [mobileView,   setMobileView]   = useState<'stack' | 'scroll'>('stack');
  const [contact,      setContact]      = useState<DeckProfile | null>(null);
  const [biodata,      setBiodata]      = useState<DeckProfile | null>(null);
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [, startTransition] = useTransition();

  // Contact-credit gating (better-auth): anon → sign-in; signed-in → spend a
  // credit; out of credits → upgrade. See src/lib/hooks/useContactCredits.ts.
  const { remaining, canUse: canContact, isAnon, email, consume, refresh, phoneLocked } = useContactCredits();
  const resetLabel = '';
  const [authGate,     setAuthGate]     = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  // Paid member, mobile not verified — the credits exist but cannot be spent.
  const [phoneGate,    setPhoneGate]    = useState(false);

  // Interests — private, metered separately, and free of contact credits.
  const interests = useInterests(!isAnon);
  const [interest, setInterest] = useState<DeckProfile | null>(null);

  const handleInterestRequest = useCallback((p: DeckProfile) => {
    if (isAnon) { setAuthGate(true); return; }
    setInterest(p);
  }, [isAnon]);

  const onLimitHit = useCallback(() => {
    if (isAnon) setAuthGate(true);
    else        setPaymentModal(true);
  }, [isAnon]);

  const handleContactRequest = useCallback(async (p: DeckProfile) => {
    if (isAnon) { setAuthGate(true); return; }
    // Known ahead of time from /api/account/profile — don't make the member tap
    // into a 403 to find out their credits are locked.
    if (phoneLocked) { setPhoneGate(true); return; }

    const outcome = await consume();     // spends one contact credit
    if (outcome === 'phone_required') { setPhoneGate(true); return; }
    if (outcome !== 'ok')             { setPaymentModal(true); return; }
    setContact(p);
  }, [isAnon, consume, phoneLocked]);

  // Push a URL-param update. Defaults are removed from the URL to keep it tidy.
  const pushParams = useCallback((updates: Partial<Record<keyof FilterParams | 'q' | 'urgent', string | number | boolean | null>>) => {
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string | null) => {
      if (value === null || value === '' || value === 'all' || value === 'default') params.delete(key);
      else params.set(key, value);
    };
    for (const [k, v] of Object.entries(updates)) {
      const key = k === 'search' ? 'q' : k === 'urgentOnly' ? 'urgent' : k;
      if (typeof v === 'boolean')      setOrDelete(key, v ? '1' : null);
      else if (typeof v === 'number')  setOrDelete(key, String(v));
      else                             setOrDelete(key, v ?? null);
    }
    // Clamp age params to defaults (drop them)
    const aMin = parseInt(params.get('ageMin') ?? '18', 10);
    const aMax = parseInt(params.get('ageMax') ?? '60', 10);
    if (aMin <= 18) params.delete('ageMin');
    if (aMax >= 60) params.delete('ageMax');

    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }, [pathname, router]);

  // Debounce search input → URL
  useEffect(() => {
    if (search === filters.search) return;
    const t = setTimeout(() => pushParams({ search }), 300);
    return () => clearTimeout(t);
  }, [search, filters.search, pushParams]);

  // Debounce id filter → URL
  useEffect(() => {
    if (idFilter === filters.idFilter) return;
    const t = setTimeout(() => pushParams({ idFilter }), 300);
    return () => clearTimeout(t);
  }, [idFilter, filters.idFilter, pushParams]);

  // Debounce age range → URL (waits for slider release)
  useEffect(() => {
    if (ageMin === filters.ageMin && ageMax === filters.ageMax) return;
    const t = setTimeout(() => pushParams({ ageMin, ageMax }), 400);
    return () => clearTimeout(t);
  }, [ageMin, ageMax, filters.ageMin, filters.ageMax, pushParams]);

  const clearAll = useCallback(() => {
    setSearch(''); setIdFilter(''); setAgeMin(18); setAgeMax(60);
    startTransition(() => { router.replace(pathname, { scroll: false }); });
  }, [pathname, router]);

  const activeFilterCount = countFilters(filters);

  // Mirror the vanilla-JS renderer (js/app/modules/renderer.js): render every
  // matched profile in one pass. Server already filtered, no pagination.
  const displayed = profiles;

  // Convenience aliases — JSX below was written against these names.
  const gender    = filters.gender;
  const education = filters.education;
  const marital   = filters.marital;
  const sort      = filters.sort;
  const state     = filters.state;
  const community = filters.community;
  const urgentOnly = filters.urgentOnly;
  const filtered  = profiles;
  const loading   = false;
  const setGender    = (v: string) => pushParams({ gender:    v });
  const setEducation = (v: string) => pushParams({ education: v });
  const setMarital   = (v: string) => pushParams({ marital:   v });
  const setSort      = (v: string) => pushParams({ sort:      v });
  const setState     = (v: string) => pushParams({ state:     v });
  const setCommunity = (v: string) => pushParams({ community: v });

  return (
    <div style={{ background: '#FFFFFF', minHeight: '100vh' }}>

      <FeaturedCarousel placement="profiles" label="Spotlight Profiles" initialItems={initialFeatured} />

      <div style={{ background: '#1E3932', color: '#fff' }} className="px-4 sm:px-6 pt-4 pb-4">
        <div className="max-w-7xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.08em] mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Browse</p>
          <h1 className="font-extrabold tracking-[-0.03em] mb-4" style={{ fontSize: 'clamp(1.3rem,3.5vw,2rem)' }}>
            <GradientText colors={['#00C87A', '#ffffff', '#00A86B', '#ffffff']} animationSpeed={7} className="font-extrabold tracking-[-0.03em]">
              Verified Rishta Profiles
            </GradientText>
          </h1>

          {/* Mobile: search + "All filters" (desktop has its own bar below). */}
          <div className="flex md:hidden gap-2 mb-3">
            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by education, location…"
              className="flex-1 min-w-0 rounded-full px-4 py-2.5 text-sm outline-none border-0"
              style={{ background: 'rgba(255,255,255,0.13)', color: '#fff' }} />
            <button onClick={() => setDrawerOpen(true)}
              className="shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold border-0 flex items-center gap-1.5"
              style={{ background: '#fff', color: '#141413' }}>
              ⚙ Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
            </button>
          </div>

          <div className="hidden md:flex gap-3 flex-wrap items-center mb-3">
            <div className="relative flex-1 min-w-55">
              <input type="search" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by education, location…"
                className="w-full rounded-full px-5 py-2.5 text-sm outline-none border-0"
                style={{ background: 'rgba(255,255,255,0.13)', color: '#fff' }} />
            </div>
            <select value={education} onChange={e => setEducation(e.target.value)}
              className="rounded-full px-4 py-2.5 text-sm font-medium border-0 outline-none"
              style={{ background: 'rgba(255,255,255,0.13)', color: '#fff' }}>
              {EDUCATION_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ color: '#141413' }}>{o.label}</option>)}
            </select>
            <select value={marital} onChange={e => setMarital(e.target.value)}
              className="rounded-full px-4 py-2.5 text-sm font-medium border-0 outline-none"
              style={{ background: 'rgba(255,255,255,0.13)', color: '#fff' }}>
              {MARITAL_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ color: '#141413' }}>{o.label}</option>)}
            </select>
          </div>

          {/* Desktop: the rest of the filters, inline (mobile keeps the drawer). */}
          <div className="hidden md:flex gap-3 flex-wrap items-center mb-3">
            <select value={sort} onChange={e => setSort(e.target.value)}
              className="rounded-full px-4 py-2.5 text-sm font-medium border-0 outline-none"
              style={{ background: 'rgba(255,255,255,0.13)', color: '#fff' }}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ color: '#141413' }}>{o.label === 'Default' ? 'Sort: Default' : o.label}</option>)}
            </select>
            <select value={state} onChange={e => setState(e.target.value)}
              className="rounded-full px-4 py-2.5 text-sm font-medium border-0 outline-none"
              style={{ background: 'rgba(255,255,255,0.13)', color: '#fff' }}>
              {STATE_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ color: '#141413' }}>{o.label}</option>)}
            </select>
            <select value={community} onChange={e => setCommunity(e.target.value)}
              className="rounded-full px-4 py-2.5 text-sm font-medium border-0 outline-none"
              style={{ background: 'rgba(255,255,255,0.13)', color: '#fff' }}>
              {COMMUNITY_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ color: '#141413' }}>{o.label}</option>)}
            </select>
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={idFilter}
              onChange={e => setIdFilter(e.target.value.replace(/\D/g, ''))}
              placeholder="Profile ID"
              className="rounded-full px-4 py-2.5 text-sm w-32 outline-none border-0 placeholder:text-white/50"
              style={{ background: 'rgba(255,255,255,0.13)', color: '#fff' }} />
            <div className="flex items-center gap-1.5 rounded-full px-4 py-1.5" style={{ background: 'rgba(255,255,255,0.13)' }}>
              <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>Age</span>
              <input type="number" min={18} max={60} value={ageMin}
                onChange={e => setAgeMin(Math.min(Math.max(+e.target.value || 18, 18), ageMax - 1))}
                aria-label="Minimum age"
                className="w-10 bg-transparent text-sm text-white outline-none text-center" />
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>–</span>
              <input type="number" min={18} max={60} value={ageMax}
                onChange={e => setAgeMax(Math.max(Math.min(+e.target.value || 60, 60), ageMin + 1))}
                aria-label="Maximum age"
                className="w-10 bg-transparent text-sm text-white outline-none text-center" />
            </div>
          </div>

          <div className="hidden md:flex gap-2 justify-center">
            {[['all','All'],['male','Groom'],['female','Bride']].map(([v, l]) => (
              <button key={v} onClick={() => setGender(v)}
                className="rounded-full px-5 py-1.5 text-xs font-semibold border transition-all"
                style={{
                  background:  gender === v ? '#fff' : 'transparent',
                  color:       gender === v ? '#141413' : 'rgba(255,255,255,0.75)',
                  borderColor: gender === v ? '#fff' : 'rgba(255,255,255,0.3)',
                }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden md:block border-b" style={{ borderColor: '#F0ECE8' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-5 divide-x" style={{ borderColor: '#F0ECE8' }}>
            {[
              { label: 'Total',  value: stats.total },
              { label: 'Groom',  value: stats.male },
              { label: 'Bride',  value: stats.female },
              { label: 'Urgent', value: stats.urgent },
              { label: 'Contact credits', value: remaining },
            ].map(s => (
              <div key={s.label} className="py-3 px-4 text-center">
                <strong className="block text-lg font-extrabold" style={{ color: '#141413' }}>
                  <CountUp to={s.value} duration={1.2} />
                </strong>
                <span className="text-xs font-medium" style={{ color: '#A0A0A0' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 pb-24 md:pb-10">

        {activeFilterCount > 0 && (
          <div className="flex gap-2 flex-wrap mb-4">
            {gender !== 'all' && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: '#1E3932', color: '#fff' }}>
                {gender === 'male' ? 'Groom' : 'Bride'}
                <button onClick={() => setGender('all')}>×</button>
              </span>
            )}
            {search && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: '#1E3932', color: '#fff' }}>
                &ldquo;{search}&rdquo; <button type="button" onClick={() => setSearch('')}>×</button>
              </span>
            )}
            {education && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: '#1E3932', color: '#fff' }}>
                {EDUCATION_OPTIONS.find(o => o.value === education)?.label}
                <button onClick={() => setEducation('')}>×</button>
              </span>
            )}
            {marital && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: '#1E3932', color: '#fff' }}>
                {MARITAL_OPTIONS.find(o => o.value === marital)?.label}
                <button type="button" onClick={() => setMarital('')}>×</button>
              </span>
            )}
            {state && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: '#1E3932', color: '#fff' }}>
                {STATE_OPTIONS.find(o => o.value === state)?.label ?? state}
                <button type="button" onClick={() => setState('')}>×</button>
              </span>
            )}
            {community && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: '#1E3932', color: '#fff' }}>
                {COMMUNITY_OPTIONS.find(o => o.value === community)?.label ?? community}
                <button type="button" onClick={() => setCommunity('')}>×</button>
              </span>
            )}
            {sort !== 'default' && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: '#1E3932', color: '#fff' }}>
                Sort: {SORT_OPTIONS.find(o => o.value === sort)?.label ?? sort}
                <button type="button" onClick={() => setSort('default')}>×</button>
              </span>
            )}
            {urgentOnly && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: '#1E3932', color: '#fff' }}>
                Urgent only
                <button type="button" onClick={() => pushParams({ urgentOnly: false })}>×</button>
              </span>
            )}
            {idFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: '#1E3932', color: '#fff' }}>
                ID #{idFilter}
                <button type="button" onClick={() => setIdFilter('')}>×</button>
              </span>
            )}
            {(ageMin > 18 || ageMax < 60) && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: '#1E3932', color: '#fff' }}>
                Age {ageMin}–{ageMax}
                <button type="button" onClick={() => { setAgeMin(18); setAgeMax(60); }}>×</button>
              </span>
            )}
            <button type="button" onClick={clearAll} className="text-xs font-medium underline" style={{ color: '#696969' }}>Clear all</button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden animate-pulse" style={{ border: '1.5px solid #F0ECE8' }}>
                <div className="px-4 pt-4 pb-3 flex gap-3" style={{ borderBottom: '1px solid #F0ECE8' }}>
                  <div className="w-11 h-11 rounded-full" style={{ background: '#F3F0EE' }} />
                  <div className="flex-1 space-y-1.5 pt-1">
                    <div className="h-2.5 rounded-full w-1/3" style={{ background: '#F3F0EE' }} />
                    <div className="h-2 rounded-full w-1/4" style={{ background: '#EDE9E5' }} />
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <div className="h-3 rounded-full w-3/4" style={{ background: '#F3F0EE' }} />
                  <div className="h-2.5 rounded-full w-full" style={{ background: '#EDE9E5' }} />
                  <div className="h-2.5 rounded-full w-5/6" style={{ background: '#EDE9E5' }} />
                </div>
                <div className="px-4 pb-4"><div className="h-10 rounded-full" style={{ background: '#EDE9E5' }} /></div>
              </div>
            ))}
          </div>
        ) : totalCount === 0 ? (
          <div className="text-center py-24">
            <div className="text-5xl mb-4">💍</div>
            <p className="text-lg font-semibold mb-1" style={{ color: '#141413' }}>No profiles found</p>
            <p className="text-sm mb-4" style={{ color: '#696969' }}>Try adjusting your search or filters</p>
            <button onClick={clearAll} className="rounded-full px-6 py-2.5 text-sm font-bold" style={{ background: '#006241', color: '#fff' }}>
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="md:hidden">
              <div className="flex items-center justify-end gap-1.5 mb-3">
                <span className="text-xs mr-auto" style={{ color: '#A0A0A0' }}>
                  {totalCount.toLocaleString()} profile{totalCount !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => setMobileView('stack')}
                  title="Stack view"
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: mobileView === 'stack' ? '#1E3932' : '#F3F0EE', color: mobileView === 'stack' ? '#fff' : '#696969' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="2" y="7" width="20" height="14" rx="2"/>
                    <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/>
                    <path d="M4 11h16"/>
                  </svg>
                </button>
                <button
                  onClick={() => setMobileView('scroll')}
                  title="Scroll view"
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: mobileView === 'scroll' ? '#1E3932' : '#F3F0EE', color: mobileView === 'scroll' ? '#fff' : '#696969' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="3" y1="6"  x2="21" y2="6"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="3" y1="18" x2="21" y2="18"/>
                  </svg>
                </button>
              </div>

              {mobileView === 'stack' ? (
                <SwipeDeck
                  profiles={filtered}
                  onContact={handleContactRequest}
                  onBiodata={setBiodata}
                  canContact={canContact}
                  remaining={remaining}
                  resetLabel={resetLabel}
                  onLimitHit={onLimitHit}
                  onInterest={handleInterestRequest}
                  statusFor={interests.statusFor}
                />
              ) : (
                <div className="flex flex-col gap-4">
                  {displayed.map(p => (
                    <ProfileCard
                      key={p._num}
                      profile={p}
                      onContact={handleContactRequest}
                      onBiodata={setBiodata}
                      canContact={canContact}
                      remaining={remaining}
                      resetLabel={resetLabel}
                      onLimitHit={onLimitHit}
                      onInterest={handleInterestRequest}
                      interestStatus={interests.statusFor(p.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <p className="hidden md:block text-sm font-medium mb-5" style={{ color: '#696969' }}>
              {totalCount.toLocaleString()} profile{totalCount !== 1 ? 's' : ''} found
            </p>
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayed.map(p => (
                <ProfileCard
                  key={p._num}
                  profile={p}
                  onContact={handleContactRequest}
                  onBiodata={setBiodata}
                  canContact={canContact}
                  remaining={remaining}
                  resetLabel={resetLabel}
                  onLimitHit={onLimitHit}
                  onInterest={handleInterestRequest}
                  interestStatus={interests.statusFor(p.id)}
                />
              ))}
            </div>

          </>
        )}
      </div>

      <button onClick={() => setDrawerOpen(true)}
        className="fixed md:hidden w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
        style={{ bottom: 88, right: 20, zIndex: 60, background: '#006241', color: '#fff' }}
        aria-label="Open filters">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="12" y1="18" x2="20" y2="18"/>
        </svg>
        {activeFilterCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ background: '#CF4500', color: '#fff' }}>{activeFilterCount}</span>
        )}
      </button>

      {drawerOpen && (
        <FilterDrawer
          open={drawerOpen} onClose={() => setDrawerOpen(false)}
          idFilter={idFilter} setIdFilter={setIdFilter}
          gender={gender} setGender={setGender}
          ageMin={ageMin} setAgeMin={setAgeMin}
          ageMax={ageMax} setAgeMax={setAgeMax}
          state={state} setState={setState}
          community={community} setCommunity={setCommunity}
          education={education} setEducation={setEducation}
          marital={marital} setMarital={setMarital}
          sort={sort} setSort={setSort}
          onClear={clearAll}
          stats={stats}
          contactLimit={remaining}
          remaining={remaining}
          resetLabel={resetLabel}
          isAnon={isAnon}
        />
      )}

      {contact && (
        <ContactModal
          profile={contact} num={contact._num}
          onClose={() => setContact(null)}
          remaining={remaining}
          resetLabel={resetLabel}
          contactLimit={remaining}
          isAnon={false}
        />
      )}

      {biodata && (
        <BiodataModal
          profile={biodata}
          authored={authoredBiodata?.[String(biodata.id ?? '')]}
          onClose={() => setBiodata(null)}
        />
      )}

      {authGate && (
        <AuthModal
          redirectTo="/profiles"
          onClose={() => setAuthGate(false)}
          onSuccess={() => { setAuthGate(false); refresh(); }}
        />
      )}

      {paymentModal && (
        <PaymentModal userEmail={email} onClose={() => setPaymentModal(false)} />
      )}

      {phoneGate && (
        <PhoneGateModal
          onClose={() => setPhoneGate(false)}
          // refresh() re-reads the profile, which clears phoneLocked and lets
          // the next Contact tap through without a reload.
          onLinked={() => { refresh(); setPhoneGate(false); }}
        />
      )}

      {interest && (
        <InterestModal
          profile={interest}
          usedMonth={interests.usedMonth}
          monthly={interests.monthly}
          onSent={(used) => interests.markSent(interest.id, used)}
          onClose={() => setInterest(null)}
        />
      )}
    </div>
  );
}
