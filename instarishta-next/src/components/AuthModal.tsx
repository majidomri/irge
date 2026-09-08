'use client';
/**
 * Sign-in modal: Google, or email + password. Nothing else, on purpose.
 *
 * ── Why no "Continue with mobile number" ─────────────────────────────────────
 * Phone is a credential you LINK to an account, never one you sign up with.
 *
 * When it was offered here it created a second, empty account for anyone who
 * already had a Google login: the phone path finds-or-creates by number and
 * cannot know the person already exists, because better-auth links accounts by
 * email and a phone signup has only a synthetic one. Worse, that new account
 * then owned the number, so the correct path afterwards — sign in with Google,
 * link on /account — failed forever with PHONE_NUMBER_EXIST. One tap on the
 * first screen permanently orphaned a member from their own credits.
 *
 * absorbEmptyPhoneAccount() in src/lib/auth.ts repairs that damage where it
 * already happened. Removing the entry point is what stops it recurring: with
 * no way to sign up by phone, one person cannot become two accounts. The number
 * is collected right after signup instead (PhoneNudge → /account → PhoneLink),
 * so the two identities are joined from the start.
 *
 * The cost is real and accepted: someone with no email address can no longer
 * register. Phone-only signup was the original reason for Firebase Auth, and
 * this trades it for one-person-one-account.
 *
 * ── Why no magic link ────────────────────────────────────────────────────────
 * Removed at the owner's request — outbound email is not reliably delivering.
 * The `magicLink` plugin is still mounted server-side in src/lib/auth.ts, so
 * restoring this is a UI change only, once sending is trustworthy again.
 */
import { useState, useEffect } from 'react';
import { signIn } from '@/lib/auth-client';
import GradientText from '@/components/ui/GradientText';

interface AuthModalProps {
  onClose:    () => void;
  onSuccess?: () => void;
  // Where to land after successful OAuth callback (server-side redirect target).
  redirectTo?: string;
  // Pre-filled error (e.g. an OAuth failure code read from the URL by the opener).
  initialError?: string;
}

type Mode = 'choose' | 'password';

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
  const [loading,  setLoading]  = useState<'google' | 'email' | null>(null);
  // Seed from any OAuth-failure code the opener read off the URL (humanized).
  const [error,    setError]    = useState(initialError ? humanizeAuthError(initialError) : '');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

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

          <div className="mb-5">
            <h2 className="text-[1.5rem] font-extrabold leading-tight mb-1.5">
              <GradientText
                colors={['#00C87A', '#ffffff', '#00A86B', '#ffffff']}
                animationSpeed={5}
                className="font-extrabold"
              >
                {mode === 'password' ? 'Sign in with password' : 'Welcome back'}
              </GradientText>
            </h2>
            <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {mode === 'choose' && 'Continue with Google — it takes a second.'}
              {mode === 'password' && 'Use your account email and password.'}
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

              {/* Sets the expectation up front: the number is asked for AFTER
                  sign-in, on /account, so it attaches to this one account. */}
              <p className="text-[11px] text-center mb-3 leading-relaxed" style={{ color: 'rgba(255,255,255,0.32)' }}>
                You can add your mobile number after signing in.
              </p>

              <button
                onClick={() => { setMode('password'); setError(''); }}
                className="w-full text-xs text-center font-medium hover:opacity-80"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                Or sign in with email + password
              </button>

              {error && <p className="text-xs px-1 mt-3 text-center" style={{ color: '#FF8080' }}>{error}</p>}
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

          <p className="text-center text-[10px] mt-4" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Free forever · No credit card · Family-first matchmaking
          </p>
        </div>
      </section>
    </div>
  );
}
