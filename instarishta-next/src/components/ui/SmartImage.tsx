'use client';

import Image, { type ImageProps } from 'next/image';
import { useEffect, useRef, useState } from 'react';

/**
 * next/image with a blur placeholder and a controllable loading offset.
 *
 * Adapted from Vercel's image-offset example. Two things it adds over using
 * next/image directly, both of which this app was missing everywhere:
 *
 * 1. A placeholder. Nothing here used `placeholder="blur"`, so every remote
 *    image popped from empty box to full picture. Feed covers come from
 *    Supabase at runtime, so there is no build-time LQIP to embed; a neutral
 *    tint in the site's own surface colour costs no request and removes the
 *    pop without pretending to preview content it has not loaded.
 *
 * 2. An offset. next/image lazy-loads on a fixed margin that is tuned for a
 *    page, not for a grid someone flicks through. `offset` starts the fetch
 *    that many pixels before the image enters the viewport, so a fast scroll
 *    meets loaded tiles rather than placeholders. Set it to 0 to opt out.
 *
 * `priority` images skip all of this: they are meant to load immediately, and
 * an observer would only get in the way.
 */

/**
 * 4x4 flat #EFEDEA — the app's warm off-white. Base64 rather than a file so it
 * is inline in the markup and never a second request.
 */
// Precomputed rather than Buffer.from(...) at module scope: this is a client
// component, and Buffer does not exist in the browser.
export const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNFRkVERUEiLz48L3N2Zz4=';

type Props = Omit<ImageProps, 'placeholder' | 'blurDataURL'> & {
  /** Pixels before the viewport at which loading starts. Default 400. */
  offset?: number;
  /** Pass a real LQIP when one exists; otherwise the neutral tint is used. */
  blurDataURL?: string;
  /** Opt out of the placeholder for images that are themselves decoration. */
  noPlaceholder?: boolean;
  /**
   * What to show when the image cannot be loaded. Defaults to a quiet tile in
   * the app's own surface colour.
   */
  fallback?: React.ReactNode;
};

export default function SmartImage({
  offset = 400,
  blurDataURL,
  noPlaceholder = false,
  fallback,
  priority,
  loading,
  // Destructured rather than left in ...props so it is visible at each <Image>
  // below. Spread alone hides it from jsx-a11y, which then cannot tell a
  // described image from an undescribed one — and the whole point of that rule
  // is that the distinction is easy to lose.
  alt,
  ...props
}: Props) {
  // A priority image must not wait for an observer, and neither must one the
  // caller has explicitly marked eager.
  const immediate = Boolean(priority) || loading === 'eager' || offset <= 0;

  const [visible, setVisible] = useState(immediate);
  /**
   * A URL that 404s or a host that stops serving leaves the browser drawing
   * its own broken-image glyph, which on a listing grid reads as the site
   * being broken. Feed images are third-party uploads whose URLs outlive
   * nothing in particular, so this is a when, not an if.
   */
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLDivElement | null>(null);

  // A new src deserves a fresh attempt — the previous failure was about the
  // previous image.
  const src = props.src;
  useEffect(() => { setFailed(false); }, [src]);

  useEffect(() => {
    if (immediate || visible) return;

    const node = holder.current;
    if (!node) return;

    // No IntersectionObserver. Leave `visible` false: that path renders
    // loading="lazy", so the browser's own lazy loading takes over and the
    // image still arrives. Calling setState here instead would force a render
    // for no gain, which is what react-hooks/set-state-in-effect is about.
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: `${offset}px` },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [immediate, visible, offset]);

  const placeholderProps = noPlaceholder
    ? {}
    : { placeholder: 'blur' as const, blurDataURL: blurDataURL ?? BLUR_DATA_URL };

  const onError = () => setFailed(true);

  if (failed) {
    if (fallback) return <>{fallback}</>;

    /**
     * The default: the blur tint at full size, with the alt text still
     * available to assistive tech. `fill` images are absolutely positioned by
     * their parent, so the fallback has to be too or it collapses.
     */
    return (
      <span
        role="img"
        aria-label={typeof alt === 'string' && alt ? alt : 'Image unavailable'}
        style={{
          position: props.fill ? 'absolute' : 'relative',
          inset: props.fill ? 0 : undefined,
          display: 'block',
          width: props.fill ? undefined : props.width,
          height: props.fill ? undefined : props.height,
          background: '#EFEDEA',
        }}
      />
    );
  }

  if (immediate) {
    return (
      <Image
        {...props}
        alt={alt}
        {...placeholderProps}
        priority={priority}
        loading={loading}
        onError={onError}
      />
    );
  }

  // `display: contents` keeps the wrapper out of layout, so a `fill` image
  // still positions against the caller's own relative container.
  return (
    <div ref={holder} style={{ display: 'contents' }}>
      {visible ? (
        <Image {...props} alt={alt} {...placeholderProps} loading="eager" onError={onError} />
      ) : (
        <Image {...props} alt={alt} {...placeholderProps} loading="lazy" onError={onError} />
      )}
    </div>
  );
}
