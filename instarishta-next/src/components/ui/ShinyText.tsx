'use client';
import React, { useCallback, useState } from 'react';

/**
 * A shine sweeping across text.
 *
 * This used motion/react — useAnimationFrame writing a motion value into
 * backgroundPosition on every frame. That was 43.4 KB gzipped of animation
 * engine in the first load of all 25 routes, because this renders the wordmark
 * in the Navbar and the Navbar is in the root layout. Every page on the site
 * paid for it whether or not anything else animated.
 *
 * It is a linear loop of one background-position, which is what a CSS keyframe
 * is for. Same effect, no engine, and it inherits the prefers-reduced-motion
 * block in globals.css for free — the JS version could not.
 *
 * The props are unchanged, including the ones the Navbar does not use, so this
 * is a drop-in:
 *   yoyo          → animation-direction: alternate
 *   direction     → reverse, rather than swapping the keyframe
 *   delay         → animation-delay
 *   pauseOnHover  → animation-play-state
 *   disabled      → no animation at all
 */
interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
  color?: string;
  shineColor?: string;
  spread?: number;
  yoyo?: boolean;
  pauseOnHover?: boolean;
  direction?: 'left' | 'right';
  delay?: number;
}

const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  disabled = false,
  speed = 2,
  className = '',
  color = '#b5b5b5',
  shineColor = '#ffffff',
  spread = 120,
  yoyo = false,
  pauseOnHover = false,
  direction = 'left',
  delay = 0,
}) => {
  const [isPaused, setIsPaused] = useState(false);

  const handleMouseEnter = useCallback(() => { if (pauseOnHover) setIsPaused(true); }, [pauseOnHover]);
  const handleMouseLeave = useCallback(() => { if (pauseOnHover) setIsPaused(false); }, [pauseOnHover]);

  // The JS version stepped 150% → -50% over `speed` seconds and, with a delay,
  // held at the end for `delay` before restarting. animation-delay only delays
  // the first run, so the hold is folded into the duration instead and the
  // keyframe reaches its end early.
  const style: React.CSSProperties = {
    backgroundImage:
      `linear-gradient(${spread}deg, ${color} 0%, ${color} 35%, ${shineColor} 50%, ${color} 65%, ${color} 100%)`,
    backgroundSize: '200% auto',
    backgroundPosition: '150% center',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };

  if (!disabled) {
    style.animationName = 'ir-shine';
    style.animationDuration = `${speed}s`;
    style.animationTimingFunction = 'linear';
    style.animationIterationCount = 'infinite';
    style.animationDirection = yoyo
      ? (direction === 'right' ? 'alternate-reverse' : 'alternate')
      : (direction === 'right' ? 'reverse' : 'normal');
    if (delay) style.animationDelay = `${delay}s`;
    if (isPaused) style.animationPlayState = 'paused';
  }

  return (
    <span
      className={`inline-block ${className}`}
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {text}
    </span>
  );
};

export default ShinyText;
