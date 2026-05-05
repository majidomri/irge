'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { USAGE_LIMITS, type UsageFeature } from '@/lib/auth-client';
import GradientText from '@/components/ui/GradientText';

interface AuthModalProps {
  feature: UsageFeature;
  onClose: () => void;
  onSuccess?: () => void;
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

const FEATURE_LABEL: Record<UsageFeature, string> = {
  contact: 'profile contacts',
  audio:   'audio plays',
  view:    'profile views',
};

export default function AuthModal({ feature, onClose, onSuccess }: AuthModalProps) {
  const { signInWithGoogleOneTap, signInWithEmail } = useAuth();

  const [email,         setEmail]         = useState('');
  const [sent,          setSent]          = useState(false);
  const [loadingEmail,  setLoadingEmail]  = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [googleReady,   setGoogleReady]   = useState(false);
  const [error,         setError]         = useState('');

  const initedRef = useRef(false);
  const nonceRef  = useRef('');
  const limits       = USAGE_LIMITS[feature];
  const featureLabel = FEATURE_LABEL[feature];
  const freeLimit    = limits.free < 0 ? 'Unlimited' : String(limits.free);

  /* ── Lock body scroll ───────────────────────────────────────────────────── */
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  /* ── Google One Tap ─────────────────────────────────────────────────────── */
  const handleGoogleCredential = useCallback(async (credential: string) => {
    setLoadingGoogle(true);
    setError('');
    const result = await signInWithGoogleOneTap(credential, nonceRef.current);
    setLoadingGoogle(false);
    if (result.error) {
      setError(
        result.error.toLowerCase().includes('provider')
          ? 'Google sign-in is not enabled in the dashboard yet.'
          : result.error
      );
    } else {
      onSuccess?.();
      onClose();
    }
  }, [signInWithGoogleOneTap, onSuccess, onClose]);

  const initOneTap = useCallback(async () => {
    if (initedRef.current || !GOOGLE_CLIENT_ID || !window.google?.accounts?.id) return;
    initedRef.current = true;

    // Generate nonce: Google gets SHA-256 hex (embeds in JWT), Supabase gets raw (hashes to verify)
    const rawNonce = crypto.randomUUID();
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawNonce));
    const hashedNonce = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    nonceRef.current = rawNonce;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce: hashedNonce,
      callback: (res) => handleGoogleCredential(res.credential),
      cancel_on_tap_outside: false,
      context: 'signin',
    });
    setGoogleReady(true);
    window.google.accounts.id.prompt();
  }, [handleGoogleCredential]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    if (window.google?.accounts?.id) {
      initOneTap();
      return;
    }

    const existing = document.getElementById('gsi-script');
    if (existing) {
      existing.addEventListener('load', initOneTap);
      return () => existing.removeEventListener('load', initOneTap);
    }

    const script = document.createElement('script');
    script.id  = 'gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initOneTap;
    document.head.appendChild(script);

    return () => { window.google?.accounts.id.cancel(); };
  }, [initOneTap]);

  /* ── Email magic link ───────────────────────────────────────────────────── */
  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) { setError('Enter a valid email address'); return; }
    setLoadingEmail(true);
    setError('');
    const result = await signInWithEmail(email, window.location.pathname);
    setLoadingEmail(false);
    if (result.error) setError(result.error);
    else setSent(true);
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center">

      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <section
        className="relative w-full sm:max-w-[420px] rounded-t-[28px] sm:rounded-[28px] overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #0f2419 0%, #0a1a10 100%)',
          border: '1px solid rgba(0,168,107,0.18)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          zIndex: 1,
        }}
      >
        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 pb-0 sm:hidden">
          <div className="w-10 h-[5px] rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>

        <div className="px-7 pb-9 pt-5">

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>

          {/* ── Sent state ── */}
          {sent ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{ background: 'rgba(0,168,107,0.15)', border: '1.5px solid rgba(0,168,107,0.3)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00A86B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <h2 className="text-xl font-extrabold text-white mb-2">Check your inbox</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                We sent a sign-in link to
              </p>
              <p className="text-sm font-semibold text-white mt-0.5">{email}</p>
              <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Expires in 60 min · click it to sign in instantly
              </p>
              <button
                onClick={onClose}
                className="mt-7 w-full rounded-full py-3 text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: 'rgba(0,168,107,0.15)', color: '#00A86B', border: '1px solid rgba(0,168,107,0.25)' }}
              >
                Got it
              </button>
            </div>

          ) : (
            <>
              {/* ── Header ── */}
              <div className="mb-5">
                <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 mb-3"
                  style={{ background: 'rgba(0,168,107,0.12)', border: '1px solid rgba(0,168,107,0.2)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: '#00C87A' }}>
                    Free account
                  </span>
                </div>

                <h2 className="text-[1.6rem] font-extrabold leading-tight mb-2">
                  <GradientText
                    colors={['#00C87A', '#ffffff', '#00A86B', '#ffffff']}
                    animationSpeed={5}
                    className="font-extrabold"
                  >
                    {limits.free < 0
                      ? `Unlimited ${featureLabel}`
                      : `Unlock ${freeLimit} ${featureLabel}/hr`}
                  </GradientText>
                </h2>
                <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  You&apos;ve used your {limits.anon} free {featureLabel} this hour.
                  {limits.free < 0
                    ? ' Sign in for unlimited access — free forever.'
                    : <> Sign in to get <strong className="text-white font-semibold">{freeLimit}×</strong> more — free forever.</>}
                </p>
              </div>

              {/* ── Perks ── */}
              <div className="grid grid-cols-2 gap-2 mb-6">
                {[
                  { icon: '💍', text: `${USAGE_LIMITS.contact.free} contacts/hr` },
                  { icon: '🎙️', text: `${USAGE_LIMITS.audio.free} audio plays/hr` },
                  { icon: '📋', text: 'Browse all profiles' },
                  { icon: '🔒', text: 'No password needed' },
                ].map(({ icon, text }) => (
                  <div key={text}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="text-[15px] shrink-0">{icon}</span>
                    <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.65)' }}>{text}</span>
                  </div>
                ))}
              </div>

              {/* ── Google One Tap button ── */}
              {GOOGLE_CLIENT_ID && (
                <button
                  onClick={() => { setError(''); window.google?.accounts.id.prompt(); }}
                  disabled={loadingGoogle || !googleReady}
                  className="w-full flex items-center justify-center gap-3 rounded-full py-[13px] font-semibold text-sm mb-3 transition-all hover:shadow-lg disabled:opacity-60"
                  style={{
                    background: googleReady ? '#ffffff' : 'rgba(255,255,255,0.85)',
                    color: '#1a1a1a',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                  }}
                >
                  {loadingGoogle ? (
                    <span className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                  ) : !googleReady ? (
                    <span className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-400 animate-spin" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  )}
                  {loadingGoogle ? 'Signing in…' : !googleReady ? 'Loading Google…' : 'Continue with Google'}
                </button>
              )}

              {/* ── OR divider ── */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
                <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.2)' }}>OR</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
              </div>

              {/* ── Email magic link ── */}
              <form onSubmit={handleEmail} className="flex flex-col gap-3">
                <div className="relative">
                  <svg
                    className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                    width="15" height="15" viewBox="0 0 24 24" fill="none"
                    stroke="rgba(255,255,255,0.3)" strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    placeholder="Enter your email"
                    className="w-full rounded-xl pl-10 pr-4 py-3.5 text-sm outline-none transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      color: '#ffffff',
                      border: error ? '1px solid rgba(255,107,107,0.5)' : '1px solid rgba(255,255,255,0.1)',
                    }}
                    autoFocus={!GOOGLE_CLIENT_ID}
                  />
                </div>

                {error && (
                  <p className="text-xs flex items-center gap-1.5 px-1" style={{ color: '#FF8080' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loadingEmail || !email}
                  className="w-full rounded-full py-[13px] font-bold text-sm transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #00A86B, #006241)', color: '#fff' }}
                >
                  {loadingEmail ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                      </svg>
                      Send magic link
                    </>
                  )}
                </button>

                <p className="text-center text-[10px]" style={{ color: 'rgba(255,255,255,0.18)' }}>
                  Free forever · No password · No credit card
                </p>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
