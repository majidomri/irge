'use client';
import { useState } from 'react';
import { logContact } from '@/lib/contact-log';
import { type Profile, rtlTextProps } from '../_shared';

const BUSINESS_WA = '+918886667121';

const WA_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
);

function buildWAMessage(profile: Profile, num: number) {
  return [
    'السلام علیکم،',
    'We have seen your InstaRishta profile ad and are interested in a serious nikah conversation.',
    '',
    `InstaRishta ID: IR #${num}`,
    `Title: ${profile.title}`,
    `Gender: ${profile.gender === 'female' ? 'Bride (دلہن)' : 'Groom (دولہا)'}`,
    '',
    'Your Profile Ad:',
    profile.body,
    '',
    'Please respond to this message and share the best time to connect.',
    'JazakAllah Khair.',
  ].join('\n');
}

export default function ContactModal({
  profile, num, onClose, remaining, resetLabel,
}: {
  profile: Profile; num: number; onClose: () => void;
  remaining: number; resetLabel: string; contactLimit: number; isAnon: boolean;
}) {
  const [message, setMessage] = useState(() => buildWAMessage(profile, num));
  const isFemale = profile.gender === 'female';

  function handleWA() {
    logContact({ type: 'whatsapp', number: BUSINESS_WA, profileNum: num, profileTitle: profile.title });
    fetch('/api/telegram-notify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        profileNum: num, profileTitle: profile.title,
        profileBody: profile.body, gender: profile.gender, action: 'contact_wa',
      }),
    }).catch(() => {});
    window.open(`https://wa.me/${BUSINESS_WA}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="fixed inset-0 z-200 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <section className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden" style={{ background: '#fff', zIndex: 1, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

        <div className="px-5 pt-5 pb-4 flex items-start justify-between shrink-0" style={{ borderBottom: '1px solid #F0ECE8' }}>
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.1em]" style={{ color: '#696969' }}>Preferred contact</p>
            <h2 className="text-[1.15rem] font-extrabold mt-0.5" style={{ color: '#141413' }}>Contact this ad</h2>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: '#696969' }}>
              We have prepared a respectful message with the full profile details below.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ml-3" style={{ background: '#F3F0EE', color: '#141413' }}>×</button>
        </div>

        <div className="px-5 pt-4 pb-3 shrink-0">
          <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: isFemale ? '#FDF0F5' : '#EEF6F0' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
              style={{ background: isFemale ? '#F5C6DC' : '#C8E6D4', color: isFemale ? '#C0397A' : '#006241' }}>
              {isFemale ? '♀' : '♂'}
            </div>
            <div className="min-w-0">
              <p className="text-[0.68rem] font-bold uppercase tracking-wide" style={{ color: isFemale ? '#C0397A' : '#006241' }}>
                IR #{num} · {isFemale ? 'Bride' : 'Groom'}
              </p>
              <p className="text-xs font-semibold truncate mt-0.5"
                {...rtlTextProps(profile.title)}
                style={{ color: '#141413', ...rtlTextProps(profile.title).style }}>
                {profile.title}
              </p>
            </div>
          </div>

          {remaining <= 5 && (
            <div className="flex items-center justify-between rounded-xl px-3 py-2 mt-3"
              style={{ background: remaining <= 2 ? '#FFF3EE' : '#F7F5F3' }}>
              <span className="text-[11px] font-medium" style={{ color: remaining <= 2 ? '#CF4500' : '#696969' }}>
                {remaining} contact credit{remaining !== 1 ? 's' : ''} remaining
              </span>
              {resetLabel && <span className="text-[10px]" style={{ color: '#A0A0A0' }}>resets {resetLabel}</span>}
            </div>
          )}
        </div>

        <div className="px-5 pb-3 flex-1 overflow-y-auto">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.08em] mb-1.5" style={{ color: '#A0A0A0' }}>Edit message before sending</p>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={7}
            className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-none"
            style={{ background: '#F3F0EE', color: '#141413', border: '1.5px solid #E8E4E0', lineHeight: 1.7, fontFamily: 'inherit' }}
            dir="auto"
          />
        </div>

        <div className="px-5 pb-6 pt-1 flex flex-col gap-2.5 shrink-0" style={{ borderTop: '1px solid #F0ECE8' }}>
          <button onClick={handleWA}
            className="flex items-center justify-center gap-2.5 rounded-full py-3.5 text-sm font-bold"
            style={{ background: '#25D366', color: '#fff' }}>
            {WA_ICON}
            Chat on WhatsApp
          </button>
        </div>
      </section>
    </div>
  );
}
