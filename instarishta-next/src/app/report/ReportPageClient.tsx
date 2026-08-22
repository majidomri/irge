'use client';
import { useState } from 'react';
import Link from 'next/link';
import { REPORT_CATEGORIES, type ReportCategory } from '@/lib/reports';

/**
 * Full-page report form for when there's no specific card/member open to
 * hang a modal off — reached from the footer, /child-safety, or a direct
 * link shared by someone who witnessed something.
 */
export default function ReportPageClient() {
  const [category, setCategory]         = useState<ReportCategory | ''>('');
  const [ref, setRef]                   = useState(''); // "IR #12" or a profile link, optional
  const [description, setDescription]   = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [status, setStatus]             = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError]               = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || !description.trim()) return;
    setStatus('sending');
    setError('');
    const m = ref.trim().match(/(?:ir)?\s*#?\s*(\d{1,6})/i);
    const profileNum = m ? parseInt(m[1], 10) : null;
    try {
      const res = await fetch('/api/reports', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          entityType:  profileNum ? 'profile' : 'other',
          entityId:    ref.trim() || null,
          profileNum, category, description,
          contactEmail: contactEmail || undefined,
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

  if (status === 'done') {
    return (
      <div className="bg-white rounded-[16px] p-10 md:p-14 text-center" style={{ boxShadow: '0px 4px 24px rgba(0,0,0,0.08)' }}>
        <div className="text-5xl mb-4">🛡️</div>
        <h1 className="text-2xl font-extrabold mb-2" style={{ color: '#141413' }}>Report received</h1>
        <p className="text-sm mb-6" style={{ color: '#696969' }}>
          Our team reviews every report — urgent categories, like suspected minors, within 2 hours.
          Thank you for helping keep InstaRishta safe.
        </p>
        <Link href="/" className="inline-flex rounded-full px-8 py-3 text-sm font-bold no-underline" style={{ background: '#006241', color: '#fff' }}>
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-[16px] p-8 md:p-14" style={{ boxShadow: '0px 4px 24px rgba(0,0,0,0.08)' }}>
      <div className="mb-6">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-3" style={{ color: '#A0A0A0' }}>What&apos;s wrong?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {REPORT_CATEGORIES.map(c => {
            const on = category === c.key;
            return (
              <button type="button" key={c.key} onClick={() => setCategory(c.key)}
                className="flex items-center justify-between gap-2 rounded-2xl px-4 py-3 border-2 text-left transition-all"
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

      <div className="mb-5">
        <label className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-2 block" style={{ color: '#A0A0A0' }}>
          Profile # or link (optional)
        </label>
        <input value={ref} onChange={e => setRef(e.target.value)} placeholder="e.g. IR #482 or instarishta.me/p/…"
          className="w-full rounded-2xl px-4 py-3 text-sm outline-none" style={{ border: '1.5px solid #E8E4E0', color: '#141413' }} />
      </div>

      <div className="mb-5">
        <label className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-2 block" style={{ color: '#A0A0A0' }}>
          What happened? *
        </label>
        <textarea required value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} rows={5}
          placeholder="Describe what you saw — this goes straight to our safety team."
          className="w-full rounded-2xl px-4 py-3 text-sm outline-none" style={{ border: '1.5px solid #E8E4E0', color: '#141413', resize: 'vertical' }} />
      </div>

      <div className="mb-6">
        <label className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-2 block" style={{ color: '#A0A0A0' }}>
          Your email (optional — only if you want a reply)
        </label>
        <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="you@example.com"
          className="w-full rounded-2xl px-4 py-3 text-sm outline-none" style={{ border: '1.5px solid #E8E4E0', color: '#141413' }} />
      </div>

      {error && <p className="text-sm font-semibold text-center mb-4" style={{ color: '#CF4500' }}>{error}</p>}

      <button type="submit" disabled={status === 'sending' || !category || !description.trim()}
        className="w-full rounded-full py-3.5 text-sm font-bold disabled:opacity-50" style={{ background: '#CF4500', color: '#fff' }}>
        {status === 'sending' ? 'Sending…' : 'Submit report'}
      </button>

      <p className="text-xs text-center mt-4" style={{ color: '#A0A0A0' }}>
        In immediate danger, or reporting a child-safety concern? Email{' '}
        <a href="mailto:safety@instarishta.me" style={{ color: '#006241' }}>safety@instarishta.me</a> or WhatsApp{' '}
        <a href="https://wa.me/918886667121" style={{ color: '#006241' }}>+91 888 666 7121</a>.
      </p>
    </form>
  );
}
