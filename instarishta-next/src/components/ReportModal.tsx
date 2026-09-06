'use client';
import { useState } from 'react';
import { REPORT_CATEGORIES, type ReportCategory, type ReportEntityType } from '@/lib/reports';

/**
 * Report misuse or abuse on a specific listing, member, post, or story.
 * Posts to /api/reports — open to everyone, signed in or not.
 *
 * Mirrors InterestModal's chrome so it feels native, but the accent is red
 * (this is a complaint, not an interest) and there is a free-text field:
 * unlike an interest, a report needs the reporter's own words to be useful.
 */
export default function ReportModal({
  entityType, entityId, profileNum, label, onClose,
}: {
  entityType: ReportEntityType;
  entityId?: string | null;
  profileNum?: number | null;
  label?: string;
  onClose: () => void;
}) {
  const [category, setCategory]         = useState<ReportCategory | ''>('');
  const [description, setDescription]   = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [status, setStatus]             = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError]               = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;
    setStatus('sending');
    setError('');
    try {
      const res = await fetch('/api/reports', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          entityType, entityId: entityId ?? null, profileNum: profileNum ?? null,
          category, description, contactEmail: contactEmail || undefined,
        }),
      });
      if (res.ok) {
        setStatus('done');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setStatus('idle');
      setError(data.error || 'Something went wrong. Please try again.');
    } catch {
      setStatus('idle');
      setError('Network error. Please try again.');
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <section className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: '#fff', zIndex: 1, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

        <div className="px-5 pt-5 pb-4 flex items-start justify-between shrink-0" style={{ borderBottom: '1px solid #F0ECE8' }}>
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em]" style={{ color: '#CF4500' }}>Report</p>
            <h2 className="text-[1.15rem] font-extrabold mt-0.5" style={{ color: '#141413' }}>
              Report {label ?? 'this profile'}
            </h2>
            <p className="text-xs mt-1" style={{ color: '#696969' }}>
              Seen only by our safety team — never shown publicly.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ml-3"
            style={{ background: '#F3F0EE', color: '#141413' }}>×</button>
        </div>

        {status === 'done' ? (
          <div className="px-5 py-10 text-center">
            <div className="text-5xl mb-4">🛡️</div>
            <p className="text-base font-bold mb-1" style={{ color: '#141413' }}>Report received</p>
            <p className="text-sm" style={{ color: '#696969' }}>
              Our team reviews every report — urgent categories, like suspected minors, within 2 hours.
              Thank you for helping keep InstaRishta safe.
            </p>
            <button onClick={onClose} className="mt-6 rounded-full px-8 py-2.5 text-sm font-bold"
              style={{ background: '#006241', color: '#fff' }}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: '#A0A0A0' }}>
                What&apos;s wrong?
              </p>
              <div className="flex flex-col gap-2">
                {REPORT_CATEGORIES.map(c => {
                  const on = category === c.key;
                  return (
                    <button type="button" key={c.key} onClick={() => setCategory(c.key)}
                      className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 border-2 text-left transition-all"
                      style={{ borderColor: on ? '#CF4500' : '#E8E4E0', background: on ? '#FFF3EE' : '#FAFAF9' }}>
                      <span className="text-sm font-bold" style={{ color: on ? '#CF4500' : '#141413' }}>{c.label}</span>
                      {c.urgent && (
                        <span className="text-[9px] font-bold uppercase rounded-full px-2 py-0.5 shrink-0"
                          style={{ background: '#EA4335', color: '#fff' }}>Urgent</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: '#A0A0A0' }}>
                Details (optional)
              </p>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                maxLength={2000} rows={3} placeholder="Anything that helps our team review this…"
                className="w-full rounded-2xl px-4 py-3 text-sm outline-none"
                style={{ border: '1.5px solid #E8E4E0', color: '#141413', resize: 'vertical' }} />
            </div>

            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: '#A0A0A0' }}>
                Your email (optional — only if you want a reply)
              </p>
              <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl px-4 py-3 text-sm outline-none"
                style={{ border: '1.5px solid #E8E4E0', color: '#141413' }} />
            </div>

            {error && <p className="text-xs font-semibold text-center" style={{ color: '#CF4500' }}>{error}</p>}

            <button type="submit" disabled={status === 'sending' || !category}
              className="w-full rounded-full py-3.5 text-sm font-bold disabled:opacity-50"
              style={{ background: '#CF4500', color: '#fff' }}>
              {status === 'sending' ? 'Sending…' : 'Submit report'}
            </button>

            <p className="text-[10px] text-center" style={{ color: '#A0A0A0' }}>
              In immediate danger, or reporting a child-safety concern? Email{' '}
              <a href="mailto:safety@instarishta.me" style={{ color: '#006241' }}>safety@instarishta.me</a>{' '}
              or WhatsApp <a href="https://wa.me/918886667121" style={{ color: '#006241' }}>+91 888 666 7121</a>.
            </p>
          </form>
        )}
      </section>
    </div>
  );
}
