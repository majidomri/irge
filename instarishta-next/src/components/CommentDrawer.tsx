'use client';
import { useEffect } from 'react';
import CommentSection from './CommentSection';

/**
 * Comment drawer for the in-feed post viewer (channels/[slug]'s PostModal)
 * and the story viewer. Rendered as a sibling overlay on top of them rather
 * than reworked into their fixed no-scroll layouts — same "stack a modal on a
 * modal" approach as ReportModal over BiodataModal.
 *
 * Two shapes:
 *
 *  - **Narrow viewports**: a bottom sheet, the native-feeling gesture target
 *    on a phone.
 *  - **Wide viewports**: a full-height panel docked beside the content, the
 *    way YouTube docks comments next to a Short — the post stays visible and
 *    readable instead of being covered.
 *
 * `stageWidth` is what the panel docks against. The post viewer draws itself
 * as a 480px column centred in a black backdrop, so docking to the *viewport*
 * edge left a wide gap between the post and the comments; the panel has to
 * start at the column's edge instead. The story viewer is full-bleed, so for
 * it the viewport edge already is the content edge — pass nothing and the
 * panel sits flush right.
 *
 * The docked layout needs room for the stage plus the panel side by side, so
 * it only turns on at >= 1280px. Between that and phone width there is no
 * honest way to place a 400px panel beside a 480px column, so those viewports
 * keep the bottom sheet.
 */

/** Width of the docked panel, and the breakpoint that can accommodate it. */
const PANEL_W = 400;
/** Breathing room between the post and the panel — flush against the post
 *  edge read as one merged slab on a dark backdrop. */
const GAP = 20;
const DOCK_MIN = 1280 + GAP;

export default function CommentDrawer({
  entityId, entityType = 'post', onClose, stageWidth,
}: {
  entityId: string;
  entityType?: 'post' | 'story';
  onClose: () => void;
  /** Width of the centred content column to dock against. Omit for full-bleed. */
  stageWidth?: number;
}) {
  // Escape closes the drawer. PostModal also handles Escape, but this listener
  // is registered later and stops propagation, so the drawer closes first and
  // the post stays open — one Escape per layer, which is what people expect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Anchored to the stage's right edge rather than the viewport's. Written as
  // a media query in a <style> tag because the offset depends on a runtime
  // prop, which Tailwind's compile-time `xl:` variants cannot express.
  const dockCss = `
    @media (min-width: ${DOCK_MIN}px) {
      .ir-cd-wrap { align-items: stretch; }
      .ir-cd-panel {
        position: absolute;
        ${stageWidth
          ? `top: ${GAP}px; bottom: ${GAP}px; left: calc(50% + ${stageWidth / 2 + GAP}px); border-radius: 16px;`
          : 'top: 0; bottom: 0; right: 0; border-radius: 0;'}
        width: ${PANEL_W}px;
        max-width: calc(100vw - ${stageWidth ? stageWidth + GAP * 2 : 0}px);
        max-height: 100%;
      }
    }
  `;

  return (
    <div className="ir-cd-wrap fixed inset-0 z-[300] flex items-end justify-center">
      <style>{dockCss}</style>

      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onClose} />

      <section
        className="ir-cd-panel relative z-[1] flex flex-col overflow-hidden
                   w-full max-w-[480px] max-h-[80vh] rounded-t-3xl"
        style={{ background: '#141413' }}
      >
        <div className="px-5 pt-4 pb-3 flex items-center justify-between shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-sm font-extrabold text-white">Comments</h2>
          <button onClick={onClose}
            aria-label="Close comments"
            className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>×</button>
        </div>

        {/* CommentSection owns the scrolling in fill mode: only its thread
            scrolls, so the composer stays pinned to the panel's bottom edge. */}
        <div className="flex-1 min-h-0 flex flex-col">
          <CommentSection entityType={entityType} entityId={entityId} fill />
        </div>
      </section>
    </div>
  );
}
