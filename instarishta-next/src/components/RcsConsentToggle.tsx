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
 */
import { useCallback, useEffect, useState } from 'react';

export default function RcsConsentToggle() {
  const [consent, setConsent] = useState<boolean | null>(null);   // null = still loading
  const [busy, setBusy]       = useState(false);
  const [since, setSince]     = useState<string | null>(null);

  const fetchConsent = useCallback(async () => {
    const res = await fetch('/api/account/rcs-consent');
    if (!res.ok) return null;
    return await res.json() as { consent?: boolean; since?: string | null };
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const data = await fetchConsent();
        if (!live || !data) return;
        setConsent(data.consent ?? false);
        setSince(data.since ?? null);
      } catch { /* leave it loading rather than claim a state we do not know */ }
    })();
    return () => { live = false; };
  }, [fetchConsent]);

  const toggle = async () => {
    if (busy || consent === null) return;
    const next = !consent;
    setBusy(true);
    // Optimistic, then reconciled: this is a preference, and a switch that
    // waits on a round trip before moving feels broken on a slow connection.
    setConsent(next);
    try {
      const res = await fetch('/api/account/rcs-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: next }),
      });
      if (!res.ok) { setConsent(!next); return; }
      setSince(next ? new Date().toISOString() : null);
    } catch {
      setConsent(!next);
    } finally {
      setBusy(false);
    }
  };

  // Nothing at all until the real answer arrives. Rendering an "off" switch
  // that flips to "on" a moment later would look like the site changed it.
  if (consent === null) return null;

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className="w-full flex items-center justify-between rounded-2xl px-4 py-3.5 mb-3 text-left transition-all hover:bg-white/[0.08]"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', opacity: busy ? 0.6 : 1 }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-lg">📩</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">New rishta alerts</p>
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {consent
              ? `On since ${since ? new Date(since).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'just now'} — tap to turn off.`
              : 'Off — we will only message you about your own account.'}
          </p>
        </div>
      </div>

      {/* A switch rather than a checkbox: the state has to be readable at a
          glance, because the whole point is that the member knows it is on. */}
      <span
        aria-hidden
        className="shrink-0 ml-3 rounded-full transition-colors"
        style={{
          width: 40, height: 22, padding: 3, display: 'inline-flex',
          justifyContent: consent ? 'flex-end' : 'flex-start',
          background: consent ? '#00A86B' : 'rgba(255,255,255,0.15)',
        }}
      >
        <span style={{ width: 16, height: 16, borderRadius: 999, background: '#fff' }} />
      </span>
    </button>
  );
}
