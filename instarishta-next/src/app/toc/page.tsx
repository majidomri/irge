import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service — InstaRishta',
  description: 'Read InstaRishta\'s Terms of Service. Rules governing use of our Muslim matrimonial platform.',
};

const SECTIONS = [
  {
    id: '1',
    title: 'Acceptance of Terms',
    body: `By accessing, browsing, or registering on InstaRishta ("Platform," "we," "us," or "our"), you ("User," "you") agree to be legally bound by these Terms of Service ("Terms"), our Privacy Policy, and all applicable laws and regulations. If you do not agree with any part of these Terms, you must not use InstaRishta. These Terms apply to all visitors, registered members, and profile submitters.`,
  },
  {
    id: '2',
    title: 'About InstaRishta',
    body: `InstaRishta is a Muslim matrimonial and matchmaking platform based in Hyderabad, India. Our platform facilitates introductions between Muslim individuals and families seeking halal marriage proposals. InstaRishta is not a dating service. We operate as an introduction platform only and do not guarantee any matrimonial outcome.`,
  },
  {
    id: '3',
    title: 'Eligibility',
    list: [
      'You must be at least 18 years of age.',
      'You must be Muslim or seeking a Muslim spouse.',
      'You must not have been previously removed from InstaRishta for a terms violation.',
      'You must not have been convicted of a violent, sexual, or hate crime offence.',
      'You must provide truthful, accurate, and current information at all times.',
      'You must be acting in good faith for the purpose of a sincere marriage proposal.',
    ],
    footer: 'InstaRishta reserves the right to verify eligibility and remove users who do not meet these criteria.',
  },
  {
    id: '4',
    title: 'Account Registration & Security',
    body: `You may browse InstaRishta without an account. To access contact details, audio posts, or advanced features, you must register using a valid email address or Google account. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must notify us immediately at safety@instarishta.me if you suspect unauthorised use of your account. Each person may hold only one account. Creating duplicate or fake accounts is prohibited and will result in permanent removal.`,
  },
  {
    id: '5',
    title: 'Profile Content & Accuracy',
    items: [
      { subtitle: 'Truthful information', text: 'All profile details — including name, age, location, education, occupation, and family background — must be accurate and genuine. InstaRishta is not responsible for inaccuracies posted by users, but reserves the right to remove profiles that appear false or misleading.' },
      { subtitle: 'Photos', text: 'Photos uploaded must be recent, genuine, and of the profile subject only. Uploading images of other people without their consent is prohibited. Obscene, inappropriate, or edited photos that misrepresent appearance are not permitted.' },
      { subtitle: 'Contact details', text: 'Phone numbers and WhatsApp links submitted in biodatas must belong to you or your authorised family representative. Sharing third-party contact details without consent is prohibited.' },
      { subtitle: 'Profile review', text: 'InstaRishta manually reviews profiles before publication. We reserve the right to reject or remove any profile at our discretion without explanation.' },
    ],
  },
  {
    id: '6',
    title: 'Prohibited Conduct',
    body: 'Users must not:',
    list: [
      'Post false, misleading, defamatory, obscene, or offensive content',
      'Harass, intimidate, or threaten other users or their families',
      'Use the platform for any non-matrimonial purpose, including solicitation, advertising, or commercial promotion',
      'Scrape, copy, or harvest profile data using automated tools or manual bulk extraction',
      'Attempt to access other users\' accounts or private data without authorisation',
      'Post content that promotes violence, hatred, discrimination, or extremism',
      'Submit profiles on behalf of minors (under 18)',
      'Misrepresent your identity, marital status, religious background, or family situation',
      'Share contact details of others without their explicit consent',
      'Transmit malware, viruses, or any malicious code',
    ],
    footer: 'Violation of any prohibited conduct clause may result in immediate account suspension or permanent ban.',
  },
  {
    id: '7',
    title: 'Wali & Family-First Conduct',
    body: `InstaRishta encourages all interactions to involve a Wali (Islamic marriage guardian) or family representative. We strongly recommend that initial contact be facilitated through a parent, guardian, or elder family member. Users who receive inappropriate direct contact from other users should report it immediately. InstaRishta does not facilitate private messaging between unrelated men and women; contact is through family-controlled details provided in profiles.`,
  },
  {
    id: '8',
    title: 'Intellectual Property',
    body: `All content on InstaRishta — including our logo, design, text, channel content, and platform code — is the intellectual property of InstaRishta or its licensors. You may not reproduce, distribute, or create derivative works without written permission. User-submitted content (profile bios, photos) remains owned by the user, but by submitting it, you grant InstaRishta a non-exclusive, royalty-free licence to display it for matrimonial purposes on the platform.`,
  },
  {
    id: '9',
    title: 'Free Service & Payments',
    body: `Browsing profiles and accessing biodatas on InstaRishta is free of charge. Some premium features (e.g., highlighted profile listing) may be offered for a fee. Any paid features will be clearly marked with pricing before purchase. Payments are processed through secure third-party payment gateways. See our Refund Policy for cancellation and refund terms.`,
  },
  {
    id: '10',
    title: 'Disclaimer of Warranties',
    body: `InstaRishta provides the platform "as is" and "as available" without any warranty of any kind, express or implied. We do not warrant that profiles are accurate, complete, or represent individuals truthfully. We do not guarantee that use of the platform will result in a matrimonial alliance. We are not responsible for the conduct of any user on or off the platform. You assume full responsibility for evaluating potential matches and for all interactions with other users.`,
  },
  {
    id: '11',
    title: 'Limitation of Liability',
    body: `To the maximum extent permitted by applicable law, InstaRishta and its operators shall not be liable for any direct, indirect, incidental, special, or consequential damages arising from: (i) your use of or inability to use the platform; (ii) reliance on any profile information posted by users; (iii) any interaction or meeting with a user met through the platform; (iv) unauthorised access to your data. Our total liability to you for any claim arising from use of InstaRishta shall not exceed the amount paid by you to us in the 12 months preceding the claim, or ₹1,000 — whichever is greater.`,
  },
  {
    id: '12',
    title: 'Account Suspension & Termination',
    body: `InstaRishta reserves the right to suspend or permanently terminate your account without prior notice if you: breach these Terms; provide false information; engage in prohibited conduct; or if we reasonably believe your account poses a risk to other users or the platform. You may close your account at any time by contacting us at support@instarishta.me. Upon account closure, your profile will be removed within 48 hours and personal data deleted within 30 days per our Privacy Policy.`,
  },
  {
    id: '13',
    title: 'Reporting & Moderation',
    body: `Users can report fake profiles, abusive content, or policy violations using the report function or by emailing safety@instarishta.me. InstaRishta investigates all reports and aims to act within 48 hours. We maintain a zero-tolerance policy for: child safety violations (see Child Safety Policy), sexual harassment, fraudulent profiles, and scam activity.`,
  },
  {
    id: '14',
    title: 'Governing Law & Disputes',
    body: `These Terms are governed by the laws of India, including the Information Technology Act 2000 and its amendments. Any dispute arising from these Terms or use of InstaRishta shall be subject to the exclusive jurisdiction of the courts in Hyderabad, Telangana, India. We encourage users to first attempt to resolve disputes amicably by contacting us at support@instarishta.me.`,
  },
  {
    id: '15',
    title: 'Changes to Terms',
    body: `InstaRishta may update these Terms at any time. We will notify registered users by email or platform notice for material changes. The updated Terms will display a new "Last updated" date. Your continued use of InstaRishta after changes are posted constitutes your acceptance of the revised Terms. If you do not agree to the revised Terms, you must stop using the platform.`,
  },
  {
    id: '16',
    title: 'Contact Information',
    body: `For all Terms-related queries:\n\nEmail: support@instarishta.me\nWhatsApp: +91 888 666 7121\nAddress: InstaRishta, Hyderabad, Telangana — 500001, India\n\nFor urgent safety concerns: safety@instarishta.me`,
  },
];

