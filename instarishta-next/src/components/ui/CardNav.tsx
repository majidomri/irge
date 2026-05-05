'use client';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import Link from 'next/link';

export type CardNavLink = {
  label: string;
  href: string;
  ariaLabel?: string;
};

export type CardNavItem = {
  label: string;
  bgColor: string;
  textColor: string;
  links: CardNavLink[];
};

export interface CardNavProps {
  logoNode?: React.ReactNode;
  items: CardNavItem[];
  className?: string;
  ease?: string;
  baseColor?: string;
  menuColor?: string;
  buttonBgColor?: string;
  buttonTextColor?: string;
  ctaLabel?: string;
  ctaHref?: string;
  onCtaClick?: () => void;
}

const CardNav: React.FC<CardNavProps> = ({
  logoNode,
  items,
  className = '',
  ease = 'power3.out',
  baseColor = 'rgba(30,57,50,0.97)',
  menuColor,
  buttonBgColor = '#00754A',
  buttonTextColor = '#fff',
  ctaLabel = 'Browse',
  ctaHref = '/profiles',
  onCtaClick,
}) => {
  const [isHamburgerOpen, setIsHamburgerOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const navRef = useRef<HTMLDivElement | null>(null);
  const cardsRef = useRef<HTMLDivElement[]>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  const calculateHeight = () => {
    const navEl = navRef.current;
    if (!navEl) return 260;
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      const contentEl = navEl.querySelector('.card-nav-content') as HTMLElement;
      if (contentEl) {
        const wasVisibility = contentEl.style.visibility;
        const wasPointerEvents = contentEl.style.pointerEvents;
        const wasPosition = contentEl.style.position;
        const wasHeight = contentEl.style.height;
        contentEl.style.visibility = 'visible';
        contentEl.style.pointerEvents = 'auto';
        contentEl.style.position = 'static';
        contentEl.style.height = 'auto';
        contentEl.offsetHeight;
        const topBar = 60;
        const padding = 16;
        const contentHeight = contentEl.scrollHeight;
        contentEl.style.visibility = wasVisibility;
        contentEl.style.pointerEvents = wasPointerEvents;
        contentEl.style.position = wasPosition;
        contentEl.style.height = wasHeight;
        return topBar + contentHeight + padding;
      }
    }
    return 260;
  };

  const createTimeline = () => {
    const navEl = navRef.current;
    if (!navEl) return null;
    gsap.set(navEl, { height: 60, overflow: 'hidden' });
    gsap.set(cardsRef.current, { y: 50, opacity: 0 });
    const tl = gsap.timeline({ paused: true });
    tl.to(navEl, { height: calculateHeight, duration: 0.4, ease });
    tl.to(cardsRef.current, { y: 0, opacity: 1, duration: 0.4, ease, stagger: 0.08 }, '-=0.1');
    return tl;
  };

  useLayoutEffect(() => {
    const tl = createTimeline();
    tlRef.current = tl;
    return () => { tl?.kill(); tlRef.current = null; };
  }, [ease, items]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const handleResize = () => {
      if (!tlRef.current) return;
      if (isExpanded) {
        const newHeight = calculateHeight();
        gsap.set(navRef.current, { height: newHeight });
        tlRef.current.kill();
        const newTl = createTimeline();
        if (newTl) { newTl.progress(1); tlRef.current = newTl; }
      } else {
        tlRef.current.kill();
        const newTl = createTimeline();
        if (newTl) tlRef.current = newTl;
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isExpanded]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMenu = () => {
    const tl = tlRef.current;
    if (!tl) return;
    if (!isExpanded) {
      setIsHamburgerOpen(true);
      setIsExpanded(true);
      tl.play(0);
    } else {
      setIsHamburgerOpen(false);
      tl.eventCallback('onReverseComplete', () => setIsExpanded(false));
      tl.reverse();
    }
  };

  const setCardRef = (i: number) => (el: HTMLDivElement | null) => {
    if (el) cardsRef.current[i] = el;
  };

  return (
    <div className={`absolute left-1/2 w-[92%] max-w-[860px] z-[99] top-[0.7rem] md:top-[1rem] ${className}`}
      style={{ transform: 'translateX(-50%)' }}>
      <nav
        ref={navRef}
        className={`${isExpanded ? 'open' : ''} block h-[60px] p-0 rounded-xl shadow-lg relative overflow-hidden`}
        style={{
          backgroundColor: baseColor,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.12)',
          willChange: 'height',
        }}
      >
        {/* Top bar */}
        <div className="absolute inset-x-0 top-0 h-[60px] flex items-center justify-between p-2 pl-4 z-[2]">
          {/* Hamburger */}
          <div
            className={`${isHamburgerOpen ? 'open' : ''} group h-full flex flex-col items-center justify-center cursor-pointer gap-[5px] order-2 md:order-none`}
            onClick={toggleMenu}
            role="button"
            aria-label={isExpanded ? 'Close menu' : 'Open menu'}
            tabIndex={0}
            style={{ color: menuColor || 'rgba(255,255,255,0.85)' }}
          >
            <div className={`w-[26px] h-[2px] bg-current transition-all duration-300 ${isHamburgerOpen ? 'translate-y-[3.5px] rotate-45' : ''} group-hover:opacity-75`} style={{ transformOrigin: '50% 50%' }} />
            <div className={`w-[26px] h-[2px] bg-current transition-all duration-300 ${isHamburgerOpen ? '-translate-y-[3.5px] -rotate-45' : ''} group-hover:opacity-75`} style={{ transformOrigin: '50% 50%' }} />
          </div>

          {/* Logo */}
          <div className="flex items-center md:absolute md:left-1/2 md:top-1/2 order-1 md:order-none"
            style={{ transform: undefined } as React.CSSProperties}
          >
            <div className="md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2">
              {logoNode}
            </div>
          </div>

          {/* CTA */}
          {onCtaClick ? (
            <button
              onClick={onCtaClick}
              className="hidden md:inline-flex items-center h-full border-0 rounded-[calc(0.75rem-0.2rem)] px-5 text-sm font-semibold cursor-pointer transition-opacity hover:opacity-80"
              style={{ backgroundColor: buttonBgColor, color: buttonTextColor }}
            >
              {ctaLabel}
            </button>
          ) : (
            <Link
              href={ctaHref}
              className="hidden md:inline-flex items-center h-full border-0 rounded-[calc(0.75rem-0.2rem)] px-5 text-sm font-semibold cursor-pointer transition-opacity hover:opacity-80"
              style={{ backgroundColor: buttonBgColor, color: buttonTextColor }}
            >
              {ctaLabel}
            </Link>
          )}
        </div>

        {/* Card items */}
        <div
          className={`card-nav-content absolute left-0 right-0 top-[60px] bottom-0 p-2 flex flex-col items-stretch gap-2 justify-start z-[1] md:flex-row md:items-end md:gap-3 ${isExpanded ? 'visible pointer-events-auto' : 'invisible pointer-events-none'}`}
          aria-hidden={!isExpanded}
        >
          {(items || []).slice(0, 3).map((item, idx) => (
            <div
              key={`${item.label}-${idx}`}
              className="select-none relative flex flex-col gap-2 rounded-[calc(0.75rem-0.2rem)] flex-[1_1_auto] md:flex-[1_1_0%]"
              ref={setCardRef(idx)}
              style={{
                backgroundColor: item.bgColor,
                color: item.textColor,
                padding: '12px 16px',
                minWidth: 0,
                height: 'auto',
                minHeight: 60,
              }}
            >
              <div className="font-normal tracking-[-0.5px] text-[17px] md:text-[20px]">{item.label}</div>
              <div className="mt-auto flex flex-col gap-[2px]">
                {item.links?.map((lnk, i) => (
                  <Link
                    key={`${lnk.label}-${i}`}
                    href={lnk.href}
                    onClick={() => { setIsHamburgerOpen(false); tlRef.current?.eventCallback('onReverseComplete', () => setIsExpanded(false)); tlRef.current?.reverse(); }}
                    className="inline-flex items-center gap-1.5 no-underline transition-opacity duration-300 hover:opacity-75 text-[14px] md:text-[15px]"
                    aria-label={lnk.ariaLabel}
                    style={{ color: item.textColor }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <path d="M7 17L17 7M17 7H7M17 7v10" />
                    </svg>
                    {lnk.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default CardNav;
