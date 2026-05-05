'use client';
import { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import dynamic from 'next/dynamic';
import { toPng } from 'html-to-image';
import GradientText from '@/components/ui/GradientText';
import CountUp from '@/components/ui/CountUp';
import ClickSpark from '@/components/ui/ClickSpark';
import { useUsageLimit } from '@/hooks/useUsageLimit';
import { USAGE_LIMITS } from '@/lib/auth-client';
import AuthModal from '@/components/AuthModal';

const MagicRings = dynamic(() => import('@/components/ui/MagicRings'), { ssr: false });

const WORKER_URL   = 'https://instarishta-profile-relay.instarishtalead.workers.dev/api/profiles';
const BUSINESS_WA  = '+918886667121';

export interface Profile {
  title: string;
  body: string;
  gender: 'male' | 'female' | string;
  audio_url?: string;
  instagram_post_id?: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function matchesEdu(body: string, val: string) {
  if (!val) return true;
  const b = body.toLowerCase();
  switch (val) {
    case 'doctor':       return /mbbs|m\.?b\.?b\.?s|bds|doctor|md\b/.test(b);
    case 'engineer':     return /b\.?tech|m\.?tech|engineer|software|b\.e\b/.test(b);
    case 'mba':          return /\bmba\b|\bbba\b/.test(b);
    case 'ms':           return /\bms\b|\bm\.sc\b|\bmsc\b/.test(b);
    case 'graduate':     return /\bb\.com\b|\bba\b|\bbsc\b|\bgraduate\b/.test(b);
    case 'hafiz':        return /hafiz|aalim|qur'?an|قرآن/.test(b);
    case 'phd':          return /\bphd\b/.test(b);
    case 'intermediate': return /\bssc\b|\bintermediate\b|\bmatric\b/.test(b);
    default:             return true;
  }
}

function matchesMarital(body: string, val: string) {
  if (!val) return true;
  const b = body.toLowerCase();
  if (val === 'divorced')      return /divorced|khula|طلاق/.test(b);
  if (val === 'widow')         return /widow|بیوہ/.test(b);
  if (val === 'never married') return !/divorced|khula|طلاق|widow|بیوہ/.test(b);
  return true;
}

function isUrgent(body: string) {
  return /urgent|جلد|ارجنٹ/.test(body.toLowerCase());
}

function parseAge(body: string): number {
  const m = body.match(/عمر\s+(\d{2})/);
  return m ? parseInt(m[1], 10) : 0;
}

function matchesLocation(body: string, val: string) {
  if (!val) return true;
  const b = body.toLowerCase();
  const MAP: Record<string, string[]> = {
    hyderabad:  ['hyderabad','hyderabadi','حیدر آباد','حیدرآباد'],
    gulf:       ['dubai','uae','saudi','qatar','kuwait','bahrain','oman','gulf','خلیج'],
    usa:        ['usa','united states','america','امریکہ'],
    uk:         ['uk','united kingdom','britain','england','برطانیہ'],
    australia:  ['australia','آسٹریلیا'],
    delhi:      ['delhi','new delhi'],
    mumbai:     ['mumbai','bombay'],
    karnataka:  ['bangalore','bengaluru','karnataka'],
    telangana:  ['telangana','warangal','nizamabad'],
  };
  return (MAP[val] ?? [val]).some(k => b.includes(k));
}

const EDUCATION_OPTIONS = [
  { label: 'All Educations',     value: '' },
  { label: 'Doctor / MBBS',      value: 'doctor' },
  { label: 'Engineer / B.Tech',  value: 'engineer' },
  { label: 'MBA / BBA',          value: 'mba' },
  { label: 'MS / MSc',           value: 'ms' },
  { label: 'Graduate (BA/BCom)', value: 'graduate' },
  { label: 'Hafiz / Aalim',      value: 'hafiz' },
  { label: 'PhD',                value: 'phd' },
  { label: 'Intermediate / SSC', value: 'intermediate' },
];
const MARITAL_OPTIONS = [
  { label: 'All Statuses',       value: '' },
  { label: 'Never Married',      value: 'never married' },
  { label: 'Divorced / Khula',   value: 'divorced' },
  { label: 'Widow / Widower',    value: 'widow' },
];
const STATE_OPTIONS = [
  { label: 'All States / Countries',   value: '' },
  { label: 'Hyderabad',                value: 'hyderabad' },
  { label: 'Gulf (UAE/Saudi/Qatar…)',   value: 'gulf' },
  { label: 'USA',                      value: 'usa' },
  { label: 'UK',                       value: 'uk' },
  { label: 'Australia',                value: 'australia' },
  { label: 'Delhi',                    value: 'delhi' },
  { label: 'Mumbai',                   value: 'mumbai' },
  { label: 'Bangalore / Karnataka',    value: 'karnataka' },
  { label: 'Telangana',                value: 'telangana' },
];
const COMMUNITY_OPTIONS = [
  { label: 'All Communities',      value: '' },
  { label: 'Sunni',                value: 'sunni' },
  { label: 'Shia',                 value: 'shia' },
  { label: 'Deobandi',             value: 'deobandi' },
  { label: 'Barelvi',              value: 'barelvi' },
  { label: 'Salafi / Ahle Hadith', value: 'salafi' },
];
const SORT_OPTIONS = [
  { label: 'Default',      value: 'default' },
  { label: 'Urgent first', value: 'urgent' },
  { label: 'Groom first',  value: 'male' },
  { label: 'Bride first',  value: 'female' },
];

// ── AudioBtn ──────────────────────────────────────────────────────────────────

function AudioBtn({ url }: { url?: string }) {
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

  const r = 15, circ = 2 * Math.PI * r;
  const dash = circ * (1 - progress);
  const active = state !== 'idle';

  return (
    <div className="relative shrink-0" style={{ width: 40, height: 40 }}>
      {/* MagicRings halo when playing */}
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

// ── ContactModal ──────────────────────────────────────────────────────────────

function ContactModal({
  profile, num, onClose, remaining, resetLabel, contactLimit,
}: {
  profile: Profile; num: number; onClose: () => void;
  remaining: number; resetLabel: string; contactLimit: number;
}) {

  const text = encodeURIComponent(
    `السلام علیکم،\n\nProfile #${num} inquiry:\n\n${profile.title}\n\n${profile.body}\n\n(via InstaRishta.me)`
  );
  return (
    <div className="fixed inset-0 z-200 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <section className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 pb-8" style={{ background: '#fff', zIndex: 1 }}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: '#696969' }}>Contact via</p>
            <h2 className="text-lg font-extrabold mt-0.5" style={{ color: '#141413' }}>Profile #{num}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: '#F3F0EE', color: '#141413' }}>×</button>
        </div>

        {/* Credit indicator */}
        <div className="flex items-center justify-between rounded-xl px-3 py-2 mb-4"
          style={{ background: remaining <= 3 ? '#FFF3EE' : '#F3F0EE' }}>
          <span className="text-xs font-medium" style={{ color: remaining <= 3 ? '#CF4500' : '#696969' }}>
            {remaining}/{contactLimit} contact{remaining !== 1 ? 's' : ''} left this hour
          </span>
          {resetLabel && (
            <span className="text-[10px] font-semibold" style={{ color: '#A0A0A0' }}>resets in {resetLabel}</span>
          )}
        </div>

        <div className="rounded-[14px] p-4 mb-5 text-sm leading-relaxed" dir="rtl" lang="ur"
          style={{ background: '#F3F0EE', color: '#141413', fontFamily: "'Noto Nastaliq Urdu','Noto Naskh Arabic',serif", maxHeight: 140, overflowY: 'auto' }}>
          <strong className="block mb-1 text-xs font-bold not-italic" style={{ color: '#696969' }}>{profile.title}</strong>
          {profile.body.slice(0, 280)}{profile.body.length > 280 ? '…' : ''}
        </div>
        <div className="flex flex-col gap-3">
          <a href={`https://wa.me/${BUSINESS_WA}?text=${text}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 rounded-full py-3.5 text-sm font-bold"
            style={{ background: '#25D366', color: '#fff' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Chat on WhatsApp
          </a>
          <a href={`tel:${BUSINESS_WA}`}
            className="flex items-center justify-center gap-2 rounded-full py-3 text-sm font-bold border"
            style={{ borderColor: '#D1CDC7', color: '#141413' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.63 19.79 19.79 0 01.22 4.05 2 2 0 012.2 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 9.91a16 16 0 006.28 6.28l1.48-1.48a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
            Call now
          </a>
        </div>
      </section>
    </div>
  );
}

// ── BiodataModal ──────────────────────────────────────────────────────────────

type DeckProfile = Profile & { _num: number };

function BiodataModal({ profile, onClose }: { profile: DeckProfile; onClose: () => void }) {
  const isFemale = profile.gender === 'female';
  const [igOpen, setIgOpen] = useState(false);

  return (
    <div className="fixed inset-0 z-200 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <section className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: '#fff', maxHeight: '90vh', overflowY: 'auto', zIndex: 1 }}>

        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-5 py-3.5" style={{ background: '#1E3932', color: '#fff', zIndex: 2 }}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'rgba(255,255,255,0.55)' }}>InstaRishta Biodata</p>
            <p className="text-sm font-bold">Profile IR #{profile._num}</p>
          </div>
          <div className="flex items-center gap-2">
            {profile.instagram_post_id && (
              <button onClick={() => setIgOpen(v => !v)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.15)' }}
                aria-label="View Instagram post">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/>
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
                </svg>
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold"
              style={{ background: 'rgba(255,255,255,0.15)' }}>×</button>
          </div>
        </div>

        {/* Instagram embed */}
        {igOpen && profile.instagram_post_id && (
          <div className="px-4 pt-4">
            <iframe
              src={`https://www.instagram.com/p/${profile.instagram_post_id}/embed/`}
              className="w-full rounded-2xl"
              style={{ height: 480, border: 'none' }}
              allowFullScreen
              title="Instagram post"
            />
          </div>
        )}

        {/* Biodata content */}
        <div className="p-5">
          {/* Identity */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold shrink-0"
              style={{ background: isFemale ? '#FDF0F5' : '#EEF6F0', color: isFemale ? '#C0397A' : '#006241' }}>
              {isFemale ? '♀' : '♂'}
            </div>
            <div>
              <p className="text-sm font-extrabold" style={{ color: '#141413' }}>{isFemale ? 'Bride (دلہن)' : 'Groom (دولہا)'}</p>
              <p className="text-xs mt-0.5" style={{ color: '#A0A0A0' }}>InstaRishta Profile #{profile._num}</p>
              {isUrgent(profile.body) && (
                <span className="inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                  style={{ background: '#FFF3EE', color: '#CF4500' }}>Urgent</span>
              )}
            </div>
          </div>

          {/* Full biodata text */}
          <div className="rounded-2xl p-4" dir="rtl" lang="ur"
            style={{ background: '#FAFAF9', border: '1.5px solid #F0ECE8', fontFamily: "'Noto Nastaliq Urdu','Noto Naskh Arabic',serif" }}>
            <p className="text-base font-bold mb-3" style={{ color: '#141413', lineHeight: 1.7 }}>
              {profile.title}
            </p>
            <p className="text-sm" style={{ color: '#3A3A3A', lineHeight: 2.2, textAlign: 'justify' }}>
              {profile.body}
            </p>
          </div>

          {/* Footer */}
          <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: '1px solid #F0ECE8' }}>
            <p className="text-xs" style={{ color: '#A0A0A0' }}>instarishta.me</p>
            <p className="text-xs font-semibold" style={{ color: '#006241' }}>IR #{profile._num}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── ProfileCard ───────────────────────────────────────────────────────────────

function ProfileCard({
  profile, onContact, onBiodata, canContact, remaining, resetLabel, onLimitHit,
}: {
  profile: DeckProfile;
  onContact: (p: DeckProfile) => void;
  onBiodata: (p: DeckProfile) => void;
  canContact: boolean;
  remaining: number;
  resetLabel: string;
  onLimitHit?: () => void;
}) {
  const cardRef         = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [limitToast,   setLimitToast]   = useState(false);
  const downloadingRef  = useRef(false);

  // Gesture tracking
  const lastTapRef      = useRef(0);
  const longTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef    = useRef(false);
  const movedRef        = useRef(false);
  const startRef        = useRef({ x: 0, y: 0 });

  const isFemale = profile.gender === 'female';
  const urgent   = isUrgent(profile.body);
  const longBody = profile.body.length > 200;

  const cancelLong = () => {
    if (longTimerRef.current) clearTimeout(longTimerRef.current);
    longTimerRef.current = null;
  };

  const handleDownload = useCallback(async () => {
    if (!cardRef.current || downloadingRef.current) return;
    downloadingRef.current = true;
    if (navigator.vibrate) navigator.vibrate(10);
    try {
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
  }, [profile._num]);

  const handleContact = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canContact) {
      if (onLimitHit) { onLimitHit(); return; }
      setLimitToast(true);
      setTimeout(() => setLimitToast(false), 3000);
      return;
    }
    onContact(profile);
  };

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
      {/* Limit toast — excluded from card capture */}
      {limitToast && (
        <div data-no-capture className="absolute inset-x-0 top-0 z-10 py-2 text-center text-xs font-semibold"
          style={{ background: '#CF4500', color: '#fff', borderRadius: '20px 20px 0 0' }}>
          Limit reached · Resets in {resetLabel || '1h'}
        </div>
      )}

      {/* Header */}
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

      {/* Urdu body */}
      <div className="px-4 py-3.5" dir="rtl" lang="ur"
        style={{ fontFamily: "'Noto Nastaliq Urdu','Noto Naskh Arabic',serif" }}>
        <p className="font-bold mb-2" style={{ color: '#141413', lineHeight: 1.6, fontSize: '0.95rem', textAlign: 'center' }}>
          {profile.title}
        </p>
        <p style={{
          color: '#4B4B4B', fontSize: '0.87rem', lineHeight: 1.85,
          textAlign: 'justify',
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

      {/* Actions */}
      <div className="px-4 pb-4 pt-1 flex gap-2 items-center">
        <button onClick={handleContact}
          className="flex-1 rounded-full py-2.5 text-sm font-bold flex items-center justify-center gap-2"
          style={{ background: canContact ? '#006241' : '#D1CDC7', color: '#fff' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
          {canContact ? 'Contact' : `Limit (${remaining})`}
        </button>
        <AudioBtn url={profile.audio_url} />
        <a href={`tel:${BUSINESS_WA}`} onClick={e => e.stopPropagation()}
          className="w-10 h-10 rounded-full flex items-center justify-center border shrink-0"
          style={{ borderColor: '#D1CDC7', color: '#696969' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.63 19.79 19.79 0 01.22 4.05 2 2 0 012.2 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 9.91a16 16 0 006.28 6.28l1.48-1.48a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
        </a>
      </div>

      {/* Hint footer — excluded from card capture */}
      <div data-no-capture className="px-4 pb-2.5 flex justify-between items-center">
        <span className="text-[10px]" style={{ color: '#D1CDC7' }}>double-tap to save · hold for biodata</span>
        <span className="text-[10px] font-semibold" style={{ color: '#D1CDC7' }}>IR #{profile._num}</span>
      </div>
    </div>
  );
}

// ── SwipeDeck ─────────────────────────────────────────────────────────────────

function SwipeDeck({
  profiles, onContact, onBiodata, canContact, remaining, resetLabel, onLimitHit,
}: {
  profiles: DeckProfile[];
  onContact: (p: DeckProfile) => void;
  onBiodata: (p: DeckProfile) => void;
  canContact: boolean;
  remaining: number;
  resetLabel: string;
  onLimitHit?: () => void;
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
      {/* Counter */}
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

      {/* Deck */}
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
            />
          </div>
        ))}
      </div>

      {/* Swipe hint */}
      <p className="text-center text-xs mt-16 pt-2" style={{ color: '#C0B8B0' }}>← swipe to browse →</p>
    </div>
  );
}

// ── DualRangeSlider ───────────────────────────────────────────────────────────

function DualRangeSlider({ valueMin, valueMax, onMin, onMax }: {
  valueMin: number; valueMax: number;
  onMin: (v: number) => void; onMax: (v: number) => void;
}) {
  const MIN = 18, MAX = 60;
  const pct = (v: number) => ((v - MIN) / (MAX - MIN)) * 100;
  const minPct = pct(valueMin);
  const maxPct = pct(valueMax);
  return (
    <div className="relative" style={{ height: 28, marginTop: 6 }}>
      {/* Track */}
      <div className="absolute inset-x-0 rounded-full" style={{ top: 10, height: 4, background: '#E8E4E0' }} />
      {/* Fill */}
      <div className="absolute rounded-full" style={{ top: 10, height: 4, background: '#006241', left: `${minPct}%`, right: `${100 - maxPct}%` }} />
      {/* Min input */}
      <input type="range" min={MIN} max={MAX} value={valueMin}
        onChange={e => onMin(Math.min(+e.target.value, valueMax - 1))}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
        style={{ height: 28, zIndex: valueMin > (MIN + MAX) / 2 ? 5 : 3 }} />
      {/* Max input */}
      <input type="range" min={MIN} max={MAX} value={valueMax}
        onChange={e => onMax(Math.max(+e.target.value, valueMin + 1))}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
        style={{ height: 28, zIndex: valueMin > (MIN + MAX) / 2 ? 3 : 5 }} />
      {/* Min thumb */}
      <div className="absolute pointer-events-none rounded-full"
        style={{ top: 4, left: `calc(${minPct}% - 8px)`, width: 16, height: 16, background: '#fff', border: '2px solid #006241', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', zIndex: 6 }} />
      {/* Max thumb */}
      <div className="absolute pointer-events-none rounded-full"
        style={{ top: 4, left: `calc(${maxPct}% - 8px)`, width: 16, height: 16, background: '#fff', border: '2px solid #006241', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', zIndex: 6 }} />
    </div>
  );
}

// ── FilterDrawer ──────────────────────────────────────────────────────────────

interface DrawerProps {
  open: boolean; onClose: () => void; onClear: () => void;
  stats: { total: number; male: number; female: number; urgent: number };
  contactLimit: number;
  idFilter: string; setIdFilter: (v: string) => void;
  gender: string; setGender: (v: string) => void;
  ageMin: number; setAgeMin: (v: number) => void;
  ageMax: number; setAgeMax: (v: number) => void;
  state: string; setState: (v: string) => void;
  community: string; setCommunity: (v: string) => void;
  education: string; setEducation: (v: string) => void;
  marital: string; setMarital: (v: string) => void;
  sort: string; setSort: (v: string) => void;
  remaining: number; resetLabel: string;
}

function CSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.05em] mb-1" style={{ color: '#A0A0A0' }}>{label}</p>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg px-2.5 py-2 text-xs border outline-none"
        style={{ borderColor: '#E0DBD6', background: '#FAF9F8', color: '#141413' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function FilterDrawer(props: DrawerProps) {
  const { open, onClose, onClear, stats, contactLimit,
    idFilter, setIdFilter, gender, setGender,
    ageMin, setAgeMin, ageMax, setAgeMax,
    state, setState, community, setCommunity,
    education, setEducation, marital, setMarital,
    sort, setSort, remaining, resetLabel } = props;

  const STAT_COLORS = ['#141413', '#006241', '#C0397A', '#CF4500'];

  return (
    <>
      {open && <div className="fixed inset-0 z-90" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />}
      <div className="fixed inset-x-0 bottom-0 z-100 transition-transform duration-300"
        style={{
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.15)',
          maxHeight: '88vh',
          overflowY: 'auto',
        }}>
        <div className="flex justify-center pt-2.5 pb-1 sticky top-0 bg-white z-10">
          <div className="w-8 h-1 rounded-full" style={{ background: '#D1CDC7' }} />
        </div>

        <div className="px-4 pb-6 pt-1">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold" style={{ color: '#141413' }}>Filters</h2>
            <button onClick={onClose} className="text-xs font-semibold" style={{ color: '#696969' }}>✕ Close</button>
          </div>

          {/* Stats — single row, plain, alternating colors */}
          <div className="flex mb-3" style={{ borderBottom: '1px solid #F0ECE8', paddingBottom: 10 }}>
            {[
              { label: 'Total',  value: stats.total },
              { label: 'Groom',  value: stats.male },
              { label: 'Bride',  value: stats.female },
              { label: 'Urgent', value: stats.urgent },
            ].map((s, i) => (
              <div key={s.label} className="flex-1 text-center"
                style={{ borderLeft: i > 0 ? '1px solid #F0ECE8' : 'none' }}>
                <strong className="block text-base font-extrabold leading-tight" style={{ color: STAT_COLORS[i] }}>
                  <CountUp to={s.value} duration={1.2} />
                </strong>
                <span className="text-[9px] font-medium uppercase tracking-wide" style={{ color: '#B0A8A0' }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Contact limit */}
          <div className="flex items-center justify-between mb-3 rounded-lg px-2.5 py-1.5"
            style={{ background: remaining <= 3 ? '#FFF3EE' : '#F7F5F3' }}>
            <span className="text-[11px] font-medium" style={{ color: remaining <= 3 ? '#CF4500' : '#696969' }}>
              {remaining}/{contactLimit} contacts left this hour
            </span>
            {resetLabel && <span className="text-[10px]" style={{ color: '#A0A0A0' }}>resets {resetLabel}</span>}
          </div>

          {/* Age Range — full width dual slider */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color: '#A0A0A0' }}>Age Range</p>
              <p className="text-[11px] font-semibold" style={{ color: '#006241' }}>{ageMin} – {ageMax}</p>
            </div>
            <DualRangeSlider valueMin={ageMin} valueMax={ageMax} onMin={setAgeMin} onMax={setAgeMax} />
          </div>

          {/* Gender chips — full width */}
          <div className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: '#A0A0A0' }}>Gender</p>
            <div className="flex gap-1.5">
              {[['all','All'],['female','Bride'],['male','Groom']].map(([v, l]) => (
                <button key={v} onClick={() => setGender(v)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                  style={{
                    background:  gender === v ? '#006241' : '#FAF9F8',
                    color:       gender === v ? '#fff' : '#696969',
                    borderColor: gender === v ? '#006241' : '#E0DBD6',
                  }}>{l}</button>
              ))}
            </div>
          </div>

          {/* 2-column grid for remaining fields */}
          <div className="grid grid-cols-2 gap-x-2.5 gap-y-2.5 mb-4">
            {/* Filter by ID */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] mb-1" style={{ color: '#A0A0A0' }}>Profile ID</p>
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={idFilter}
                onChange={e => setIdFilter(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 42"
                className="w-full rounded-lg px-2.5 py-2 text-xs border outline-none"
                style={{ borderColor: '#E0DBD6', background: '#FAF9F8', color: '#141413' }} />
            </div>
            <CSelect label="Sort" value={sort} onChange={setSort} options={SORT_OPTIONS} />
            <CSelect label="State / Location" value={state} onChange={setState} options={STATE_OPTIONS} />
            <CSelect label="Community" value={community} onChange={setCommunity} options={COMMUNITY_OPTIONS} />
            <CSelect label="Education" value={education} onChange={setEducation} options={EDUCATION_OPTIONS} />
            <CSelect label="Marital Status" value={marital} onChange={setMarital} options={MARITAL_OPTIONS} />
          </div>

          <div className="flex gap-2">
            <button onClick={onClear} className="flex-1 py-2.5 rounded-full text-xs font-semibold border"
              style={{ borderColor: '#D1CDC7', color: '#696969' }}>Clear all</button>
            <button onClick={onClose} className="flex-1 py-2.5 rounded-full text-xs font-bold"
              style={{ background: '#006241', color: '#fff' }}>Apply</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProfilesClient() {
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [idFilter,    setIdFilter]    = useState('');
  const [gender,      setGender]      = useState('all');
  const [urgentOnly,  setUrgentOnly]  = useState(false);
  const [education,   setEducation]   = useState('');
  const [marital,     setMarital]     = useState('');
  const [state,       setState]       = useState('');
  const [community,   setCommunity]   = useState('');
  const [ageMin,      setAgeMin]      = useState(18);
  const [ageMax,      setAgeMax]      = useState(60);
  const [sort,        setSort]        = useState('default');
  const [contact,     setContact]     = useState<DeckProfile | null>(null);
  const [biodata,     setBiodata]     = useState<DeckProfile | null>(null);
  const [drawerOpen,  setDrawerOpen]  = useState(false);
  const [authGate,    setAuthGate]    = useState(false);

  const { remaining, resetLabel, consume: consumeContact, canUse: canContact, isAnon } = useUsageLimit('contact');
  const contactLimit = isAnon ? USAGE_LIMITS.contact.anon : USAGE_LIMITS.contact.free;

  const handleContactRequest = useCallback(async (p: DeckProfile) => {
    const ok = await consumeContact();
    if (!ok) { setAuthGate(true); return; }
    setContact(p);
  }, [consumeContact]);

  useEffect(() => {
    fetch(WORKER_URL)
      .then(r => r.json())
      .then(data => setAllProfiles(Array.isArray(data) ? data : []))
      .catch(() => setAllProfiles([]))
      .finally(() => setLoading(false));
  }, []);

  const clearAll = useCallback(() => {
    setSearch(''); setIdFilter(''); setGender('all'); setUrgentOnly(false);
    setEducation(''); setMarital(''); setState(''); setCommunity('');
    setAgeMin(18); setAgeMax(60); setSort('default');
  }, []);

  const filtered = useMemo<DeckProfile[]>(() => {
    let list = allProfiles.map((p, i) => ({ ...p, _num: i + 1 }));
    if (gender !== 'all') list = list.filter(p => p.gender === gender);
    if (urgentOnly)  list = list.filter(p => isUrgent(p.body));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q));
    }
    if (idFilter) {
      const n = parseInt(idFilter, 10);
      if (!isNaN(n)) list = list.filter(p => p._num === n);
    }
    if (education) list = list.filter(p => matchesEdu(p.body, education));
    if (marital)   list = list.filter(p => matchesMarital(p.body, marital));
    if (state)     list = list.filter(p => matchesLocation(p.body, state));
    if (community) {
      const c = community.toLowerCase();
      list = list.filter(p => p.body.toLowerCase().includes(c));
    }
    if (ageMin > 18 || ageMax < 60) {
      list = list.filter(p => {
        const age = parseAge(p.body);
        if (!age) return true;
        return age >= ageMin && age <= ageMax;
      });
    }
    if (sort === 'urgent')  list = [...list].sort((a, b) => +isUrgent(b.body) - +isUrgent(a.body));
    if (sort === 'male')    list = [...list].sort((a, b) => +(a.gender !== 'male') - +(b.gender !== 'male'));
    if (sort === 'female')  list = [...list].sort((a, b) => +(a.gender !== 'female') - +(b.gender !== 'female'));
    return list;
  }, [allProfiles, search, idFilter, gender, urgentOnly, education, marital, state, community, ageMin, ageMax, sort]);

  const stats = useMemo(() => ({
    total:  filtered.length,
    male:   filtered.filter(p => p.gender === 'male').length,
    female: filtered.filter(p => p.gender === 'female').length,
    urgent: filtered.filter(p => isUrgent(p.body)).length,
  }), [filtered]);

  const activeFilterCount = [gender !== 'all', !!search, !!education, !!marital, sort !== 'default', urgentOnly, !!idFilter, !!state, !!community, ageMin > 18 || ageMax < 60].filter(Boolean).length;

  return (
    <div style={{ background: '#FFFFFF', minHeight: '100vh' }}>

      {/* Hero — minimal height, centered title */}
      <div style={{ background: '#1E3932', color: '#fff' }} className="px-4 sm:px-6 pt-4 pb-4">
        <div className="max-w-7xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.08em] mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Browse</p>
          <h1 className="font-extrabold tracking-[-0.03em] mb-4" style={{ fontSize: 'clamp(1.3rem,3.5vw,2rem)' }}>
            <GradientText colors={['#00C87A', '#ffffff', '#00A86B', '#ffffff']} animationSpeed={7} className="font-extrabold tracking-[-0.03em]">
              Verified Rishta Profiles
            </GradientText>
          </h1>

          {/* Desktop filters */}
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
            <select value={sort} onChange={e => setSort(e.target.value)}
              className="rounded-full px-4 py-2.5 text-sm font-medium border-0 outline-none"
              style={{ background: 'rgba(255,255,255,0.13)', color: '#fff' }}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ color: '#141413' }}>{o.label}</option>)}
            </select>
          </div>

          {/* Gender tabs (desktop) */}
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

      {/* Desktop stats strip */}
      <div className="hidden md:block border-b" style={{ borderColor: '#F0ECE8' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-5 divide-x" style={{ borderColor: '#F0ECE8' }}>
            {[
              { label: 'Total',  value: stats.total },
              { label: 'Groom',  value: stats.male },
              { label: 'Bride',  value: stats.female },
              { label: 'Urgent', value: stats.urgent },
              { label: `Contacts left (${contactLimit}/hr)`, value: remaining },
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

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 pb-24 md:pb-10">

        {/* Active filter chips */}
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
                "{search}" <button onClick={() => setSearch('')}>×</button>
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
                <button onClick={() => setMarital('')}>×</button>
              </span>
            )}
            <button onClick={clearAll} className="text-xs font-medium underline" style={{ color: '#696969' }}>Clear all</button>
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
        ) : filtered.length === 0 ? (
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
            <p className="text-sm font-medium mb-5" style={{ color: '#696969' }}>
              {filtered.length.toLocaleString()} profile{filtered.length !== 1 ? 's' : ''} found
            </p>

            {/* Mobile: swipe deck */}
            <div className="md:hidden">
              <SwipeDeck
                profiles={filtered}
                onContact={handleContactRequest}
                onBiodata={setBiodata}
                canContact={canContact}
                remaining={remaining}
                resetLabel={resetLabel}
                onLimitHit={isAnon ? () => setAuthGate(true) : undefined}
              />
            </div>

            {/* Desktop: grid */}
            <ClickSpark sparkColor="#00A86B" sparkRadius={28} sparkCount={10} duration={500} className="hidden md:block">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(p => (
                  <ProfileCard
                    key={p._num}
                    profile={p}
                    onContact={handleContactRequest}
                    onBiodata={setBiodata}
                    canContact={canContact}
                    remaining={remaining}
                    resetLabel={resetLabel}
                    onLimitHit={isAnon ? () => setAuthGate(true) : undefined}
                  />
                ))}
              </div>
            </ClickSpark>
          </>
        )}
      </div>

      {/* Mobile FAB */}
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

      {/* Filter drawer */}
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
        contactLimit={contactLimit}
        remaining={remaining}
        resetLabel={resetLabel}
      />

      {/* Contact modal */}
      {contact && (
        <ContactModal
          profile={contact} num={contact._num}
          onClose={() => setContact(null)}
          remaining={remaining}
          resetLabel={resetLabel}
          contactLimit={contactLimit}
        />
      )}

      {authGate && (
        <AuthModal
          feature="contact"
          onClose={() => setAuthGate(false)}
          onSuccess={() => setAuthGate(false)}
        />
      )}

      {/* Biodata modal */}
      {biodata && <BiodataModal profile={biodata} onClose={() => setBiodata(null)} />}
    </div>
  );
}
