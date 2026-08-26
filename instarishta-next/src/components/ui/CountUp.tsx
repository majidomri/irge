'use client';
import { useInView, useMotionValue, useSpring } from 'motion/react';
import { useCallback, useEffect, useRef } from 'react';

interface CountUpProps {
  to: number;
  from?: number;
  direction?: 'up' | 'down';
  delay?: number;
  duration?: number;
  className?: string;
  startWhen?: boolean;
  separator?: string;
  onStart?: () => void;
  onEnd?: () => void;
}

export default function CountUp({
  to,
  from = 0,
  direction = 'up',
  delay = 0,
  duration = 1.5,
  className = '',
  startWhen = true,
  separator = '',
  onStart,
  onEnd,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(direction === 'down' ? to : from);

  const damping = 20 + 40 * (1 / duration);
  const stiffness = 100 * (1 / duration);

  const springValue = useSpring(motionValue, { damping, stiffness });
  const isInView = useInView(ref, { once: true, margin: '0px' });

  const getDecimalPlaces = (num: number) => {
    const str = num.toString();
    if (str.includes('.')) {
      const decimals = str.split('.')[1];
      if (parseInt(decimals) !== 0) return decimals.length;
    }
    return 0;
  };

  const maxDecimals = Math.max(getDecimalPlaces(from), getDecimalPlaces(to));

  const formatValue = useCallback((latest: number) => {
    const options: Intl.NumberFormatOptions = {
      useGrouping: !!separator,
      minimumFractionDigits: maxDecimals > 0 ? maxDecimals : 0,
      maximumFractionDigits: maxDecimals > 0 ? maxDecimals : 0,
    };
    const formatted = Intl.NumberFormat('en-US', options).format(latest);
    return separator ? formatted.replace(/,/g, separator) : formatted;
  }, [maxDecimals, separator]);

  // The value the counter settles on. Rendered as real children so the number
  // is present in the SSR HTML — previously this span shipped empty and was
  // filled only from an effect, so the stat bar read blank until hydration and
  // stayed blank forever whenever the observer below never fired.
  const endValue   = direction === 'down' ? from : to;
  const startValue = direction === 'down' ? to : from;

  // Animation only ever runs client-side. Until it starts (and if it never
  // does) React's own children stand as the rendered value.
  const animating = useRef(false);

  useEffect(() => {
    if (!isInView || !startWhen) return;
    if (typeof onStart === 'function') onStart();

    const t1 = setTimeout(() => {
      // Rewind to the start only at the moment we actually begin animating, so
      // a counter that is never scrolled into view keeps showing its real value.
      animating.current = true;
      if (ref.current) ref.current.textContent = formatValue(startValue);
      motionValue.jump(startValue);
      motionValue.set(endValue);
    }, delay * 1000);

    const t2 = setTimeout(() => {
      animating.current = false;
      if (ref.current) ref.current.textContent = formatValue(endValue);
      if (typeof onEnd === 'function') onEnd();
    }, delay * 1000 + duration * 1000);

    return () => { clearTimeout(t1); clearTimeout(t2); animating.current = false; };
  }, [isInView, startWhen, motionValue, startValue, endValue, delay, onStart, onEnd, duration, formatValue]);

  useEffect(() => {
    const unsubscribe = springValue.on('change', (latest: number) => {
      if (animating.current && ref.current) ref.current.textContent = formatValue(latest);
    });
    return () => unsubscribe();
  }, [springValue, formatValue]);

  return <span className={className} ref={ref}>{formatValue(endValue)}</span>;
}
