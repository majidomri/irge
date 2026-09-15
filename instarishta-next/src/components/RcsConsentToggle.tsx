'use client';
/**
 * The member's marketing opt-in.
 *
 * This is the ONLY thing that can grant or withdraw it — there is no admin
 * control, by design. A consent flag an operator can tick is not consent, and
 * under TRAI's regime the penalty for messaging without it lands on the sender.
 *
 * Off by default, and it says plainly what it does and that it can be undone.
 * A pre-ticked box is not consent either, which is why nothing here starts on.
 *
 * Consent is for a number (migration 037), so the switch names the number it
 * applies to, and cannot be turned on until there is a verified one. Before
 * this it could be switched on by members with no phone at all — a "yes" that
 * could never reach them and was attached to nothing.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ENTITY } from '@/lib/entity';

type State = {
  consent: boolean;
  since: string | null;
  phone: string | null;
  phoneVerified: boolean;
};

/** "+919876543210" → "+91 98765 43210". Display only. */
function pretty(phone: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

export default function RcsConsentToggle({ refreshKey }: {
  /**
   * Changes whenever the linked number might have — the account page passes
   * the phone it knows about, so linking a number re-reads this switch instead
   * of leaving it saying "verify your number first".
   */
  refreshKey?: string;
}) {
  const [state, setState]   = useState<State | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/rcs-consent', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json() as Partial<State>;
      setState({
        consent:       data.consent ?? false,
        since:         data.since ?? null,
        phone:         data.phone ?? null,
        phoneVerified: data.phoneVerified ?? false,
      });
      setFailed(false);
    } catch {
      // Say so, rather than render nothing. An opt-in that silently vanishes
      // when its request fails is indistinguishable from one that isn't there.
      setFailed(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const canTurnOn = Boolean(state?.phone && state.phoneVerified);

  const toggle = async () => {
    if (busy || !state) return;
    const next = !state.consent;
    if (next && !canTurnOn) return;
    setBusy(true); setError('');
    // Optimistic, then reconciled: this is a preference, and a switch that
    // waits on a round trip before moving feels broken on a slow connection.
    setState({ ...state, consent: next, since: next ? new Date().toISOString() : null });
    try {
      const res = await fetch('/api/account/rcs-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? 'Could not save. Please try again.');
        await load();
      }
    } catch {
      setError('Could not save. Please check your connection and try again.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (failed) {
    return (
      <div
        className="w-full rounded-2xl px-4 py-3.5 mb-3 text-left"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <p className="text-sm font-semibold text-white">New rishta alerts</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Couldn&apos;t load your alert setting.{' '}
          <button onClick={() => void load()} className="underline" style={{ color: '#7ee2b8' }}>Retry</button>
        </p>
      </div>
    );
  }

  // Nothing until the real answer arrives. Rendering an "off" switch that flips
  // to "on" a moment later would look like the site changed it.
  if (!state) return null;

  const on = state.consent;
  const locked = !on && !canTurnOn;

  let status: string;
  if (on) {
    const date = state.since
      ? new Date(state.since).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'just now';
    status = `On since ${date} for ${state.phone ? pretty(state.phone) : 'your number'} — tap to turn off.`;
  } else if (locked) {
    status = 'Verify your mobile number above to turn on alerts.';
  } else {
    status = `Off — tap to receive alerts on ${pretty(state.phone as string)}.`;
  }

  return (
    <div className="mb-3">
      <button
        onClick={toggle}
        disabled={busy || locked}
        role="switch"
        aria-checked={on}
        className="w-full flex items-center justify-between rounded-2xl px-4 py-3.5 text-left transition-all hover:bg-white/[0.08] disabled:cursor-not-allowed"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', opacity: busy || locked ? 0.6 : 1 }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg">📩</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">New rishta alerts</p>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{status}</p>
          </div>
        </div>

        {/* A switch rather than a checkbox: the state has to be readable at a
            glance, because the whole point is that the member knows it is on. */}
        <span
          aria-hidden
          className="shrink-0 ml-3 rounded-full transition-colors"
          style={{
            width: 40, height: 22, padding: 3, display: 'inline-flex',
            justifyContent: on ? 'flex-end' : 'flex-start',
            background: on ? '#00A86B' : 'rgba(255,255,255,0.15)',
          }}
        >
          <span style={{ width: 16, height: 16, borderRadius: 999, background: '#fff' }} />
        </span>
      </button>

      {error && (
        <p className="text-[11px] mt-2 px-1" style={{ color: '#ff8a8a' }}>{error}</p>
      )}

      {/* What the member is agreeing to, at the point of agreeing. TRAI requires
          the sender to be identifiable here, and RCS verification checks it.
          Mirrors /alerts, which is the public version of this text. */}
      <p className="text-[11px] leading-relaxed mt-2 px-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
        Promotional alerts about new biodatas and your account, sent by {ENTITY.legalName} over RCS,
        SMS or WhatsApp between 9 AM and 9 PM. Turn off here any time, or reply STOP to any alert.{' '}
        <Link href="/alerts" className="underline" style={{ color: 'rgba(255,255,255,0.55)' }}>How alerts work</Link>
      </p>
    </div>
  );
}
