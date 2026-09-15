import type { Metadata } from 'next';
import Link from 'next/link';
import { ENTITY } from '@/lib/entity';

export const metadata: Metadata = {
  title: 'Rishta Alerts — Opt-in & Opt-out — InstaRishta',
  description: 'How InstaRishta rishta alerts over RCS, SMS and WhatsApp work: who sends them, how to opt in, and how to stop them.',
};

/**
 * The public face of the member opt-in.
 *
 * The consent switch itself lives behind login at /account, which is right for
 * the member but useless to a Google RCS or DLT reviewer, who cannot sign in.
 * This page is what they read instead, so every statement on it has to match
 * what the messaging code enforces — the STOP keywords below are the ones
 * lib/messaging/events.ts matches, not a wish list.
 *
 * That module ships with the messaging platform (feat/messaging-platform). It
 * is also the only thing that can send an alert, so nothing described here can
 * happen without it — but do not start sending from any other path, or the
 * promises on this page stop being true. Re-subscription by START is handled by
 * the RCS platform's default, not by our code.
 */
const STOP_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'OPTOUT', 'OPT-OUT', 'OPT OUT', 'CANCEL', 'END', 'QUIT'];

const SECTIONS = [
  {
    id: '1',
    title: 'What rishta alerts are',
    body: `Rishta alerts are messages about newly published biodatas on InstaRishta and updates on your own account, such as an interest being accepted or a membership being activated. They are delivered by RCS (rich messages in your phone's Messages app), SMS or WhatsApp.`,
  },
  {
    id: '2',
    title: 'Who sends them',
    body: `All alerts are sent by ${ENTITY.legalName}, the business that owns and operates InstaRishta, as the registered principal entity under TRAI's commercial communication rules.\n\nUdyam registration: ${ENTITY.udyam}\nRegistered address: ${ENTITY.address}\n\nOn RCS, messages arrive from the verified "InstaRishta" business agent.`,
  },
  {
    id: '3',
    title: 'How to opt in',
    list: [
      'Sign in to your InstaRishta account and open Account.',
      'Turn on the "New rishta alerts" switch. It is off for every account until you turn it on yourself.',
      'The date you turned it on is shown under the switch and recorded as your consent.',
    ],
    footer: 'Only you can turn alerts on. Our staff cannot switch them on for you, and we never message numbers that did not opt in — including numbers from other sources, lists or third parties.',
  },
  {
    id: '4',
    title: 'How to stop alerts',
    body: 'Either of these stops all promotional alerts immediately, on every channel:',
    list: [
      `Reply to any alert with one of: ${STOP_KEYWORDS.join(', ')}.`,
      'Or turn off the "New rishta alerts" switch in your account.',
    ],
    footer: 'An opt-out also applies to any campaign already being sent. To receive alerts again, reply START or turn the switch back on.',
  },
  {
    id: '5',
    title: 'When we send',
    body: `Promotional alerts are sent only between 9 AM and 9 PM IST, only to members who have opted in, and only after checking the national Do-Not-Disturb registry as required by TRAI. Messages about something you did yourself — for example, a payment confirmation — may be sent at other times.`,
  },
  {
    id: '6',
    title: 'Help',
    body: `Email: ${ENTITY.supportEmail}\nWhatsApp: ${ENTITY.whatsapp}\n\nSee also our Terms of Service and Privacy Policy.`,
  },
];

export default function AlertsPage() {
  return (
    <div style={{ background: '#f2f0eb' }} className="min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-sm font-semibold no-underline mb-8 inline-block" style={{ color: '#00754A' }}>
          ← Back to Home
        </Link>

        <div className="bg-white rounded-[16px] p-10 md:p-14 mb-6" style={{ boxShadow: '0px 4px 24px rgba(0,0,0,0.08)' }}>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-4 text-[11px] font-bold uppercase tracking-[0.08em]"
            style={{ background: 'rgba(0,117,74,0.08)', color: '#006241', border: '1px solid rgba(0,117,74,0.15)' }}>
            Messaging Consent
          </div>
          <h1 className="text-3xl font-extrabold tracking-[-0.02em] mb-2" style={{ color: '#141413' }}>Rishta Alerts</h1>
          <p className="text-sm" style={{ color: '#696969' }}>How alerts work, how to opt in, and how to stop them.</p>
        </div>

        <div className="bg-white rounded-[16px] p-10 md:p-14" style={{ boxShadow: '0px 4px 24px rgba(0,0,0,0.08)' }}>
          <div className="flex flex-col gap-10">
            {SECTIONS.map((s) => (
              <section key={s.id} id={`s${s.id}`} className="pb-10 border-b last:border-0" style={{ borderColor: '#edebe9' }}>
                <h2 className="text-base font-bold mb-4" style={{ color: '#141413' }}>
                  <span style={{ color: '#00754A' }}>{s.id}.</span> {s.title}
                </h2>

                {s.body && (
                  <p className="text-sm leading-relaxed whitespace-pre-line mb-4" style={{ color: '#696969' }}>{s.body}</p>
                )}

                {s.list && (
                  <ul className="flex flex-col gap-2 mt-2">
                    {s.list.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm leading-relaxed" style={{ color: '#696969' }}>
                        <span className="mt-[4px] flex-shrink-0 text-[#00754A]">—</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                )}

                {s.footer && (
                  <p className="text-sm leading-relaxed mt-4 italic" style={{ color: '#696969' }}>{s.footer}</p>
                )}
              </section>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link href="/account" className="btn-brand" style={{ display: 'inline-flex' }}>Manage alerts in your account</Link>
            <Link href="/toc" className="btn-ghost inline-flex items-center">Terms</Link>
            <Link href="/privacy" className="btn-ghost inline-flex items-center">Privacy</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
