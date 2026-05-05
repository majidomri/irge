import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Disclaimer & User Agreement' };

export default function DisclaimerPage() {
  return (
    <div style={{ background: '#f2f0eb' }} className="min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto bg-white rounded-[16px] p-10 md:p-14" style={{ boxShadow: '0px 4px 24px rgba(0,0,0,0.08)' }}>
        <Link href="/" className="text-sm font-semibold no-underline mb-8 inline-block" style={{ color: '#00754A' }}>← Back to Home</Link>

        <h1 className="text-3xl font-extrabold tracking-[-0.02em] mb-2" style={{ color: '#141413' }}>Disclaimer & User Agreement</h1>
        <p className="text-base mb-10" style={{ color: '#696969' }}>Matrimonial & Matchmaking Bureau Disclaimer, User Agreement, and End User Consent</p>

        <section className="mb-10 pb-10 border-b" style={{ borderColor: '#edebe9' }}>
          <h2 className="text-xl font-bold mb-4" style={{ color: '#141413' }}>Disclaimer</h2>
          <div className="flex flex-col gap-4 text-sm leading-relaxed" style={{ color: '#696969' }}>
            <p>This matrimonial and matchmaking service is a platform to facilitate introductions between individuals seeking potential life partners.</p>
            <p>We do not guarantee the accuracy of information provided by users, and users are encouraged to verify details independently.</p>
            <p>Users are responsible for their interactions with others on the platform, and we disclaim any liability arising from such interactions.</p>
          </div>
        </section>

        <section className="mb-10 pb-10 border-b" style={{ borderColor: '#edebe9' }}>
          <h2 className="text-xl font-bold mb-4" style={{ color: '#141413' }}>User Agreement</h2>
          <ul className="flex flex-col gap-3 text-sm leading-relaxed list-disc list-inside" style={{ color: '#696969' }}>
            <li>Users must provide accurate and genuine information while creating profiles on our platform.</li>
            <li>Respect for privacy is paramount; sharing personal contact information is at the user's discretion.</li>
            <li>Users agree to adhere to the laws and regulations governing matrimonial services in India.</li>
            <li>Our service is provided "as is," and no chargebacks are permitted. All transactions are final.</li>
            <li>Any disputes shall be resolved through negotiation or arbitration under the laws of the jurisdiction where the bureau operates.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold mb-4" style={{ color: '#141413' }}>End User Consent</h2>
          <div className="rounded-[12px] p-6 text-sm leading-relaxed flex flex-col gap-4" style={{ background: 'rgba(0,117,74,0.06)', border: '1.5px solid rgba(0,117,74,0.18)', color: '#696969' }}>
            <p>"I, <strong style={{ color: '#141413' }}>[Your Full Name]</strong>, hereby certify that the information provided in this form is accurate, truthful, and comprehensive in all respects. I commit to promptly informing InstaRishta Marriage Bureau of any changes in the information submitted above.</p>
            <p>I grant InstaRishta Marriage Bureau the authority to utilize the information for matrimonial purposes within the scope of the service. I undertake to maintain the confidentiality of any information provided to me by InstaRishta Marriage Bureau.</p>
            <p>I agree to notify InstaRishta Marriage Bureau promptly upon the occurrence of a marriage.</p>
            <p>In the event of any failure to arrange a matrimonial alliance, I absolve InstaRishta Marriage Bureau of any responsibility or liability. By submitting this form, I consent to undergoing a comprehensive criminal and background check conducted by InstaRishta Marriage Bureau.</p>
            <p>Enclosed herewith is a payment of <strong style={{ color: '#141413' }}>₹500</strong> towards my registration, which is <strong style={{ color: '#141413' }}>non-refundable</strong>."</p>
          </div>
        </section>

        <div className="pt-6 border-t text-center" style={{ borderColor: '#edebe9' }}>
          <button className="btn-brand">I Agree to Terms</button>
        </div>
      </div>
    </div>
  );
}
