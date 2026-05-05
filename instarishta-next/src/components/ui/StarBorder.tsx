'use client';
import React from 'react';

type StarBorderProps<T extends React.ElementType> = React.ComponentPropsWithoutRef<T> & {
  as?: T;
  className?: string;
  children?: React.ReactNode;
  color?: string;
  speed?: React.CSSProperties['animationDuration'];
  thickness?: number;
};

function StarBorder<T extends React.ElementType = 'button'>({
  as,
  className = '',
  color = '#00A86B',
  speed = '6s',
  thickness = 1,
  children,
  ...rest
}: StarBorderProps<T>) {
  const Component = (as || 'button') as React.ElementType;

  return (
    <Component
      className={`relative inline-block overflow-hidden rounded-[20px] ${className}`}
      {...rest}
      style={{ padding: `${thickness}px 0`, ...((rest as React.CSSProperties & { style?: React.CSSProperties }).style) }}
    >
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: '300%', height: '50%',
          opacity: 0.7,
          bottom: '-11px', right: '-250%',
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animation: `star-movement-bottom linear infinite alternate`,
          animationDuration: speed,
          zIndex: 0,
        }}
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: '300%', height: '50%',
          opacity: 0.7,
          top: '-10px', left: '-250%',
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animation: `star-movement-top linear infinite alternate`,
          animationDuration: speed,
          zIndex: 0,
        }}
      />
      <div
        className="relative text-white text-center font-semibold"
        style={{
          background: 'linear-gradient(to bottom, #1E3932, #0d1e18)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 20,
          fontSize: 16,
          padding: '12px 24px',
          zIndex: 1,
        }}
      >
        {children}
      </div>
    </Component>
  );
}

export default StarBorder;
