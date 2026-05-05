import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Refund Policy — InstaRishta',
  description: 'InstaRishta refund and cancellation policy for premium services.',
};

const SECTIONS = [
  {
    id: '1',
    title: 'Overview',
    body: `InstaRishta ("we," "us") offers a free core platform — browsing profiles, viewing biodatas, and browsing channels are all free with no registration required. This Refund Policy applies to any paid premium services or features we may offer now or in the future. By purchasing any paid service on InstaRishta, you agree to the terms outlined in this policy.`,
  },
  {
    id: '2',
    title: 'Free Services',
    body: `The following core features of InstaRishta are and will remain free of charge:\n\n— Profile browsing and biodata viewing\n— Channel browsing and profile audio playback (with free tier limit)\n— Basic profile submission (biodata form)\n— Account registration\n\nNo payment is required or accepted for these services. There are no refund considerations for free services.`,
  },
  {
    id: '3',
    title: 'Paid / Premium Services',
    items: [
      {
        subtitle: 'Highlighted or Featured Listings',
        text: 'Profile promotion or featured placement in search results, where charged, is payable in advance. The service begins immediately upon payment confirmation.',
      },
      {
        subtitle: 'Verified Badge Programme',
        text: 'Manual verification of profiles or identity documents, where charged, is a one-time non-refundable processing fee once the review process has begun.',
      },
      {
        subtitle: 'Channel Subscriptions',
        text: 'Paid access to private or premium channels (if offered in the future) is subject to the terms displayed at the point of purchase.',
      },
    ],
  },
  {
    id: '4',
    title: 'Cancellation & Refund Eligibility',
    items: [
      {
        subtitle: 'Within 24 hours of purchase (before service delivery)',
        text: 'If you cancel within 24 hours of purchase AND the paid service has not yet been activated or delivered, you are entitled to a full refund. Contact support@instarishta.me within 24 hours with your order details.',
      },
      {
        subtitle: 'After service has been delivered or activated',
        text: 'Once a premium service has been activated (e.g., your profile is featured in search results, your verification review has commenced), no refund will be issued. The service is considered delivered from the moment it goes live.',
      },
      {
        subtitle: 'Technical failure by InstaRishta',
        text: 'If InstaRishta fails to deliver a paid service due to a technical error on our end, you are entitled to either a full refund or a service credit at your choice. Please contact us within 7 days of the issue.',
      },
      {
        subtitle: 'Duplicate charges',
        text: 'If you were charged more than once for the same service due to a payment gateway error, the duplicate charge(s) will be refunded in full within 7 business days.',
      },
    ],
  },
  {
    id: '5',
    title: 'Non-Refundable Situations',
    body: 'No refund will be issued in the following cases:',
    list: [
      'You did not find a suitable matrimonial match (InstaRishta is an introduction platform, not a match guarantee)',
      'Your account was suspended or terminated for a violation of our Terms of Service',
      'You changed your mind after the service was delivered',
      'The biodata or profile you submitted was rejected for quality or policy reasons after payment',
      'You purchased a service by mistake — please review your cart carefully before payment',
      'More than 30 days have passed since the purchase date',
    ],
  },
  {
    id: '6',
    title: 'How to Request a Refund',
    body: `To request a refund, please:\n\n1. Email support@instarishta.me with the subject line: "Refund Request — [Your Order ID]"\n2. Include your registered email, order ID, payment amount, and reason for the request\n3. Our team will review and respond within 5 business days\n4. Approved refunds are processed within 7–10 business days to your original payment method\n\nFor urgent payment issues, WhatsApp: +91 888 666 7121`,
  },
  {
    id: '7',
    title: 'Currency & Payment Method',
    body: `All paid services on InstaRishta are priced in Indian Rupees (₹). Refunds are issued to the same payment instrument used for the original purchase. InstaRishta is not responsible for any currency conversion charges levied by your bank or payment provider for international transactions.`,
  },
  {
    id: '8',
    title: 'Chargebacks & Disputes',
    body: `We encourage you to contact us directly before initiating a chargeback with your bank or payment provider. Unauthorised chargebacks on legitimately delivered services may result in account suspension and a ban from future purchases. InstaRishta will respond to all legitimate payment disputes promptly and in good faith.`,
  },
  {
    id: '9',
    title: 'Changes to This Policy',
    body: `InstaRishta may update this Refund Policy at any time. Changes will be posted on this page with a revised "Last updated" date. Your continued use of paid services after changes are posted constitutes acceptance of the revised policy.`,
  },
  {
    id: '10',
    title: 'Contact',
    body: `Refund & payment queries:\n\nEmail: support@instarishta.me\nWhatsApp: +91 888 666 7121\nHours: Monday – Saturday, 10am – 6pm IST`,
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
          <h1 className="text-3xl font-extrabold tracking-[-0.02em] mb-2" style={{ color: '#141413' }}>Refund Policy</h1>
          <p className="text-sm" style={{ color: '#696969' }}>Last updated: 5 May 2026</p>

          <div className="mt-6 rounded-[12px] p-5 flex items-start gap-4" style={{ background: 'rgba(0,117,74,0.06)', border: '1px solid rgba(0,117,74,0.15)' }}>
            <span className="text-2xl flex-shrink-0">🤲</span>
            <div>
              <p className="text-sm font-semibold mb-1" style={{ color: '#141413' }}>InstaRishta is free to browse</p>
              <p className="text-sm leading-relaxed" style={{ color: '#696969' }}>
                Profile browsing, biodata viewing, and basic features are completely free. This policy applies only to optional paid premium services.
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
            <p className="text-sm font-semibold mb-1" style={{ color: '#141413' }}>Need help with a payment?</p>
            <p className="text-sm mb-4" style={{ color: '#696969' }}>Contact us and we'll resolve it within 5 business days.</p>
            <a href="mailto:support@instarishta.me" className="btn-brand" style={{ display: 'inline-flex' }}>
              support@instarishta.me
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
