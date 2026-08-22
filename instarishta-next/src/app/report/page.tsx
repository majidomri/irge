import type { Metadata } from 'next';
import Link from 'next/link';
import ReportPageClient from './ReportPageClient';

export const metadata: Metadata = {
  title:       'Report Misuse or Abuse — InstaRishta',
  description: 'Report a fake profile, harassment, scam, or any other misuse on InstaRishta. Reviewed by our safety team.',
};

export default function ReportPage() {
  return (
    <div style={{ background: '#f2f0eb' }} className="min-h-screen px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm font-semibold no-underline mb-8 inline-block" style={{ color: '#00754A' }}>
          ← Back to Home
        </Link>

        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-4 text-[11px] font-bold uppercase tracking-[0.08em]"
            style={{ background: 'rgba(234,67,53,0.08)', color: '#EA4335', border: '1px solid rgba(234,67,53,0.2)' }}>
            Safety
          </div>
          <h1 className="text-3xl font-extrabold tracking-[-0.02em] mb-2" style={{ color: '#141413' }}>Report misuse or abuse</h1>
          <p className="text-sm" style={{ color: '#696969' }}>
            Tell us what happened. Reports are seen only by our safety team and reviewed promptly —
            child-safety concerns within 2 hours.
          </p>
        </div>

        <ReportPageClient />
      </div>
    </div>
  );
}
