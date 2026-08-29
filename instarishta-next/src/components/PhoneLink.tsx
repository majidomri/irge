'use client';
/**
 * Link a mobile number to the signed-in account — the user-end form.
 *
 * Same Firebase round-trip as signing in by phone (src/lib/firebase-phone.ts),
 * but posted with `updatePhoneNumber: true`, which makes better-auth attach the
 * verified number to the CURRENT session's user instead of finding-or-creating
 * one by number. That is what joins a Google/email account to a phone.
 *
 * Rendered in two places, one component so the flow cannot drift:
 *   • /account — always, as the member's own settings card
 *   • the deck — in a modal, when a paid member hits the credit gate
 *
 * There is no "unlink" and no "change number" once verified. Both would be a
 * one-click way out of the gate that credits are locked behind, and neither is
 * something a member should self-serve on a matrimony account. Admin can clear
 * the column in /nizam if someone genuinely changes their number.
 */
import { useState, useRef, useEffect } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import { phoneNumber as phoneAuth } from '@/lib/auth-client';
import {
  clearRecaptcha,
  confirmPhoneCode,
  humanizePhoneError,
  phoneSignInEnabled,
  sendPhoneOtp,
} from '@/lib/firebase-phone';

/**
 * Distinct from the sign-in modal's container id. Both can exist in one page
 * (the deck renders AuthModal and this card), and two reCAPTCHA widgets sharing
 * an element id is an immediate `auth/captcha-check-failed`.
 */
const RECAPTCHA_ID = 'ir-phone-link-recaptcha';

