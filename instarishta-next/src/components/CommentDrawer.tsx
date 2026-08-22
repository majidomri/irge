'use client';
import CommentSection from './CommentSection';

/**
 * Bottom-sheet wrapper around CommentSection for the in-feed post viewer
 * (channels/[slug]'s full-screen PostModal). Rendered as a sibling overlay
 * on top of PostModal rather than reworked into its fixed no-scroll layout —
 * same "stack a modal on a modal" approach as ReportModal over BiodataModal.
 */
export default function CommentDrawer({
  entityId, onClose,
}: {
  entityId: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onClose} />
      <section className="relative w-full rounded-t-3xl overflow-hidden"
        style={{ background: '#141413', zIndex: 1, maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>

        <div className="px-5 pt-4 pb-3 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-sm font-extrabold text-white">Comments</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>×</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <CommentSection entityType="post" entityId={entityId} />
        </div>
      </section>
    </div>
  );
}
