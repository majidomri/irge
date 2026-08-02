import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'No-Refund Policy — InstaRishta',
  description: 'InstaRishta membership payments are final and non-refundable. Please read before purchasing.',
};

const SECTIONS = [
  {
    id: '1',
    title: 'All Payments Are Final',
    body: `InstaRishta memberships are sold on a strictly non-refundable basis. Once a payment is made and a membership is activated, it cannot be cancelled, refunded, transferred, exchanged, paused, or converted to credit — in whole or in part, and regardless of how much of the membership you use.\n\nThis applies to every paid item on InstaRishta: the Rishta 6 membership, the Rishta 12 membership, and one-time credit top-ups.\n\nPlease read this policy in full and choose carefully before you pay.`,
  },
  {
    id: '2',
    title: 'Why We Cannot Offer Refunds',
    body: `Our paid product is the disclosure of private contact information belonging to real families.\n\nWhen you spend a contact credit, you are shown a candidate's phone number, WhatsApp number, or family representative's details. That information cannot be un-seen or returned once revealed. Unlike a physical product, there is nothing to send back and no way for us to undo the delivery.\n\nFor the same reason, a used membership cannot be restored to an unused state, and we cannot verify that revealed information has not already been recorded or acted upon. A refund policy is therefore not workable for this category of service, and we do not operate one.`,
  },
  {
    id: '3',
    title: 'Free Before You Pay',
    body: `You are never required to pay to evaluate InstaRishta. The following are free, permanently:\n\n— Browsing all profiles and biodatas\n— Browsing channels and playing profile audio\n— Submitting your own biodata\n— Creating an account, including welcome contact credits\n\nWe strongly encourage you to use the free tier first and satisfy yourself that the platform suits your requirements before making any payment. If you are unsure which membership fits your needs, contact us on WhatsApp before you pay and we will advise you.`,
  },
  {
    id: '4',
    title: 'No Refund Will Be Issued',
    body: 'For the avoidance of doubt, no refund, partial refund, or credit will be issued in any of the following circumstances:',
    list: [
      'You did not find a suitable match — InstaRishta is an introduction platform and does not guarantee a match, a response, or a marriage',
      'A family you contacted did not reply, declined, or was already engaged elsewhere',
      'You changed your mind, or purchased the wrong membership by mistake',
      'You did not use your credits, or your monthly credits expired unused',
      'You stopped using the service, or your circumstances changed',
      'Your account was suspended or terminated for breach of our Terms of Service',
      'A profile you submitted was rejected for quality, authenticity, or policy reasons',
      'You found the same or a similar profile elsewhere, or at a different price',
      'Your membership expired and you did not renew in time',
    ],
  },
  {
    id: '5',
    title: 'Credits, Resets and Expiry',
    items: [
      {
        subtitle: 'Monthly credits do not carry over',
        text: 'Your contact credits reset to the full monthly allowance on the same date each month. Any credits unused in a given month are forfeited and are not carried forward, refunded, or compensated. This is a deliberate part of the pricing and is disclosed on the pricing page before purchase.',
      },
      {
        subtitle: 'Memberships do not renew automatically',
        text: 'There is no auto-debit, standing instruction, or recurring mandate on your card or UPI. Nothing is ever charged without you initiating a fresh payment. When your term ends, credits simply stop refilling. Because we never charge you automatically, there are no unexpected charges to reverse.',
      },
      {
        subtitle: 'Unlocked contacts remain yours',
        text: 'Contact details you have already unlocked stay visible to you permanently, including after your membership expires. You do not lose access to what you have already spent credits on.',
      },
      {
        subtitle: 'Top-up credits are permanent',
        text: 'One-time top-up credits never reset and never expire. They remain on your account even after a membership term ends. They are equally non-refundable.',
      },
    ],
  },
  {
    id: '6',
    title: 'Payments Received Without Activation',
    body: `This section is not a refund. It covers money we received for something we never sold you.\n\nIf you transfer money by UPI but your membership is never activated — for example you paid twice for the same membership, transferred an incorrect amount, or paid but no membership was ever applied to your account — then no service has been rendered and we will return the amount concerned.\n\nTo raise this, contact us within 7 days of the transaction with your UTR/transaction reference and the registered email address. We will verify against our records and, where confirmed, return the amount to the originating account within 7–10 business days.\n\nThis does not apply once a membership has been activated on your account, however briefly and however little you have used it. In that case Section 1 applies and no amount is returnable.`,
  },
  {
    id: '7',
    title: 'Chargebacks & Disputes',
    body: `If you have a concern about a payment, contact us first — we respond to every genuine query.\n\nRaising a chargeback or payment dispute against a membership that was activated and delivered is a breach of these terms. In such cases we will contest the dispute with the payment provider and supply evidence of activation and usage, and the associated account will be permanently suspended and barred from future purchases.\n\nWe will always deal with legitimate payment issues promptly and in good faith.`,
  },
  {
    id: '8',
    title: 'Currency & Pricing',
    body: `All memberships are priced in Indian Rupees (₹) and are inclusive of applicable taxes. InstaRishta is not responsible for currency conversion charges, bank fees, or transaction charges levied by your bank or payment provider.\n\nPrices may change at any time. Any change applies only to purchases made after the change; it does not affect a membership you have already paid for, and a subsequent price reduction does not entitle you to a refund of the difference.`,
  },
  {
    id: '9',
    title: 'Your Acknowledgement',
    body: `By making any payment on InstaRishta, you confirm that you have read and understood this policy, that you have had the opportunity to use the free tier first, and that you accept your payment is final and non-refundable.\n\nIf you do not accept these terms, please do not make a payment. The free tier remains available to you.`,
  },
  {
    id: '10',
    title: 'Changes to This Policy',
    body: `InstaRishta may update this policy at any time. Changes are posted on this page with a revised "Last updated" date, and apply to purchases made after that date.`,
  },
  {
    id: '11',
    title: 'Contact',
    body: `Payment queries — please contact us BEFORE paying if you are unsure:\n\nEmail: support@instarishta.me\nWhatsApp: +91 888 666 7121\nHours: Monday – Saturday, 10am – 6pm IST`,
  },
];

