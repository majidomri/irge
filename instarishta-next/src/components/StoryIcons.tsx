'use client';
import { useEffect, useRef } from 'react';

/**
 * Story / post action icons — copied verbatim from the Xavio story
 * template registry so both apps draw the same glyphs:
 *
 *   - Like / Share         : src/components/viewer/story-icons.tsx
 *   - Comment              : public/icons/brand/Comments.svg (BrandIcon
 *                            "Comments"), inlined here as paths rather
 *                            than mask-image — InstaRishta has no
 *                            /icons/brand asset bundle, and the viewer
 *                            chrome is a hot surface where a per-icon
 *                            network fetch would show as a pop-in.
 *
 * All of them ride `currentColor`, so tone is set by the parent button
 * (white by default, pink for a liked story).
 */

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
  filled?: boolean;
}

function svgProps(size: number, className?: string) {
  return {
    xmlns: 'http://www.w3.org/2000/svg',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    'aria-hidden': true as const,
    className,
  };
}

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function LikeIcon({ size = 26, className, strokeWidth = 1.8, filled }: IconProps) {
  return (
    <svg {...svgProps(size, className)} {...strokeProps} fill={filled ? 'currentColor' : 'none'} strokeWidth={strokeWidth}>
      <path d="M12 21s-7.5-4.6-9.6-9.5C1 8.2 3.7 4.7 7.4 4.7c2 0 3.6 1 4.6 2.6 1-1.6 2.6-2.6 4.6-2.6 3.7 0 6.4 3.5 5 6.8C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

/** Speech bubble with three dots — the canonical Xavio "Comments" glyph.
 *  Solid-fill artwork on a 32-unit grid, so it keeps its own viewBox. */
export function CommentIcon({ size = 26, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M4,28a.84.84,0,0,1-.38-.08A1,1,0,0,1,3,27V8.78A4.89,4.89,0,0,1,8,4H24a4.89,4.89,0,0,1,5,4.78v9.44A4.89,4.89,0,0,1,24,23H9.41l-4.7,4.71A1,1,0,0,1,4,28ZM8,6A2.9,2.9,0,0,0,5,8.78V24.59l3.29-3.3A1,1,0,0,1,9,21H24a2.9,2.9,0,0,0,3-2.78V8.78A2.9,2.9,0,0,0,24,6Z" />
      <circle cx="16" cy="13.5" r="1.5" />
      <circle cx="21.5" cy="13.5" r="1.5" />
      <circle cx="10.5" cy="13.5" r="1.5" />
    </svg>
  );
}

export function ShareIcon({ size = 26, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...svgProps(size, className)} {...strokeProps} strokeWidth={strokeWidth}>
      <path d="M22 2 11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </svg>
  );
}

// Xavio's ReplyIcon (the curved back-arrow) is deliberately NOT ported.
// It maps to a private reply thread, which InstaRishta has no equivalent
// for — the comment chips are the only sanctioned way to reach a poster.

/** Not part of the Xavio bar — InstaRishta's owner-only "who watched"
 *  affordance, drawn in the same outline weight so it sits in the row
 *  without looking borrowed from another set. */
export function ViewersIcon({ size = 26, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...svgProps(size, className)} {...strokeProps} strokeWidth={strokeWidth}>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

/**
 * 48 px tap target (Material minimum), same active-state feedback as the
 * Xavio `ActionButton`. `tone="pink"` is the liked state.
 */
/**
 * An action button that keeps its press to itself.
 *
 * These sit in a row down the RIGHT edge of both the story viewer and the post
 * modal, and both of those treat a tap on the right as "next". So tapping
 * Comment advanced first and opened the drawer second -- on the item you had
 * just been moved to. Same symptom in stories and in posts, one cause.
 *
 * The listeners are attached natively rather than through React's props
 * because React binds at the root container: by the time a synthetic handler
 * runs, a native listener on an ancestor (zuck.js's viewer) has already seen
 * the event and advanced. Only a listener on the button itself gets there
 * first.
 *
 * pointerdown/touchstart/mousedown are all covered because the two viewers do
 * not agree on which they navigate from, and passive:false is required to keep
 * the option of preventDefault on touch.
 */
export function StoryActionButton({
  onClick,
  ariaLabel,
  children,
  tone = 'white',
  disabled,
}: {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  ariaLabel: string;
  children: React.ReactNode;
  tone?: 'white' | 'pink';
  disabled?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const swallow = (e: Event) => e.stopPropagation();
    const events = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'];
    for (const name of events) el.addEventListener(name, swallow, { passive: false });
    return () => { for (const name of events) el.removeEventListener(name, swallow); };
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`h-12 w-12 grid place-items-center border-0 bg-transparent cursor-pointer transition-all active:opacity-70 active:scale-95 disabled:opacity-50 ${
        tone === 'pink' ? 'text-pink-500' : 'text-white'
      }`}
    >
      {children}
    </button>
  );
}
