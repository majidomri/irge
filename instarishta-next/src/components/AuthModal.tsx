'use client';
import { useState, useEffect, useRef } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import { signIn, phoneNumber as phoneAuth } from '@/lib/auth-client';
import {
  clearRecaptcha,
  confirmPhoneCode,
  humanizePhoneError,
  phoneSignInEnabled,
  sendPhoneOtp,
} from '@/lib/firebase-phone';
import GradientText from '@/components/ui/GradientText';

// Invisible reCAPTCHA mount point. Firebase needs a stable element id, and the
// widget must not be torn down by React between the send and the confirm — so
// the div is rendered for the whole life of the modal, not just the phone step.
const RECAPTCHA_ID = 'ir-phone-recaptcha';

/** Digits typed into the phone field, normalised to E.164 for India. */
function toE164(input: string): string | null {
  const raw = input.trim().replace(/[\s()-]/g, '');
  // Already international.
  if (raw.startsWith('+')) return /^\+[1-9]\d{7,14}$/.test(raw) ? raw : null;
  const digits = raw.replace(/\D/g, '');
  // Bare 10-digit Indian mobile, or the same with a 0 / 91 prefix.
  if (/^[6-9]\d{9}$/.test(digits))        return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits))       return `+91${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits))      return `+${digits}`;
  return null;
}

interface AuthModalProps {
  onClose:    () => void;
  onSuccess?: () => void;
  // Where to land after successful OAuth callback (server-side redirect target).
  redirectTo?: string;
  // Pre-filled error (e.g. an OAuth failure code read from the URL by the opener).
  initialError?: string;
}

type Mode = 'choose' | 'password' | 'magic' | 'phone' | 'otp';

// Humanize the error codes better-auth appends to the URL when an OAuth
// round-trip fails (see better-auth callback redirectOnError).
function humanizeAuthError(code: string): string {
  const map: Record<string, string> = {
    access_denied: 'Sign-in was cancelled.',
    oauth_provider_not_found: 'Google sign-in isn’t configured yet. Please try email instead.',
    unable_to_get_user_info: 'Could not read your Google profile. Please try again.',
    email_not_found: 'Your Google account has no email we can use.',
    invalid_code: 'Google sign-in expired. Please try again.',
    state_not_found: 'Sign-in session expired. Please try again.',
    "email_doesn't_match": 'That Google account’s email doesn’t match the account you’re linking.',
    account_already_linked_to_different_user: 'That Google account is already linked to a different user.',
    unable_to_link_account: 'Could not link your Google account. Please try again.',
  };
  return map[code] ?? 'Google sign-in failed. Please try again.';
}

export default function AuthModal({ onClose, onSuccess, redirectTo, initialError }: AuthModalProps) {
  const [mode,     setMode]     = useState<Mode>('choose');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState<'google' | 'email' | 'magic' | 'phone' | 'otp' | null>(null);
  // Seed from any OAuth-failure code the opener read off the URL (humanized).
  const [error,    setError]    = useState(initialError ? humanizeAuthError(initialError) : '');
  const [sent,     setSent]     = useState(false);

  // ── Phone sign-in state ────────────────────────────────────────────────────
  const [phone, setPhone] = useState('');
  const [otp,   setOtp]   = useState('');
  // The E.164 number the OTP was actually sent to — shown on the code screen and
  // posted to better-auth, so it can never drift from what the user retypes.
  const [phoneE164, setPhoneE164] = useState('');
  // Firebase's handle on the pending challenge. A ref, not state: replacing it
  // must not re-render, and a stale render must never confirm against an old one.
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Tear the reCAPTCHA widget down with the modal. Left alive it holds a spent
  // token, and the next open would fail its first send.
  useEffect(() => clearRecaptcha, []);

  const next = redirectTo ?? (typeof window !== 'undefined' ? window.location.pathname : '/');

  const handleGoogle = async () => {
    setError(''); setLoading('google');
    // On failure better-auth redirects to errorCallbackURL with ?error=<code>.
    // Send it back to this page with ?signin=1 so the modal re-opens and the
    // mount effect above can show the humanized error.
    const errorCallbackURL = `${next}${next.includes('?') ? '&' : '?'}signin=1`;
    const { error } = await signIn.social({ provider: 'google', callbackURL: next, errorCallbackURL });
    if (error) { setError(error.message ?? 'Google sign-in failed'); setLoading(null); }
    // On success the browser is being redirected to Google — no further work.
  };

  const handleEmailPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || password.length < 8) {
      setError('Enter a valid email and password (8+ chars).'); return;
    }
    setError(''); setLoading('email');
    const { error } = await signIn.email({ email, password, callbackURL: next });
    setLoading(null);
    if (error) { setError(error.message ?? 'Sign in failed'); return; }
    onSuccess?.(); onClose();
  };

  // ── Phone: step 1, send the SMS ────────────────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const e164 = toE164(phone);
    if (!e164) { setError('Enter a valid mobile number (e.g. 98765 43210).'); return; }
    setError(''); setLoading('phone');
    try {
      confirmationRef.current = await sendPhoneOtp(e164, RECAPTCHA_ID);
      setPhoneE164(e164);
      setOtp('');
      setMode('otp');
    } catch (err) {
      setError(humanizePhoneError(err));
    } finally {
      setLoading(null);
    }
  };

  // ── Phone: step 2, confirm the code, then exchange it for OUR session ──────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const confirmation = confirmationRef.current;
    if (!confirmation) { setError('That code expired. Please request a new one.'); setMode('phone'); return; }
    if (!/^\d{6}$/.test(otp)) { setError('Enter the 6-digit code from the SMS.'); return; }

    setError(''); setLoading('otp');
    try {
      // Firebase checks the code and gives us a signed ID token proving the
      // number. better-auth's phoneNumber plugin takes that token in the `code`
      // field, verifies its signature server-side, and sets our session cookie.
      const idToken = await confirmPhoneCode(confirmation, otp);
      const { error } = await phoneAuth.verify({ phoneNumber: phoneE164, code: idToken });
      if (error) {
        setError(error.message ?? 'Could not sign you in. Please try again.');
        return;
      }
      confirmationRef.current = null;
      clearRecaptcha();
      onSuccess?.(); onClose();
      // The session cookie is set but nothing on the page knows yet; a reload is
      // the same thing the OAuth callback does, and keeps SSR'd pages honest.
      if (typeof window !== 'undefined') window.location.assign(next);
    } catch (err) {
      setError(humanizePhoneError(err));
    } finally {
      setLoading(null);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) { setError('Enter a valid email.'); return; }
    setError(''); setLoading('magic');
    const { error } = await signIn.magicLink({ email, callbackURL: next });
    setLoading(null);
    if (error) { setError(error.message ?? 'Could not send link'); return; }
    setSent(true);
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)' }}
        onClick={onClose}
      />
      <section
        className="relative w-full sm:max-w-[420px] rounded-t-[28px] sm:rounded-[28px] overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #0f2419 0%, #0a1a10 100%)',
          border: '1px solid rgba(0,168,107,0.18)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
      >
        <div className="flex justify-center pt-3 pb-0 sm:hidden">
          <div className="w-10 h-[5px] rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>

        <div className="px-7 pb-9 pt-5">

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
                Expires in 5 minutes · click it to sign in instantly
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
              <div className="mb-5">
                <h2 className="text-[1.5rem] font-extrabold leading-tight mb-1.5">
                  <GradientText
                    colors={['#00C87A', '#ffffff', '#00A86B', '#ffffff']}
                    animationSpeed={5}
                    className="font-extrabold"
                  >
                    {mode === 'password' ? 'Sign in with password'
                      : mode === 'magic' ? 'Sign in by email'
                      : mode === 'phone' ? 'Sign in with your mobile'
                      : mode === 'otp'   ? 'Enter the code'
                      : 'Welcome back'}
                  </GradientText>
                </h2>
                <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {mode === 'choose' && 'Pick a sign-in method below.'}
                  {mode === 'password' && 'Use your account email and password.'}
                  {mode === 'magic' && 'We will email you a one-time link. No password needed.'}
                  {mode === 'phone' && 'We will text you a 6-digit code. No password needed.'}
                  {mode === 'otp' && `Sent by SMS to ${phoneE164}.`}
                </p>
              </div>

              {mode === 'choose' && (
                <>
                  <button
                    onClick={handleGoogle}
                    disabled={loading === 'google'}
                    className="w-full flex items-center justify-center gap-3 rounded-full py-[13px] font-semibold text-sm mb-3 transition-all hover:shadow-lg disabled:opacity-60"
                    style={{ background: '#fff', color: '#1a1a1a', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
                  >
                    {loading === 'google' ? (
                      <span className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                    )}
                    {loading === 'google' ? 'Redirecting…' : 'Continue with Google'}
                  </button>

                  {/* Hidden entirely when the Firebase env is absent, rather than
                      offering a button that can only fail. */}
                  {phoneSignInEnabled && (
                    <button
                      onClick={() => { setMode('phone'); setError(''); }}
                      className="w-full rounded-full py-[13px] font-semibold text-sm mb-3 hover:opacity-90 transition-opacity"
                      style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }}
                    >
                      📱  Continue with mobile number
                    </button>
                  )}

                  <button
                    onClick={() => { setMode('magic'); setError(''); }}
                    className="w-full rounded-full py-[13px] font-semibold text-sm mb-3 hover:opacity-90 transition-opacity"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }}
                  >
                    ✉  Email me a sign-in link
                  </button>

                  <button
                    onClick={() => { setMode('password'); setError(''); }}
                    className="w-full text-xs text-center font-medium hover:opacity-80"
                    style={{ color: 'rgba(255,255,255,0.45)' }}
                  >
                    Or sign in with email + password
                  </button>
                </>
              )}

              {mode === 'password' && (
                <form onSubmit={handleEmailPassword} className="flex flex-col gap-3">
                  <input
                    type="email" autoComplete="email" required
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="Email" autoFocus
                    className="w-full rounded-xl px-4 py-3.5 text-sm outline-none"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  <input
                    type="password" autoComplete="current-password" required
                    value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full rounded-xl px-4 py-3.5 text-sm outline-none"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  {error && <p className="text-xs px-1" style={{ color: '#FF8080' }}>{error}</p>}
                  <button
                    type="submit" disabled={loading === 'email'}
                    className="w-full rounded-full py-[13px] font-bold text-sm transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #00A86B, #006241)', color: '#fff' }}
                  >
                    {loading === 'email' ? 'Signing in…' : 'Sign in'}
                  </button>
                  <button
                    type="button" onClick={() => { setMode('choose'); setError(''); }}
                    className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}
                  >
                    ← Other sign-in methods
                  </button>
                </form>
              )}

              {mode === 'phone' && (
                <form onSubmit={handleSendOtp} className="flex flex-col gap-3">
                  <div
                    className="w-full flex items-center rounded-xl px-4 text-sm"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <span className="font-semibold pr-2" style={{ color: 'rgba(255,255,255,0.55)' }}>+91</span>
                    <input
                      type="tel" inputMode="numeric" autoComplete="tel" required autoFocus
                      value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="98765 43210" maxLength={16}
                      className="flex-1 bg-transparent py-3.5 outline-none"
                      style={{ color: '#fff' }}
                    />
                  </div>
                  {error && <p className="text-xs px-1" style={{ color: '#FF8080' }}>{error}</p>}
                  <button
                    type="submit" disabled={loading === 'phone'}
                    className="w-full rounded-full py-[13px] font-bold text-sm transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #00A86B, #006241)', color: '#fff' }}
                  >
                    {loading === 'phone' ? 'Sending code…' : 'Send code'}
                  </button>
                  <button
                    type="button" onClick={() => { setMode('choose'); setError(''); clearRecaptcha(); }}
                    className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}
                  >
                    ← Other sign-in methods
                  </button>
                </form>
              )}

              {mode === 'otp' && (
                <form onSubmit={handleVerifyOtp} className="flex flex-col gap-3">
                  <input
                    type="text" inputMode="numeric" autoComplete="one-time-code"
                    pattern="\d{6}" maxLength={6} required autoFocus
                    value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                    className="w-full rounded-xl px-4 py-3.5 text-center text-lg font-bold tracking-[0.5em] outline-none"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  {error && <p className="text-xs px-1" style={{ color: '#FF8080' }}>{error}</p>}
                  <button
                    type="submit" disabled={loading === 'otp'}
                    className="w-full rounded-full py-[13px] font-bold text-sm transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #00A86B, #006241)', color: '#fff' }}
                  >
                    {loading === 'otp' ? 'Verifying…' : 'Verify & sign in'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode('phone'); setError(''); setOtp(''); confirmationRef.current = null; clearRecaptcha(); }}
                    className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}
                  >
                    ← Use a different number
                  </button>
                </form>
              )}

              {mode === 'magic' && (
                <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
                  <input
                    type="email" autoComplete="email" required
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="Email" autoFocus
                    className="w-full rounded-xl px-4 py-3.5 text-sm outline-none"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  {error && <p className="text-xs px-1" style={{ color: '#FF8080' }}>{error}</p>}
                  <button
                    type="submit" disabled={loading === 'magic'}
                    className="w-full rounded-full py-[13px] font-bold text-sm transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #00A86B, #006241)', color: '#fff' }}
                  >
                    {loading === 'magic' ? 'Sending…' : 'Send magic link'}
                  </button>
                  <button
                    type="button" onClick={() => { setMode('choose'); setError(''); }}
                    className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}
                  >
                    ← Other sign-in methods
                  </button>
                </form>
              )}

              <p className="text-center text-[10px] mt-4" style={{ color: 'rgba(255,255,255,0.2)' }}>
                Free forever · No credit card · Family-first matchmaking
              </p>
            </>
          )}
        </div>
        {/* Invisible reCAPTCHA mounts here. Rendered for the whole life of the
            modal — not just the phone step — because Firebase binds the widget
            to this element when the code is sent and still needs it alive while
            the user is typing the code on the next screen. */}
        <div id={RECAPTCHA_ID} />
      </section>
    </div>
  );
}