export default function RefundPolicyPage() {
  return (
    <div style={{ background: '#f2f0eb' }} className="min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-sm font-semibold no-underline mb-8 inline-block" style={{ color: '#00754A' }}>
          ← Back to Home
        </Link>

        <div className="bg-white rounded-[16px] p-10 md:p-14 mb-6" style={{ boxShadow: '0px 4px 24px rgba(0,0,0,0.08)' }}>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-4 text-[11px] font-bold uppercase tracking-[0.08em]"
            style={{ background: 'rgba(0,117,74,0.08)', color: '#006241', border: '1px solid rgba(0,117,74,0.15)' }}>
            Legal Document
          </div>
          <h1 className="text-3xl font-extrabold tracking-[-0.02em] mb-2" style={{ color: '#141413' }}>No-Refund Policy</h1>
          <p className="text-sm" style={{ color: '#696969' }}>Last updated: 2 August 2026</p>

          <div className="mt-6 rounded-[12px] p-5 flex items-start gap-4" style={{ background: 'rgba(234,67,53,0.06)', border: '1px solid rgba(234,67,53,0.2)' }}>
            <span className="text-2xl flex-shrink-0">⚠️</span>
            <div>
              <p className="text-sm font-semibold mb-1" style={{ color: '#141413' }}>All payments are final</p>
              <p className="text-sm leading-relaxed" style={{ color: '#696969' }}>
                InstaRishta memberships are strictly non-refundable. Once activated, a membership cannot be cancelled,
                refunded, transferred, or exchanged. Please choose carefully before you pay.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-[12px] p-5 flex items-start gap-4" style={{ background: 'rgba(0,117,74,0.06)', border: '1px solid rgba(0,117,74,0.15)' }}>
            <span className="text-2xl flex-shrink-0">🤲</span>
            <div>
              <p className="text-sm font-semibold mb-1" style={{ color: '#141413' }}>Try everything for free first</p>
              <p className="text-sm leading-relaxed" style={{ color: '#696969' }}>
                Browsing profiles, viewing biodatas and playing audio are free — and every new account gets welcome
                contact credits. Satisfy yourself the platform suits you before paying anything.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[16px] p-10 md:p-14" style={{ boxShadow: '0px 4px 24px rgba(0,0,0,0.08)' }}>
          <div className="flex flex-col gap-10">
            {SECTIONS.map((s) => (
              <section key={s.id} className="pb-10 border-b last:border-0" style={{ borderColor: '#edebe9' }}>
                <h2 className="text-base font-bold mb-4" style={{ color: '#141413' }}>
                  <span style={{ color: '#00754A' }}>{s.id}.</span> {s.title}
                </h2>

                {s.body && (
                  <p className="text-sm leading-relaxed whitespace-pre-line mb-4" style={{ color: '#696969' }}>{s.body}</p>
                )}

                {s.items && (
                  <div className="flex flex-col gap-4 mt-2">
                    {s.items.map((item) => (
                      <div key={item.subtitle} className="rounded-[10px] p-5" style={{ background: '#fafaf9', border: '1px solid #edebe9' }}>
                        <p className="text-sm font-semibold mb-1.5" style={{ color: '#141413' }}>{item.subtitle}</p>
                        <p className="text-sm leading-relaxed" style={{ color: '#696969' }}>{item.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {s.list && (
                  <ul className="flex flex-col gap-2 mt-2">
                    {s.list.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm leading-relaxed" style={{ color: '#696969' }}>
                        <span className="mt-[4px] flex-shrink-0" style={{ color: '#EA4335' }}>✗</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <div className="mt-8 rounded-[12px] p-6 text-center" style={{ background: 'rgba(0,117,74,0.06)', border: '1px solid rgba(0,117,74,0.15)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: '#141413' }}>Unsure which membership to buy?</p>
            <p className="text-sm mb-4" style={{ color: '#696969' }}>
              Ask us <strong>before</strong> you pay — we&apos;ll help you pick the right one. Payments cannot be reversed afterwards.
            </p>
            <a href="mailto:support@instarishta.me" className="btn-brand" style={{ display: 'inline-flex' }}>
              support@instarishta.me
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
