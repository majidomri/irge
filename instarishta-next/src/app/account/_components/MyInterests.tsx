'use client';
/**
 * The member's side of the lead flow.
 *
 * Sending an interest was free. Once the team records that the advertiser wants
 * to connect, the lead appears here as actionable and revealing the contact
 * spends one credit — charged exactly once, so a refresh never re-charges.
 */
import { useState } from 'react';
import { useInterests, type MyInterest } from '@/lib/hooks/useInterests';
import { chipLabel } from '@/lib/interest-chips';

const STATUS_LABEL: Record<string, { text: string; fg: string; bg: string }> = {
  new:       { text: 'Sent · awaiting reply', fg: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.08)' },
  seen:      { text: 'Sent · awaiting reply', fg: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.08)' },
  forwarded: { text: 'Passed to the family',  fg: '#60A5FA',               bg: 'rgba(96,165,250,0.15)' },
  accepted:  { text: 'They want to connect',  fg: '#00C87A',               bg: 'rgba(0,168,107,0.18)' },
  connected: { text: 'Contact revealed',      fg: '#00C87A',               bg: 'rgba(0,168,107,0.18)' },
  declined:  { text: 'Not proceeding',        fg: 'rgba(255,255,255,0.45)', bg: 'rgba(255,255,255,0.06)' },
  rejected:  { text: 'Not proceeding',        fg: 'rgba(255,255,255,0.45)', bg: 'rgba(255,255,255,0.06)' },
};

export default function MyInterests({ enabled, onCreditsChanged }: {
  enabled: boolean;
  onCreditsChanged?: () => void;
}) {
  const { interests, usedMonth, monthly, ready, refresh } = useInterests(enabled);
  const [busy, setBusy]       = useState<string | null>(null);
  const [error, setError]     = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  async function reveal(i: MyInterest) {
    setBusy(i.id);
    setError('');
    try {
      const res  = await fetch('/api/interests/reveal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interestId: i.id }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setRevealed(r => ({ ...r, [i.id]: data.phone }));
        onCreditsChanged?.();
        refresh();
        return;
      }
      if (res.status === 402)      setError('You are out of contact credits. Renew or top up to reveal this contact.');
      else if (res.status === 409) setError('This family has not agreed to connect yet.');
      else                         setError(data.error || 'Could not reveal the contact. Please try again.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  if (!enabled) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          My interests
        </p>
        {monthly > 0 && (
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {Math.max(0, monthly - usedMonth)} of {monthly} left this month
          </span>
        )}
      </div>

      {!ready ? (
        <div className="h-[68px] rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
      ) : interests.length === 0 ? (
        <p className="text-sm rounded-2xl px-4 py-4"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)' }}>
          You haven&apos;t sent any interests yet. Sending one is free — browse profiles and tap the heart.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {error && (
            <p className="text-xs font-semibold rounded-xl px-3 py-2"
              style={{ background: 'rgba(255,107,107,0.12)', color: '#FF6B6B' }}>{error}</p>
          )}

          {interests.map(i => {
            const s = STATUS_LABEL[i.status] ?? STATUS_LABEL.new;
            const phone = revealed[i.id] ?? i.revealed_phone;
            const canReveal = i.status === 'accepted' && !i.revealed_at && !phone;

            return (
              <div key={i.id} className="rounded-2xl p-4"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      IR #{i.profile_num ?? '—'} · {i.profile_gender === 'female' ? 'Bride' : 'Groom'}
                    </p>
                    <p className="text-[11px] truncate mt-0.5" dir="auto" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {i.profile_title || '—'}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold rounded-full px-2.5 py-1 shrink-0"
                    style={{ background: s.bg, color: s.fg }}>
                    {s.text}
                  </span>
                </div>

                <p className="text-[11px] mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  You sent: {chipLabel(i.chip)}
                </p>

                {phone ? (
                  <a href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full rounded-full py-2.5 text-sm font-bold no-underline"
                    style={{ background: '#25D366', color: '#fff' }}>
                    Message {phone} on WhatsApp
                  </a>
                ) : canReveal ? (
                  <button onClick={() => reveal(i)} disabled={busy === i.id}
                    className="w-full rounded-full py-2.5 text-sm font-bold disabled:opacity-50"
                    style={{ background: '#00A86B', color: '#fff' }}>
                    {busy === i.id ? 'Revealing…' : 'Reveal contact · 1 credit'}
                  </button>
                ) : i.status === 'declined' || i.status === 'rejected' ? (
                  <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    No credit was used for this.
                  </p>
                ) : (
                  <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    We&apos;ll let you know here if they want to connect. No credit used yet.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
