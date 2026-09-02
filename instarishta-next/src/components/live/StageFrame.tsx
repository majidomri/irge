'use client';

import Image from 'next/image';
import { BRAND, STAGE, THEME, ZONES } from '@/lib/live-config';

/**
 * The parts of the frame that are not the content: the ground it is painted
 * on, the wordmark at the top, the name set down the right edge.
 *
 * These were inline in LiveStage until the frames had to be captured as
 * stills for the site's stories feed. Two copies of a gradient is how the
 * published images start drifting from the show they are supposed to be
 * stills OF, so the chrome lives here and both the live stage and the
 * capture route draw it from this file.
 */

/**
 * Aubergine ground, warm bloom, tile pattern -- and on the biodata beats the
 * profile's own photograph behind it, heavily blurred and scrimmed, so the
 * pages read as the same object as the portrait rather than a cut to a flat
 * slide.
 */
export function StageGround({ photo }: { photo?: string }) {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 62% at 50% 6%, ${THEME.raise} 0%, ${THEME.ground} 56%, ${THEME.ground2} 100%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: "url('https://www.svgbackgrounds.com/uploads/arabic-style-tiles.svg')",
          backgroundSize: '420px',
        }}
      />

      {photo && (
        <div className="absolute inset-0" aria-hidden>
          <Image
            key={photo}
            src={photo}
            alt=""
            fill
            sizes="1080px"
            className="object-cover object-center"
            style={{ filter: 'blur(70px) saturate(1.2)', transform: 'scale(1.2)', opacity: 0.3 }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, rgba(21,7,24,0.5) 0%, rgba(21,7,24,0.86) 44%, ${THEME.ground} 82%)`,
            }}
          />
        </div>
      )}
    </>
  );
}

/**
 * The header band and its wordmark.
 *
 * `animate` is false when the frame is being captured as a still: the mark's
 * entrance and its slow shine are lovely on air and are exactly the sort of
 * thing that makes two screenshots of the same frame differ.
 */
export function StageHeader({ animate = true }: { animate?: boolean }) {
  return (
    <div
      className="absolute inset-x-0 flex items-center"
      style={{
        top: 0,
        height: ZONES.header.h,
        paddingTop: ZONES.headerPadTop,
        paddingLeft: ZONES.gutter,
        paddingRight: ZONES.gutter,
        zIndex: 20,
        background: 'linear-gradient(to bottom, rgba(21,7,24,0.92) 34%, rgba(21,7,24,0.55) 68%, transparent)',
        pointerEvents: 'none',
      }}
    >
      <style>{`
        @keyframes ir-mark-in { 0% { opacity:0; transform: translateY(-14px); } 100% { opacity:1; transform: translateY(0); } }
        @keyframes ir-mark-shine {
          0%, 62%, 100% { background-position: 220% 0; }
          80%           { background-position: -40% 0; }
        }
      `}</style>
      <div
        style={{
          fontFamily: THEME.display,
          fontWeight: 800,
          fontSize: 56,
          letterSpacing: '-0.035em',
          animation: animate ? 'ir-mark-in 620ms cubic-bezier(0.22,1,0.36,1) both' : undefined,
        }}
      >
        <span style={{ color: THEME.cream }}>{BRAND.wordmarkA}</span>
        {/* The gold half carries a slow shine, so the mark is alive on
            screen for the whole segment without ever pulling focus. */}
        <span
          style={{
            background: `linear-gradient(100deg, ${THEME.gold} 38%, #FFF0C4 50%, ${THEME.gold} 62%)`,
            backgroundSize: '260% 100%',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            // Held at the resting position for a still, so every capture
            // catches the mark at the same point in the sweep.
            backgroundPosition: animate ? undefined : '220% 0',
            animation: animate ? 'ir-mark-shine 7s ease-in-out infinite' : undefined,
          }}
        >
          {BRAND.wordmarkB}
        </span>
        <span style={{ color: THEME.muted }}>{BRAND.wordmarkC}</span>
      </div>
    </div>
  );
}

/**
 * Who is on screen, set vertically down the right edge beside the wordmark.
 * It costs no horizontal room in the content column, so the biodata gets the
 * whole frame instead of a band at the bottom.
 */
export function StageNameRail({ name }: { name?: string }) {
  if (!name) return null;
  return (
    <div
      className="absolute"
      style={{
        right: 14,
        top: ZONES.header.h + 24,
        writingMode: 'vertical-rl',
        fontFamily: THEME.mono,
        fontSize: 22,
        fontWeight: 600,
        letterSpacing: '0.26em',
        textTransform: 'uppercase',
        color: THEME.gold,
        opacity: 0.72,
        whiteSpace: 'nowrap',
        textShadow: '0 2px 12px rgba(0,0,0,0.7)',
        zIndex: 22,
        pointerEvents: 'none',
      }}
    >
      {name}
    </div>
  );
}

/** The hairline that closes the content column off from the host band. */
export function StageHostRule() {
  return (
    <div className="absolute inset-x-0" style={{ top: ZONES.hostBand.y }}>
      <div
        style={{
          height: 1,
          background: THEME.goldDim,
          marginLeft: ZONES.gutter,
          marginRight: ZONES.gutter,
        }}
      />
    </div>
  );
}

/** Stage-sized box with the ground already painted. Nothing scales it. */
export function StageSurface({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        width: STAGE.width,
        height: STAGE.height,
        position: 'relative',
        overflow: 'hidden',
        background: THEME.ground,
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
