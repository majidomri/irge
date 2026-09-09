'use client';
/**
 * The media track behind the post viewer — a story stack, built the way
 * Telegram builds one.
 *
 * ── What this replaces, and why ──────────────────────────────────────────────
 * The previous viewer rendered exactly ONE post and tried to hide the cost by
 * firing thirty `fetch()` warm-ups ahead of it. That is the right instinct
 * solving the wrong problem, and on a phone it backfires twice: thirty requests
 * compete with the image the reader is actually waiting on, and every advance
 * still creates a brand-new `<img>` that has to be decoded before it can paint.
 * Desktop wifi hides both. A 4G phone does not.
 *
 * Telegram's own story viewer (telegram-tt, StorySlides) keeps a WINDOW of
 * slides in the DOM — `index - 4` to `index + 5` — and moves between them by
 * writing CSS custom properties that drive a `translate3d`. It does no manual
 * preloading at all, because it does not need any: the neighbours are real
 * `<img>` elements already in the tree, so the browser fetches, decodes and
 * rasterises them on its own schedule, at its own priority, while the reader
 * is looking at the current one. Advancing is then a compositor transform on
 * an image that is already decoded — no network, no decode, no layout.
 *
 * That is what this does. The thirty-fetch warm-up is deleted, not tuned.
 *
 * ── Frames are flattened ─────────────────────────────────────────────────────
 * A listing can be several images (a long biodata split across pages). Rather
 * than nest a carousel inside a stack — two axes, two sets of edge cases — the
 * whole channel is flattened into one sequence of frames and the stack walks
 * it. "Next" means the next page of this biodata, and at the end of it, the
 * first page of the next listing. One direction, one meaning, which is exactly
 * how the keyboard already behaved.
 *
 * ── No auto-advance ──────────────────────────────────────────────────────────
 * Deliberate, and the main way this differs from a social story. These frames
 * are biodata — Urdu prose, education, family detail. A five-second timer would
 * yank the page away mid-sentence. A frame stays until the reader moves it, and
 * the progress pips show position only; they never fill on a clock.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isOptimizable, optimized } from '@/lib/img';

/** Slides kept live either side of the current frame. */
const WINDOW = 2;

/** Telegram's own vertical-dismiss threshold (StorySlides: SWIPE_Y_THRESHOLD). */
const SWIPE_Y_THRESHOLD = 50;

/** Past this, a drag is a horizontal move rather than a vertical dismiss. */
const SWIPE_X_THRESHOLD = 40;

export interface StoryFrame {
  /** Which listing this frame belongs to — consecutive frames share it. */
  postId: string;
  /** Index of that listing in the parent's list, for reporting position back. */
  postIndex: number;
  /** Which page of that listing this is. */
  frameIndex: number;
  /** How many pages the listing has, for the progress pips. */
  frameCount: number;
  /**
   * Null for a listing with no image of its own — a text-only biodata, or an
   * audio one. Those still occupy a slide: skipping them would make the
   * sequence jump silently over listings that exist. The parent draws them.
   */
  url: string | null;
  alt: string;
}

export interface StoryStackProps {
  frames: StoryFrame[];
  /** Index into `frames`. Controlled by the parent so deep links still work. */
  index: number;
  onIndexChange: (next: number) => void;
  /** Swipe down, or tap the backdrop. */
  onDismiss: () => void;
  /** Called when the reader nears the end, so the parent can page in more. */
  onNeedMore?: () => void;
  /**
   * Draws a slide with no image — text and audio listings. Handed the frame so
   * the parent can look the listing back up and render it however it likes.
   */
  renderSlide?: (frame: StoryFrame) => React.ReactNode;
}

