import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Child Safety Policy — InstaRishta',
  description: 'InstaRishta\'s commitment to protecting minors and maintaining a safe matrimonial platform.',
};

export default function ChildSafetyPage() {
  return (
    <div style={{ background: '#f2f0eb' }} className="min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-sm font-semibold no-underline mb-8 inline-block" style={{ color: '#00754A' }}>
          ← Back to Home
        </Link>

        <div className="bg-white rounded-[16px] p-10 md:p-14 mb-6" style={{ boxShadow: '0px 4px 24px rgba(0,0,0,0.08)' }}>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-4 text-[11px] font-bold uppercase tracking-[0.08em]"
            style={{ background: 'rgba(234,67,53,0.08)', color: '#EA4335', border: '1px solid rgba(234,67,53,0.2)' }}>
            Safety Policy
          </div>
          <h1 className="text-3xl font-extrabold tracking-[-0.02em] mb-2" style={{ color: '#141413' }}>Child Safety Policy</h1>
          <p className="text-sm mb-0" style={{ color: '#696969' }}>Last updated: 5 May 2026 &nbsp;·&nbsp; Zero tolerance — no exceptions</p>
        </div>

        <div className="bg-white rounded-[16px] p-10 md:p-14" style={{ boxShadow: '0px 4px 24px rgba(0,0,0,0.08)' }}>
          <div className="flex flex-col gap-10">

            <section className="pb-10 border-b" style={{ borderColor: '#edebe9' }}>
              <h2 className="text-base font-bold mb-3" style={{ color: '#141413' }}>
                <span style={{ color: '#00754A' }}>1.</span> Our Commitment
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: '#696969' }}>
                InstaRishta is a Muslim matrimonial platform strictly for adults aged 18 and above. The safety of children and minors is our absolute, non-negotiable priority. We have zero tolerance for any content, behaviour, or activity that sexualises, exploits, endangers, or harms minors in any way. This policy applies to all users, profile submitters, channel administrators, and anyone who interacts with our platform.
              </p>
            </section>

            <section className="pb-10 border-b" style={{ borderColor: '#edebe9' }}>
              <h2 className="text-base font-bold mb-3" style={{ color: '#141413' }}>
                <span style={{ color: '#00754A' }}>2.</span> Minimum Age Requirement
              </h2>
              <p className="text-sm leading-relaxed mb-4" style={{ color: '#696969' }}>
                You must be at least <strong style={{ color: '#141413' }}>18 years of age</strong> to register, submit a profile, or use any feature of InstaRishta. This is a strict requirement with no exceptions.
              </p>
              <div className="rounded-[10px] p-5" style={{ background: 'rgba(234,67,53,0.04)', border: '1px solid rgba(234,67,53,0.15)' }}>
                <p className="text-sm font-semibold mb-1" style={{ color: '#EA4335' }}>Strict age enforcement</p>
                <p className="text-sm leading-relaxed" style={{ color: '#696969' }}>
                  If we detect or are informed that a user is under 18, their account and all associated data will be permanently deleted immediately. No warning will be given. Parents or guardians who discover their child has registered should contact us at safety@instarishta.me immediately.
                </p>
              </div>
            </section>

            <section className="pb-10 border-b" style={{ borderColor: '#edebe9' }}>
              <h2 className="text-base font-bold mb-3" style={{ color: '#141413' }}>
                <span style={{ color: '#00754A' }}>3.</span> Absolutely Prohibited Content
              </h2>
              <p className="text-sm leading-relaxed mb-4" style={{ color: '#696969' }}>The following are strictly prohibited and will result in immediate permanent ban and reporting to law enforcement:</p>
              <ul className="flex flex-col gap-3">
                {[
                  'Any content that sexualises, exploits, or depicts minors in any manner',
                  'Uploading images or videos of individuals under 18 without explicit guardian consent',
                  'Seeking or facilitating marriage proposals involving anyone under 18 years of age',
                  'Any attempt to contact, groom, or arrange meetings with minors',
                  'Child Sexual Abuse Material (CSAM) — zero tolerance, immediately reported to NCMEC and Indian law enforcement',
                  'Submitting a profile on behalf of a minor, even with parental consent',
                  'Sharing personal details of minors with any other platform user',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-relaxed" style={{ color: '#696969' }}>
                    <span className="flex-shrink-0 mt-[2px] w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: 'rgba(234,67,53,0.12)', color: '#EA4335' }}>✗</span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="pb-10 border-b" style={{ borderColor: '#edebe9' }}>
              <h2 className="text-base font-bold mb-3" style={{ color: '#141413' }}>
                <span style={{ color: '#00754A' }}>4.</span> How We Protect Minors
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { icon: '🔍', title: 'Profile Review', desc: 'All profiles are manually reviewed before going live. Profiles showing indicators of minor submission are rejected.' },
                  { icon: '🛡️', title: 'Age Verification', desc: 'Users must confirm they are 18+ during registration. Suspicious profiles trigger additional review.' },
                  { icon: '📣', title: 'Easy Reporting', desc: 'Any user can report a suspected minor profile with one click. Reports are reviewed within 2 hours.' },
                  { icon: '🚫', title: 'Immediate Action', desc: 'Confirmed minor accounts are deleted instantly and, where CSAM is involved, reported to authorities with no exceptions.' },
                  { icon: '🔒', title: 'Data Protection', desc: 'Personal data of anyone flagged as a minor is immediately quarantined and deleted per our Privacy Policy.' },
                  { icon: '👨‍👩‍👧', title: 'Family-First Design', desc: 'Our Wali-first contact model discourages direct minor-to-stranger interaction by design.' },
                ].map((item) => (
                  <div key={item.title} className="rounded-[10px] p-5" style={{ background: '#fafaf9', border: '1px solid #edebe9' }}>
                    <div className="text-xl mb-2">{item.icon}</div>
                    <p className="text-sm font-semibold mb-1" style={{ color: '#141413' }}>{item.title}</p>
                    <p className="text-sm leading-relaxed" style={{ color: '#696969' }}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="pb-10 border-b" style={{ borderColor: '#edebe9' }}>
              <h2 className="text-base font-bold mb-3" style={{ color: '#141413' }}>
                <span style={{ color: '#00754A' }}>5.</span> Reporting a Child Safety Concern
              </h2>
              <p className="text-sm leading-relaxed mb-5" style={{ color: '#696969' }}>
                If you encounter any content, profile, or behaviour on InstaRishta that may involve a minor or violate child safety, please report it immediately using any of the following:
              </p>
              <div className="flex flex-col gap-3">
                {[
                  { label: 'Emergency email', value: 'safety@instarishta.me', note: 'Response within 2 hours' },
                  { label: 'WhatsApp', value: '+91 888 666 7121', note: 'For urgent reports' },
                  { label: 'National Cybercrime Portal (India)', value: 'cybercrime.gov.in', note: 'Government reporting for CSAM' },
                  { label: 'NCMEC CyberTipline (global)', value: 'missingkids.org/gethelpnow/cybertipline', note: 'For international reports' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-4 rounded-[10px] p-4" style={{ background: '#fafaf9', border: '1px solid #edebe9' }}>
                    <div className="flex-1">
                      <p className="text-xs font-bold uppercase tracking-[0.06em] mb-0.5" style={{ color: '#696969' }}>{item.label}</p>
                      <p className="text-sm font-semibold" style={{ color: '#141413' }}>{item.value}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(0,117,74,0.08)', color: '#006241' }}>{item.note}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="pb-10 border-b" style={{ borderColor: '#edebe9' }}>
              <h2 className="text-base font-bold mb-3" style={{ color: '#141413' }}>
                <span style={{ color: '#00754A' }}>6.</span> Law Enforcement Cooperation
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: '#696969' }}>
                InstaRishta cooperates fully with law enforcement agencies, including the Telangana Cyber Crime Police, Indian Computer Emergency Response Team (CERT-In), and international agencies, in all investigations related to child safety. Where Child Sexual Abuse Material (CSAM) is identified, we are legally required to report it to the appropriate authorities and will do so without delay. We preserve relevant data for law enforcement requests per applicable legal requirements.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold mb-3" style={{ color: '#141413' }}>
                <span style={{ color: '#00754A' }}>7.</span> Our Islamic Responsibility
              </h2>
              <div className="rounded-[12px] p-6" style={{ background: 'rgba(0,117,74,0.06)', border: '1px solid rgba(0,117,74,0.15)' }}>
                <p className="font-arab text-xl text-center mb-3" style={{ color: '#cba258' }}>وَقُل لِّلْمُؤْمِنَاتِ يَغْضُضْنَ مِنْ أَبْصَارِهِنَّ</p>
                <p className="text-sm leading-relaxed text-center" style={{ color: '#696969' }}>
                  InstaRishta is built on Islamic principles of modesty, family honour, and protection of the vulnerable. Protecting children is a fundamental Islamic obligation. We take this responsibility seriously and will take every measure — technological, legal, and community-based — to ensure no minor is ever harmed through our platform. May Allah protect our children and the Muslim Ummah. Ameen.
                </p>
              </div>
            </section>

          </div>
        </div>

        {/* Emergency CTA */}
        <div className="mt-6 rounded-[12px] p-7 text-center" style={{ background: '#1E3932' }}>
          <p className="text-white font-bold text-base mb-2">Seen something unsafe?</p>
          <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.65)' }}>Report it immediately. We investigate all reports within 2 hours.</p>
          <a href="mailto:safety@instarishta.me"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm"
            style={{ background: '#EA4335', color: '#fff' }}>
            🚨 Report Now — safety@instarishta.me
          </a>
        </div>
      </div>
    </div>
  );
}
