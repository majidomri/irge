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
};

export default function SmartImage({
  offset = 400,
  blurDataURL,
  noPlaceholder = false,
  priority,
  loading,
  ...props
}: Props) {
  // A priority image must not wait for an observer, and neither must one the
  // caller has explicitly marked eager.
  const immediate = Boolean(priority) || loading === 'eager' || offset <= 0;

  const [visible, setVisible] = useState(immediate);
  const holder = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (immediate || visible) return;

    const node = holder.current;
    if (!node) return;

    // No IntersectionObserver (or a very old browser): load it rather than
    // leave a permanent placeholder.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

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

  if (immediate) {
    return <Image {...props} {...placeholderProps} priority={priority} loading={loading} />;
  }

  // `display: contents` keeps the wrapper out of layout, so a `fill` image
  // still positions against the caller's own relative container.
  return (
    <div ref={holder} style={{ display: 'contents' }}>
      {visible ? (
        <Image {...props} {...placeholderProps} loading="eager" />
      ) : (
        <Image {...props} {...placeholderProps} loading="lazy" />
      )}
    </div>
  );
}
