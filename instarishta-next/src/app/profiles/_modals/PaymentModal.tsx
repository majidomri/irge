'use client';
import { useState, useRef } from 'react';

import { PLANS, TOPUP, totalCredits, pricePerCredit } from '@/lib/plans';

/** Subscription terms plus the standalone top-up, as one selectable list. */
const OPTIONS = [
  ...PLANS.map(p => ({
    id:       p.id as string,
    label:    p.name,
    price:    p.price,
    headline: `${p.monthlyCredits} credits / month · ${p.months} months`,
    sub:      `${totalCredits(p)} total · ₹${pricePerCredit(p).toFixed(2)} per credit`,
  })),
  {
    id:       TOPUP.id as string,
    label:    TOPUP.name,
    price:    TOPUP.price,
    headline: `${TOPUP.credits} extra credits, one time`,
    sub:      'Never expire · for when you run out mid-month',
  },
];

export default function PaymentModal({ userEmail, onClose }: { userEmail: string; onClose: () => void }) {
  const [plan,      setPlan]      = useState(OPTIONS[0].id);
  const [utr,       setUtr]       = useState('');
  const [file,      setFile]      = useState<File | null>(null);
  const [status,    setStatus]    = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [copied,    setCopied]    = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = OPTIONS.find(p => p.id === plan)!;
  const upiId    = '918886667121@ybl';
  const upiLink  = `upi://pay?pa=${upiId}&pn=InstaRishta&am=${selected.price}&cu=INR`;

  function copyUpi() {
    navigator.clipboard.writeText(upiId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!utr.trim()) return;
    setStatus('sending');
    try {
      const fd = new FormData();
      fd.append('plan',  plan);
      fd.append('utr',   utr.trim());
      fd.append('email', userEmail);
      if (file) fd.append('screenshot', file);
      const res = await fetch('/api/payment-notify', { method: 'POST', body: fd });
      if (res.ok) setStatus('done');
      else setStatus('error');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="fixed inset-0 z-200 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <section className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden" style={{ background: '#fff', zIndex: 1, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

        <div className="px-5 pt-5 pb-4 flex items-start justify-between shrink-0" style={{ borderBottom: '1px solid #F0ECE8' }}>
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em]" style={{ color: '#696969' }}>Out of credits</p>
            <h2 className="text-[1.15rem] font-extrabold mt-0.5" style={{ color: '#141413' }}>Get more credits</h2>
            <p className="text-xs mt-1" style={{ color: '#696969' }}>Pay via UPI · Admin tops up within hours</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ml-3" style={{ background: '#F3F0EE', color: '#141413' }}>×</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {status === 'done' ? (
            <div className="px-5 py-10 text-center">
              <div className="text-5xl mb-4">✅</div>
              <p className="text-base font-bold mb-1" style={{ color: '#141413' }}>Payment submitted!</p>
              <p className="text-sm" style={{ color: '#696969' }}>Your request has been sent to our admin. Credits will be added within a few hours.</p>
              <button onClick={onClose} className="mt-6 rounded-full px-8 py-2.5 text-sm font-bold" style={{ background: '#006241', color: '#fff' }}>Done</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-5">

              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: '#A0A0A0' }}>Choose a plan</p>
                <div className="flex flex-col gap-2">
                  {OPTIONS.map(p => (
                    <button type="button" key={p.id} onClick={() => setPlan(p.id)}
                      className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 border-2 text-left transition-all"
                      style={{
                        borderColor: plan === p.id ? '#006241' : '#E8E4E0',
                        background:  plan === p.id ? '#EEF6F0' : '#FAFAF9',
                      }}>
                      <div className="min-w-0">
                        <span className="text-sm font-bold block" style={{ color: plan === p.id ? '#006241' : '#141413' }}>{p.label}</span>
                        <span className="text-[11px] block mt-0.5" style={{ color: '#141413' }}>{p.headline}</span>
                        <span className="text-[10px] block" style={{ color: '#696969' }}>{p.sub}</span>
                      </div>
                      <span className="text-base font-extrabold shrink-0" style={{ color: plan === p.id ? '#006241' : '#141413' }}>
                        ₹{p.price.toLocaleString('en-IN')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid #F0ECE8' }}>
                <div className="px-4 pt-4 pb-3">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-3" style={{ color: '#A0A0A0' }}>Pay via PhonePe / UPI</p>

                  <div className="flex justify-center mb-3">
                    <img src="/phonepe-qr.png" alt="PhonePe QR" width={180} height={180}
                      className="rounded-xl"
                      style={{ border: '1px solid #F0ECE8' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>

                  <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-3" style={{ background: '#F3F0EE' }}>
                    <span className="flex-1 text-sm font-mono font-semibold" style={{ color: '#141413' }}>{upiId}</span>
                    <button type="button" onClick={copyUpi}
                      className="text-xs font-bold px-3 py-1 rounded-full"
                      style={{ background: copied ? '#006241' : '#1E3932', color: '#fff' }}>
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>

                  <a href={upiLink}
                    className="flex items-center justify-center gap-2 w-full rounded-full py-2.5 text-sm font-bold"
                    style={{ background: '#5F259F', color: '#fff', textDecoration: 'none' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 17.93V18a1 1 0 0 0-2 0v1.93A8 8 0 0 1 4.07 13H6a1 1 0 0 0 0-2H4.07A8 8 0 0 1 11 4.07V6a1 1 0 0 0 2 0V4.07A8 8 0 0 1 19.93 11H18a1 1 0 0 0 0 2h1.93A8 8 0 0 1 13 19.93z"/></svg>
                    Open in PhonePe / UPI App
                  </a>
                </div>
              </div>

              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-1.5" style={{ color: '#A0A0A0' }}>Transaction / UTR number *</p>
                <input
                  type="text"
                  value={utr}
                  onChange={e => setUtr(e.target.value)}
                  placeholder="e.g. 425012345678"
                  required
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ background: '#F3F0EE', color: '#141413', border: '1.5px solid #E8E4E0' }}
                />
              </div>

              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em] mb-1.5" style={{ color: '#A0A0A0' }}>Payment screenshot (optional)</p>
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full rounded-xl px-4 py-3 text-sm text-left border-2 border-dashed"
                  style={{ borderColor: '#D1CDC7', color: file ? '#006241' : '#A0A0A0', background: '#FAFAF9' }}>
                  {file ? file.name : '+ Upload screenshot'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </div>

              {status === 'error' && (
                <p className="text-xs font-semibold text-center" style={{ color: '#CF4500' }}>
                  Something went wrong. Please try again.
                </p>
              )}

              <button type="submit" disabled={status === 'sending' || !utr.trim()}
                className="w-full rounded-full py-3.5 text-sm font-bold"
                style={{ background: '#006241', color: '#fff', opacity: !utr.trim() ? 0.5 : 1 }}>
                {status === 'sending' ? 'Sending…' : 'Submit Payment for Verification'}
              </button>

              <p className="text-center text-[10px]" style={{ color: '#B0A8A0' }}>
                Activated manually by admin · Usually within 2–4 hours<br />
                All payments are final — no refunds once a plan is activated.
              </p>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
