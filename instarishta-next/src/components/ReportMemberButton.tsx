'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';

const ReportModal = dynamic(() => import('@/components/ReportModal'), { ssr: false });

/**
 * "Report this member" on a public /p/[slug] page.
 *
 * entityId is the slug, NOT the underlying account uuid — that uuid is
 * resolved server-side only and deliberately never sent to the client (see
 * resolveProfile in src/app/p/[slug]/page.tsx). An admin reviewing the
 * report queue can open /p/{slug} directly to see what was flagged.
 */
export default function ReportMemberButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="text-xs font-semibold shrink-0"
        style={{ color: 'rgba(255,255,255,0.55)' }}>
        🚩 Report
      </button>
      {open && (
        <ReportModal entityType="member" entityId={slug} label="this member" onClose={() => setOpen(false)} />
      )}
    </>
  );
}