export default function StoryStack({
  frames, index, onIndexChange, onDismiss, onNeedMore, renderSlide,
}: StoryStackProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Frames whose bytes have decoded. A slide paints only once it is in here,
  // so a half-decoded image never flashes on screen mid-transition.
  const [ready, setReady] = useState<Set<string>>(new Set());
  // Live finger offset in px. Null while not dragging, so a released drag
  // hands control back to the CSS transition rather than fighting it.
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const touch = useRef({ x: 0, y: 0, axis: '' as '' | 'x' | 'y' });

  const current = frames[index];

  // The live window. Everything outside it is unmounted, which is what keeps
  // a 93-listing channel from holding 93 decoded bitmaps.
  const slides = useMemo(() => {
    const out: { frame: StoryFrame; at: number }[] = [];
    for (let i = index - WINDOW; i <= index + WINDOW; i++) {
      if (frames[i]) out.push({ frame: frames[i], at: i });
    }
    return out;
  }, [frames, index]);

  const go = useCallback((next: number) => {
    if (next < 0 || next >= frames.length) return;
    onIndexChange(next);
  }, [frames.length, onIndexChange]);

  // Page in more listings before the reader reaches the end, not on arrival.
  useEffect(() => {
    if (onNeedMore && index >= frames.length - 4) onNeedMore();
  }, [index, frames.length, onNeedMore]);

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
      else if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go, onDismiss]);

  // ── Touch ──────────────────────────────────────────────────────────────────
  // The axis is decided once per gesture and then held. Without that lock a
  // diagonal drag flickers between advancing and dismissing.
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, axis: '' };
    setDrag({ x: 0, y: 0 });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;

    if (!touch.current.axis) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        touch.current.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
    }
    if (touch.current.axis === 'x') setDrag({ x: dx, y: 0 });
    // Downward only: an upward drag on a story means nothing here.
    else if (touch.current.axis === 'y') setDrag({ x: 0, y: Math.max(0, dy) });
  };

  const onTouchEnd = () => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (touch.current.axis === 'y' && d.y > SWIPE_Y_THRESHOLD) { onDismiss(); return; }
    if (touch.current.axis === 'x') {
      if (d.x < -SWIPE_X_THRESHOLD) go(index + 1);
      else if (d.x > SWIPE_X_THRESHOLD) go(index - 1);
    }
  };

  if (!current) return null;

  // Dismiss gesture fades and shrinks the whole stack, the way closing a story
  // does — feedback that the drag is doing something before it commits.
  const dismissProgress = drag ? Math.min(1, drag.y / 240) : 0;

  return (
    <div
      className="absolute inset-0 overflow-hidden select-none"
      style={{
        opacity: 1 - dismissProgress * 0.6,
        transform: `scale(${1 - dismissProgress * 0.12}) translate3d(0, ${drag?.y ?? 0}px, 0)`,
        transition: drag ? 'none' : 'transform 220ms cubic-bezier(.22,.61,.36,1), opacity 220ms',
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Progress pips ────────────────────────────────────────────────────
          Position within the CURRENT listing only, so a 4-page biodata reads as
          4 segments. They fill on arrival, never on a timer — there is no
          timer. */}
      {current.frameCount > 1 && (
        <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 px-3 pt-3">
          {Array.from({ length: current.frameCount }, (_, i) => (
            <div key={i} className="h-[3px] flex-1 rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.28)' }}>
              <div className="h-full rounded-full"
                style={{
                  width: i <= current.frameIndex ? '100%' : '0%',
                  background: '#fff',
                  transition: 'width 200ms ease',
                }} />
            </div>
          ))}
        </div>
      )}

      {/* ── The track ────────────────────────────────────────────────────────
          One transform for the whole strip. Moving between frames never
          touches layout or paint — only the compositor — which is why this
          stays smooth on a phone where re-rendering a slide would not. */}
      <div
        ref={trackRef}
        className="absolute inset-0 flex"
        style={{
          transform: `translate3d(calc(${-index * 100}% + ${drag?.x ?? 0}px), 0, 0)`,
          transition: drag ? 'none' : 'transform 260ms cubic-bezier(.22,.61,.36,1)',
          willChange: 'transform',
        }}
      >
        {slides.map(({ frame, at }) => {
          const src = frame.url
            ? (isOptimizable(frame.url) ? optimized(frame.url, 1080) : frame.url)
            : null;
          // A parent-drawn slide has no bitmap to wait on.
          const isReady = src ? ready.has(src) : true;
          return (
            <div
              key={`${frame.postId}-${frame.frameIndex}`}
              className="absolute inset-0 flex items-center justify-center"
              // Positioned by index so the strip stays sparse: only the window
              // is mounted, but each slide sits at its true offset.
              style={{ transform: `translate3d(${at * 100}%, 0, 0)` }}
            >
              {!src && renderSlide?.(frame)}
              {src && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={src}
                alt={frame.alt}
                // Neighbours are fetched by the browser at its own priority —
                // that is the whole point of keeping them in the DOM. Only the
                // frame on screen is eager.
                loading={at === index ? 'eager' : 'lazy'}
                fetchPriority={at === index ? 'high' : 'low'}
                decoding="async"
                draggable={false}
                onLoad={(e) => {
                  // decode() resolves once the bitmap is ready to paint. Until
                  // then the slide stays transparent, so an advance never
                  // reveals a half-drawn frame.
                  const img = e.currentTarget;
                  // Keyed on the URL actually requested, not the raw one — the
                  // optimizer rewrites it, and that is what lands in cache.
                  const done = () => setReady(prev => prev.has(src) ? prev : new Set(prev).add(src));
                  if (typeof img.decode === 'function') img.decode().then(done).catch(done);
                  else done();
                }}
                className="max-h-full max-w-full object-contain"
                style={{ opacity: isReady ? 1 : 0, transition: 'opacity 140ms ease' }}
              />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Tap zones ────────────────────────────────────────────────────────
          Left third back, right two-thirds forward — the story convention, and
          it means a thumb on the right edge of a phone advances without
          stretching. Kept under the pips and above the image. */}
      <button
        aria-label="Previous"
        className="absolute inset-y-0 left-0 z-10 w-1/3 cursor-default"
        style={{ background: 'transparent' }}
        onClick={() => go(index - 1)}
      />
      <button
        aria-label="Next"
        className="absolute inset-y-0 right-0 z-10 w-2/3 cursor-default"
        style={{ background: 'transparent' }}
        onClick={() => go(index + 1)}
      />
    </div>
  );
}

/**
 * Flatten listings into the single frame sequence the stack walks.
 *
 * `image` is the cover and `images` is the carousel, and whether the cover is
 * also `images[0]` depends on who wrote the row — the importer writes the full
 * set with the cover first, so a plain concat showed page one twice and
 * counted "1 / 4" on a three-page biodata. Deduped here, once, rather than at
 * every call site.
 */
export function buildFrames<T extends { id: string; image?: string | null; images?: unknown; title?: string | null }>(
  posts: T[],
): StoryFrame[] {
  const out: StoryFrame[] = [];
  posts.forEach((p, postIndex) => {
    const urls = [...new Set(
      [p.image, ...(Array.isArray(p.images) ? (p.images as unknown[]) : [])]
        .filter((v): v is string => typeof v === 'string' && Boolean(v)),
    )];
    // A listing with nothing to show still gets exactly one slide, or the
    // sequence would skip straight past it.
    const pages: (string | null)[] = urls.length ? urls : [null];
    pages.forEach((url, frameIndex) => {
      out.push({
        postId: p.id,
        postIndex,
        frameIndex,
        frameCount: pages.length,
        url,
        alt: pages.length > 1
          ? `${p.title ?? 'Rishta listing'} — page ${frameIndex + 1} of ${pages.length}`
          : (p.title ?? 'Rishta listing'),
      });
    });
  });
  return out;
}
