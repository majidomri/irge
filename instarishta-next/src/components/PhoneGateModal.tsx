'use client';
/**
 * The credit gate, as a sheet: a paid member tapped "Contact" and their credits
 * are locked behind mobile verification.
 *
 * Deliberately thin — it is the same {@link PhoneLink} form as /account inside
 * the sheet chrome the deck's other modals use, so there is one implementation
 * of the Firebase round-trip and one set of copy to keep honest.
 */
import { useEffect } from 'react';
import PhoneLink from '@/components/PhoneLink';

export default function PhoneGateModal({
  onClose, onLinked,
}: {
  onClose:   () => void;
  /** Fired after the number is verified — the caller refetches credits. */
  onLinked?: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

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
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-[5px] rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>

        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)' }}
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div className="px-6 pt-6 pb-2">
          <h2 className="text-[1.35rem] font-extrabold text-white leading-tight mb-1.5">
            One last step
          </h2>
          <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Your credits are in your account. Verify your mobile once and they are
            yours to spend — this also lets families reach you about your rishta.
          </p>
          {/* `locked` drives the urgent copy; `bare` drops the section heading
              the sheet's own title already provides. */}
          <PhoneLink locked bare onLinked={onLinked} />
        </div>
      </section>
    </div>
  );
}
