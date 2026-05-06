'use client';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, PanInfo, useMotionValue, useTransform } from 'motion/react';
import { useRouter } from 'next/navigation';

export interface CarouselItem {
  id: string | number;
  title: string;
  description?: string;
  image_url?: string;
  link_url?: string;
}

export interface CarouselProps {
  items?: CarouselItem[];
  baseWidth?: number;
  autoplay?: boolean;
  autoplayDelay?: number;
  pauseOnHover?: boolean;
  loop?: boolean;
  cardHeight?: number;
}

const DRAG_BUFFER = 0;
const VELOCITY_THRESHOLD = 500;
const GAP = 14;
const SPRING_OPTIONS = { type: 'spring' as const, stiffness: 300, damping: 30 };

interface CardProps {
  item: CarouselItem;
  index: number;
  itemWidth: number;
  cardHeight: number;
  trackItemOffset: number;
  x: ReturnType<typeof useMotionValue<number>>;
  transition: Record<string, unknown>;
  onNavigate: (url: string) => void;
}

function Card({ item, index, itemWidth, cardHeight, trackItemOffset, x, transition, onNavigate }: CardProps) {
  const range = [-(index + 1) * trackItemOffset, -index * trackItemOffset, -(index - 1) * trackItemOffset];
  const rotateY = useTransform(x, range, [90, 0, -90], { clamp: false });

  return (
    <motion.div
      className="relative shrink-0 overflow-hidden cursor-grab active:cursor-grabbing select-none"
      style={{ width: itemWidth, height: cardHeight, rotateY, borderRadius: 18 }}
      transition={transition}
      onClick={() => item.link_url && onNavigate(item.link_url)}
    >
      {item.image_url ? (
        <img src={item.image_url} alt={item.title}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          draggable={false} />
      ) : (
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(135deg, #1E3932 0%, #2b5148 100%)' }} />
      )}

      {/* Bottom gradient overlay */}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0) 100%)' }} />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <p className="text-white font-bold text-[1rem] leading-tight mb-1">{item.title}</p>
        {item.description && (
          <p className="text-[0.78rem] leading-snug mb-2" style={{ color: 'rgba(255,255,255,0.62)' }}>
            {item.description}
          </p>
        )}
        {item.link_url && (
          <span className="inline-flex items-center gap-1 text-[0.72rem] font-bold tracking-wide"
            style={{ color: '#00C87A' }}>
            View Profile
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        )}
      </div>
    </motion.div>
  );
}

export default function Carousel({
  items = [],
  baseWidth = 300,
  autoplay = false,
  autoplayDelay = 3000,
  pauseOnHover = false,
  loop = false,
  cardHeight = 340,
}: CarouselProps) {
  const router = useRouter();
  const containerPadding = 16;
  const itemWidth = baseWidth - containerPadding * 2;
  const trackItemOffset = itemWidth + GAP;

  const itemsForRender = useMemo(() => {
    if (!loop || items.length === 0) return items;
    return [items[items.length - 1], ...items, items[0]];
  }, [items, loop]);

  const [position, setPosition] = useState(loop ? 1 : 0);
  const x = useMotionValue(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isJumping, setIsJumping] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pauseOnHover || !containerRef.current) return;
    const el = containerRef.current;
    const enter = () => setIsHovered(true);
    const leave = () => setIsHovered(false);
    el.addEventListener('mouseenter', enter);
    el.addEventListener('mouseleave', leave);
    return () => { el.removeEventListener('mouseenter', enter); el.removeEventListener('mouseleave', leave); };
  }, [pauseOnHover]);

  useEffect(() => {
    if (!autoplay || itemsForRender.length <= 1 || (pauseOnHover && isHovered)) return;
    const t = setInterval(() => setPosition(p => Math.min(p + 1, itemsForRender.length - 1)), autoplayDelay);
    return () => clearInterval(t);
  }, [autoplay, autoplayDelay, isHovered, pauseOnHover, itemsForRender.length]);

  useEffect(() => {
    const start = loop ? 1 : 0;
    setPosition(start);
    x.set(-start * trackItemOffset);
  }, [items.length, loop, trackItemOffset, x]);

  const effectiveTransition = isJumping ? { duration: 0 } : SPRING_OPTIONS;

  const handleAnimationComplete = () => {
    if (!loop || itemsForRender.length <= 1) { setIsAnimating(false); return; }
    const lastIdx = itemsForRender.length - 1;
    if (position === lastIdx) {
      setIsJumping(true); setPosition(1); x.set(-trackItemOffset);
      requestAnimationFrame(() => { setIsJumping(false); setIsAnimating(false); });
    } else if (position === 0) {
      setIsJumping(true); setPosition(items.length); x.set(-items.length * trackItemOffset);
      requestAnimationFrame(() => { setIsJumping(false); setIsAnimating(false); });
    } else {
      setIsAnimating(false);
    }
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    const dir = offset.x < -DRAG_BUFFER || velocity.x < -VELOCITY_THRESHOLD ? 1
              : offset.x > DRAG_BUFFER  || velocity.x > VELOCITY_THRESHOLD  ? -1 : 0;
    if (!dir) return;
    setPosition(p => Math.max(0, Math.min(p + dir, itemsForRender.length - 1)));
  };

  const dragProps = loop ? {} : {
    dragConstraints: { left: -trackItemOffset * Math.max(itemsForRender.length - 1, 0), right: 0 },
  };

  const activeIndex = items.length === 0 ? 0 : loop
    ? (position - 1 + items.length) % items.length
    : Math.min(position, items.length - 1);

  const onNavigate = useCallback((url: string) => router.push(url), [router]);

  return (
    <div ref={containerRef}
      className="relative overflow-hidden"
      style={{ width: baseWidth, padding: containerPadding, paddingBottom: 0, borderRadius: 24 }}>

      <motion.div
        className="flex"
        drag={isAnimating ? false : 'x'}
        {...dragProps}
        style={{
          width: itemWidth,
          gap: GAP,
          perspective: 1000,
          perspectiveOrigin: `${position * trackItemOffset + itemWidth / 2}px 50%`,
          x,
        }}
        onDragEnd={handleDragEnd}
        animate={{ x: -(position * trackItemOffset) }}
        transition={effectiveTransition}
        onAnimationStart={() => setIsAnimating(true)}
        onAnimationComplete={handleAnimationComplete}
      >
        {itemsForRender.map((item, i) => (
          <Card key={`${item.id}-${i}`} item={item} index={i} itemWidth={itemWidth}
            cardHeight={cardHeight} trackItemOffset={trackItemOffset}
            x={x} transition={effectiveTransition} onNavigate={onNavigate} />
        ))}
      </motion.div>

      {/* Dot indicators */}
      <div className="flex justify-center items-center gap-2 mt-4 pb-1">
        {items.map((_, i) => (
          <motion.button key={i}
            className="rounded-full border-0 cursor-pointer p-0"
            style={{
              height: 7,
              background: activeIndex === i ? '#00A86B' : 'rgba(255,255,255,0.22)',
            }}
            animate={{ width: activeIndex === i ? 20 : 7 }}
            transition={{ duration: 0.2 }}
            onClick={() => setPosition(loop ? i + 1 : i)}
          />
        ))}
      </div>
    </div>
  );
}
