'use client';
import { useState } from 'react';
import { type DeckProfile, rtlTextProps, URDU_FONT } from '../_shared';
import { INTEREST_CHIPS } from '@/lib/interest-chips';

/**
 * Send a private interest — free, no contact credit.
 *
 * There is no message box. The sender picks one pre-made phrase, so nothing
 * user-authored ever reaches a stranger's family and there is nothing to
 * moderate. A contact credit is spent only later, and only if the advertiser
 * agrees to connect (see /api/interests/reveal).
 */
export default function InterestModal({
  profile, onClose, onSent, usedMonth, monthly,
}: {
  profile: DeckProfile;
  onClose: () => void;
  onSent: (usedMonth: number) => void;
  usedMonth: number;
  monthly: number;
}) {
  const [chip, setChip]     = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError]   = useState('');

  const isFemale  = profile.gender === 'female';
  const remaining = Math.max(0, monthly - usedMonth);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chip) return;
    setStatus('sending');
    setError('');
    try {
      const res = await fetch('/api/interests', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          profileId: profile.id, num: profile._num,
          title: profile.title, gender: profile.gender, chip,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setStatus('done');
        onSent(data.usedMonth ?? usedMonth + 1);
        return;
      }
      setStatus('idle');
      if (res.status === 409)      setError('You have already sent an interest on this profile.');
      else if (res.status === 429) setError(
        data.reason === 'daily_limit'
          ? 'You have sent a lot of interests today. Please continue tomorrow.'
          : 'You have used all your interests for this month.',
      );
      else setError(data.error || 'Something went wrong. Please try again.');
    } catch {
      setStatus('idle');
      setError('Network error. Please try again.');
    }
  }

  return (
    <div className="fixed inset-0 z-200 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <section className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: '#fff', zIndex: 1, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

        <div className="px-5 pt-5 pb-4 flex items-start justify-between shrink-0" style={{ borderBottom: '1px solid #F0ECE8' }}>
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em]" style={{ color: '#696969' }}>Private · Free</p>
            <h2 className="text-[1.15rem] font-extrabold mt-0.5" style={{ color: '#141413' }}>Express interest</h2>
            <p className="text-xs mt-1" style={{ color: '#696969' }}>
              No credit used. You only spend one if they agree to connect.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ml-3"
            style={{ background: '#F3F0EE', color: '#141413' }}>×</button>
        </div>

        {status === 'done' ? (
          <div className="px-5 py-10 text-center">
            <div className="text-5xl mb-4">💚</div>
            <p className="text-base font-bold mb-1" style={{ color: '#141413' }}>Interest sent</p>
            <p className="text-sm" style={{ color: '#696969' }}>
              We will pass it to the family. If they want to connect, it appears
              in <strong>My interests</strong> and you can reveal their contact then.
            </p>
            <button onClick={onClose} className="mt-6 rounded-full px-8 py-2.5 text-sm font-bold"
              style={{ background: '#006241', color: '#fff' }}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

            <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: isFemale ? '#FDF0F5' : '#EEF6F0' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
                style={{ background: isFemale ? '#F5C6DC' : '#C8E6D4', color: isFemale ? '#C0397A' : '#006241' }}>
                {isFemale ? '♀' : '♂'}
              </div>
              <div className="min-w-0">
                <p className="text-[0.68rem] font-bold uppercase tracking-wide" style={{ color: isFemale ? '#C0397A' : '#006241' }}>
                  IR #{profile._num} · {isFemale ? 'Bride' : 'Groom'}
                </p>
                <p className="text-xs font-semibold truncate mt-0.5"
                  {...rtlTextProps(profile.title)}
                  style={{ color: '#141413', ...rtlTextProps(profile.title).style }}>
                  {profile.title}
                </p>
              </div>
            </div>

            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: '#A0A0A0' }}>
                Choose your message
              </p>
              <div className="flex flex-col gap-2">
                {INTEREST_CHIPS.map(c => {
                  const on = chip === c.key;
                  return (
                    <button type="button" key={c.key} onClick={() => setChip(c.key)}
                      className="flex items-center gap-3 rounded-2xl px-4 py-3 border-2 text-left transition-all"
                      style={{
                        borderColor: on ? '#006241' : '#E8E4E0',
                        background:  on ? '#EEF6F0' : '#FAFAF9',
                      }}>
                      <span className="text-lg leading-none shrink-0">{c.icon}</span>
                      <span className="min-w-0">
                        <span className="text-sm font-bold block" style={{ color: on ? '#006241' : '#141413' }}>
                          {c.label}
                        </span>
                        {/* A fixed Urdu label, so the marking is literal. */}
                        <span className="text-xs block mt-0.5" dir="rtl" lang="ur"
                          style={{ color: '#696969', fontFamily: URDU_FONT }}>
                          {c.ur}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] mt-2" style={{ color: '#A0A0A0' }}>
                Seen only by our team and the family — never shown publicly on the profile.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl px-3 py-2"
              style={{ background: remaining <= 3 ? '#FFF3EE' : '#F7F5F3' }}>
              <span className="text-[11px] font-medium" style={{ color: remaining <= 3 ? '#CF4500' : '#696969' }}>
                {remaining} of {monthly} interests left this month
              </span>
            </div>

            {error && (
              <p className="text-xs font-semibold text-center" style={{ color: '#CF4500' }}>{error}</p>
            )}

            <button type="submit" disabled={status === 'sending' || remaining <= 0 || !chip}
              className="w-full rounded-full py-3.5 text-sm font-bold disabled:opacity-50"
              style={{ background: '#006241', color: '#fff' }}>
              {status === 'sending' ? 'Sending…' : chip ? 'Send interest' : 'Choose a message above'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