/** Typed digits → E.164, assuming India when no country code is given. */
function toE164(input: string): string | null {
  const raw = input.trim().replace(/[\s()-]/g, '');
  if (raw.startsWith('+')) return /^\+[1-9]\d{7,14}$/.test(raw) ? raw : null;
  const digits = raw.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits))   return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits))  return `+91${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

export interface PhoneLinkProps {
  /** The number already on the account, if any. */
  current?: string | null;
  /** Whether that number is verified. A verified card is a receipt, not a form. */
  verified?: boolean;
  /**
   * True when credits are actually locked behind this right now (a paid member
   * with no verified number). Drives the urgent copy — otherwise the card reads
   * as an ordinary, optional security setting.
   */
  locked?: boolean;
  /** Called after a successful link so the parent can refetch credits. */
  onLinked?: () => void;
  /** Hide the section heading when the parent already provides one. */
  bare?: boolean;
}

export default function PhoneLink({
  current, verified, locked, onLinked, bare,
}: PhoneLinkProps) {
  const [step,  setStep]  = useState<'idle' | 'code'>('idle');
  const [phone, setPhone] = useState('');
  const [otp,   setOtp]   = useState('');
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');
  const [done,  setDone]  = useState(false);
  // The E.164 form the SMS actually went to — never re-derived from the input,
  // which the user can still edit while the code screen is up.
  const [sentTo, setSentTo] = useState('');
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  // The widget holds a single-use token; leaving it alive across unmounts makes
  // the next send fail with auth/invalid-app-credential.
  useEffect(() => clearRecaptcha, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const e164 = toE164(phone);
    if (!e164) { setError('Enter a valid mobile number (e.g. 98765 43210).'); return; }
    setError(''); setBusy(true);
    try {
      confirmationRef.current = await sendPhoneOtp(e164, RECAPTCHA_ID);
      setSentTo(e164);
      setOtp('');
      setStep('code');
    } catch (err) {
      setError(humanizePhoneError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const confirmation = confirmationRef.current;
    if (!confirmation) { setError('That code expired. Please start again.'); setStep('idle'); return; }
    if (!/^\d{6}$/.test(otp)) { setError('Enter the 6-digit code from the SMS.'); return; }

    setError(''); setBusy(true);
    try {
      const idToken = await confirmPhoneCode(confirmation, otp);
      // updatePhoneNumber:true — attach to the signed-in user rather than
      // signing in as the number. better-auth refuses if the number already
      // belongs to another account, which is the collision we want surfaced.
      const { error: apiError } = await phoneAuth.verify({
        phoneNumber:       sentTo,
        code:              idToken,
        updatePhoneNumber: true,
      });
      if (apiError) {
        setError(
          apiError.code === 'PHONE_NUMBER_EXIST'
            ? 'That number is already linked to another InstaRishta account.'
            : apiError.message ?? 'Could not link this number. Please try again.',
        );
        return;
      }
      confirmationRef.current = null;
      clearRecaptcha();
      setDone(true);
      onLinked?.();
    } catch (err) {
      setError(humanizePhoneError(err));
    } finally {
      setBusy(false);
    }
  }

  // Nothing to offer when the project has no Firebase config — better a missing
  // card than a form that can only fail. (The server gate stays off too: with
  // FIREBASE_PROJECT_ID unset nobody can verify, so nobody is blocked.)
  if (!phoneSignInEnabled) return null;

  const isVerified = verified || done;

  return (
    <div className="mb-6">
      {!bare && (
        <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Mobile number
        </p>
      )}

      <div
        className="rounded-2xl p-4"
        style={
          isVerified
            ? { background: 'rgba(0,168,107,0.10)', border: '1px solid rgba(0,168,107,0.22)' }
            : locked
              ? { background: 'rgba(255,176,32,0.10)', border: '1px solid rgba(255,176,32,0.30)' }
              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }
        }
      >
        {isVerified ? (
          <div className="flex items-center gap-3">
            <span className="text-lg">✅</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">
                {sentTo || current || 'Mobile verified'}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Verified — your credits are unlocked.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 mb-3.5">
              <span className="text-lg leading-none mt-0.5">{locked ? '🔒' : '📱'}</span>
              <div>
                <p className="text-sm font-semibold text-white">
                  {locked ? 'Verify your mobile to unlock your credits' : 'Add your mobile number'}
                </p>
                <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {locked
                    ? 'Your credits are safe in your account. One SMS and they are ready to spend.'
                    : 'Required once you subscribe, so families can reach you about your rishta.'}
                </p>
              </div>
            </div>

            {step === 'idle' ? (
              <form onSubmit={handleSend} className="flex flex-col gap-2.5">
                <div
                  className="w-full flex items-center rounded-xl px-3.5 text-sm"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <span className="font-semibold pr-2" style={{ color: 'rgba(255,255,255,0.55)' }}>+91</span>
                  <input
                    type="tel" inputMode="numeric" autoComplete="tel" required
                    value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="98765 43210" maxLength={16}
                    className="flex-1 bg-transparent py-3 outline-none"
                    style={{ color: '#fff' }}
                  />
                </div>
                {error && <p className="text-xs px-1" style={{ color: '#FF8080' }}>{error}</p>}
                <button
                  type="submit" disabled={busy}
                  className="w-full rounded-full py-3 font-bold text-sm transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #00A86B, #006241)', color: '#fff' }}
                >
                  {busy ? 'Sending code…' : 'Send code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="flex flex-col gap-2.5">
                <p className="text-[11px] px-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Code sent by SMS to {sentTo}
                </p>
                <input
                  type="text" inputMode="numeric" autoComplete="one-time-code"
                  pattern="\d{6}" maxLength={6} required autoFocus
                  value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  className="w-full rounded-xl px-4 py-3 text-center text-lg font-bold tracking-[0.5em] outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                {error && <p className="text-xs px-1" style={{ color: '#FF8080' }}>{error}</p>}
                <button
                  type="submit" disabled={busy}
                  className="w-full rounded-full py-3 font-bold text-sm transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #00A86B, #006241)', color: '#fff' }}
                >
                  {busy ? 'Verifying…' : 'Verify & unlock'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep('idle'); setError(''); setOtp('');
                    confirmationRef.current = null; clearRecaptcha();
                  }}
                  className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}
                >
                  ← Use a different number
                </button>
              </form>
            )}
          </>
        )}

        {/* Invisible reCAPTCHA. Mounted for the card's whole life — Firebase
            binds to this element on send and still needs it during the code
            step. */}
        <div id={RECAPTCHA_ID} />
      </div>
    </div>
  );
}
