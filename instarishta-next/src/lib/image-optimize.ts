/**
 * Normalise an uploaded image before it is stored.
 *
 * Server-only: this pulls in sharp, which is a native module.
 *
 * next/image already negotiates the DELIVERY format (see src/lib/img.ts), so
 * this is not about what a visitor downloads. It is about what we keep: an
 * admin's phone export is a 4000px, 5 MB JPEG carrying GPS in its EXIF, and
 * storing that verbatim costs bucket space forever, makes the optimizer's
 * first transform of every size slow, and quietly publishes where the photo
 * was taken.
 *
 * So each upload is:
 *
 *   1. rotated to match its EXIF orientation, then stripped of metadata --
 *      the rotation has to happen first or a portrait photo lands sideways
 *      once the tag it depended on is gone;
 *   2. capped at 1920 on the long edge, never enlarged, because nothing on
 *      the site renders wider than that and a story frame is 1080x1920;
 *   3. re-encoded, and the SMALLEST of AVIF / WebP / the original encoding
 *      wins. AVIF is usually the smallest by some way, but not always -- on
 *      small or flat images its container overhead can lose to WebP, and
 *      picking per image costs one encode and never guesses wrong.
 *
 * Animated GIFs are passed through untouched. sharp can encode animated WebP,
 * but the frames here are rishta photos rather than animations, and silently
 * flattening someone's animation to a still is worse than storing it as-is.
 */
import sharp from 'sharp';

export interface OptimizedUpload {
  bytes: Buffer;
  /** Content type to store and serve it as. */
  mime: string;
  /** File extension, without the dot. */
  ext: string;
  width: number;
  height: number;
  /** What it was, for logging and the API response. */
  originalBytes: number;
  /** 0-100, how much smaller the stored file is than what was uploaded. */
  savedPct: number;
}

const MAX_EDGE = 1920;

/** Quality settings, picked to be visually indistinguishable at these sizes. */
const AVIF_QUALITY = 58;
const WEBP_QUALITY = 82;
const JPEG_QUALITY = 82;

function isAnimated(mime: string, meta: sharp.Metadata): boolean {
  return mime === 'image/gif' && (meta.pages ?? 1) > 1;
}

export async function optimizeUpload(
  input: Buffer,
  mime: string,
): Promise<OptimizedUpload> {
  const originalBytes = input.byteLength;

  let meta: sharp.Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    // Not something sharp can read. Store it exactly as it arrived rather
    // than rejecting an upload the browser was happy to send.
    return passthrough(input, mime, originalBytes);
  }

  if (isAnimated(mime, meta)) {
    return passthrough(input, mime, originalBytes, meta);
  }

  // `.rotate()` with no argument applies the EXIF orientation; sharp then
  // drops metadata on output unless asked to keep it, which is what we want.
  const base = sharp(input, { failOn: 'none' })
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    });

  const hasAlpha = meta.hasAlpha === true;

  const [avif, webp, fallback] = await Promise.all([
    base.clone().avif({ quality: AVIF_QUALITY, effort: 4 }).toBuffer({ resolveWithObject: true }),
    base.clone().webp({ quality: WEBP_QUALITY }).toBuffer({ resolveWithObject: true }),
    hasAlpha
      // A transparent source cannot become JPEG without picking a matte
      // colour for it, so PNG is the honest fallback there.
      ? base.clone().png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
      : base.clone().jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer({ resolveWithObject: true }),
  ]);

  const candidates = [
    { buf: avif, mime: 'image/avif', ext: 'avif' },
    { buf: webp, mime: 'image/webp', ext: 'webp' },
    { buf: fallback, mime: hasAlpha ? 'image/png' : 'image/jpeg', ext: hasAlpha ? 'png' : 'jpg' },
  ];

  const best = candidates.reduce((a, b) => (b.buf.data.byteLength < a.buf.data.byteLength ? b : a));

  // A re-encode that gains nothing is not worth the loss of the original: if
  // the upload is already smaller than everything we can produce, keep it.
  if (originalBytes <= best.buf.data.byteLength && !needsResize(meta)) {
    return passthrough(input, mime, originalBytes, meta);
  }

  return {
    bytes: best.buf.data,
    mime: best.mime,
    ext: best.ext,
    width: best.buf.info.width,
    height: best.buf.info.height,
    originalBytes,
    savedPct: Math.round((1 - best.buf.data.byteLength / originalBytes) * 100),
  };
}

function needsResize(meta: sharp.Metadata): boolean {
  return (meta.width ?? 0) > MAX_EDGE || (meta.height ?? 0) > MAX_EDGE;
}

function passthrough(
  input: Buffer,
  mime: string,
  originalBytes: number,
  meta?: sharp.Metadata,
): OptimizedUpload {
  return {
    bytes: input,
    mime,
    ext: mime === 'image/jpeg' ? 'jpg' : (mime.split('/')[1] ?? 'bin'),
    width: meta?.width ?? 0,
    height: meta?.height ?? 0,
    originalBytes,
    savedPct: 0,
  };
}