export default function TocPage() {
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
          <h1 className="text-3xl font-extrabold tracking-[-0.02em] mb-2" style={{ color: '#141413' }}>Terms of Service</h1>
          <p className="text-sm" style={{ color: '#696969' }}>Last updated: 5 May 2026 &nbsp;·&nbsp; Effective: 1 January 2025</p>
        </div>

        {/* TOC */}
        <div className="bg-white rounded-[12px] p-7 mb-6" style={{ boxShadow: '0px 2px 8px rgba(0,0,0,0.06)' }}>
          <h2 className="text-sm font-bold uppercase tracking-[0.08em] mb-4" style={{ color: '#696969' }}>Table of Contents</h2>
          <ol className="flex flex-col gap-1.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#s${s.id}`} className="text-sm no-underline hover:underline" style={{ color: '#006241' }}>
                  {s.id}. {s.title}
                </a>
              </li>
            ))}
          </ol>
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
                        <span className="mt-[4px] flex-shrink-0 text-[#00754A]">—</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                )}

                {'footer' in s && s.footer && (
                  <p className="text-sm leading-relaxed mt-4 italic" style={{ color: '#696969' }}>{s.footer}</p>
                )}
              </section>
            ))}
          </div>

          <div className="mt-8 rounded-[12px] p-6 text-center" style={{ background: 'rgba(0,117,74,0.06)', border: '1px solid rgba(0,117,74,0.15)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: '#141413' }}>Questions about our terms?</p>
            <p className="text-sm mb-4" style={{ color: '#696969' }}>Our team is here to help.</p>
            <a href="mailto:support@instarishta.me" className="btn-brand" style={{ display: 'inline-flex' }}>
              support@instarishta.me
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
