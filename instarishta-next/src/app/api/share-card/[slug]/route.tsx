/**
 * GET /api/share-card/[slug]  → a PNG rishta card for one post
 *
 * This is the distribution surface. Rishtas in India spread through family
 * WhatsApp groups, not through links — an aunt forwards a picture, and the
 * picture has to carry everything on its own because nobody in that group is
 * going to tap through to read context. So the card is the picture, whole,
 * with a QR back to it.
 *
 * Rendered with next/og (satori). Satori is not a browser: every container
 * with more than one child needs an explicit `display: flex`, there is no
 * cascade, and only inline styles apply. Keep the markup flat and explicit.
 *
 * Images are fetched here and inlined as data URIs rather than handed to
 * satori as remote URLs. Satori drops an image it cannot decode *silently* —
 * which produced a card with a 860px hole in it where the photo should be
 * (hit live on a placehold.co URL that serves image/svg+xml). Fetching first
 * means we can check the content type, reject what satori cannot render, and
 * fall back to a branded panel instead of a void.
 *
 * The card IS the picture. It used to be a photo panel with a caption block
 * under it -- name, brand line, short URL -- which on a biodata frame
 * repeated what the frame already says in its own lockup, and cost the frame
 * a third of its height to say it. Now the image fills the card and the only
 * thing over it is the QR, because that is the one thing the picture cannot
 * carry itself.
 *
 * A show frame is 1080×1920 and the card matches it, so `cover` crops
 * nothing. Anything else keeps the 4:5 that fills a phone screen in a
 * WhatsApp thread, and is contained rather than cropped -- a 1200×630
 * landscape OG image renders as a thin strip there.
 *
 * Public: the underlying post is already public, and the card exposes nothing
 * the post page does not. Node runtime (needs the service-role client).
 */
import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';
import { SITE_URL } from '@/config/site';
import QRCode from 'qrcode';

export const runtime = 'nodejs';

const WIDTH = 1080;
/** A show frame's own size; anything else gets the 4:5 forward card. */
const FRAME_HEIGHT = 1920;
const CARD_HEIGHT  = 1350;

const INK   = '#0E1B16';

/** Raster formats satori can decode. SVG and AVIF are not among them. */
const EMBEDDABLE = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];

/** Refuse anything big enough to slow the card down or blow the memory budget. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Fetch a remote image and return it as a data URI satori can embed, or null
 * when it cannot be used. Never throws: a missing photo degrades to the
 * fallback panel, it does not fail the card.
 */
async function toDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!EMBEDDABLE.includes(type)) return null;

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_BYTES) return null;

    return `data:${type};base64,${Buffer.from(buf).toString('base64')}`;
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: nano } = await db
    .from('ir_nano_ids')
    .select('entity_id, entity_type')
    .eq('slug', slug)
    .maybeSingle();

  if (!nano) return new Response('Not found', { status: 404 });

  const table = nano.entity_type === 'story' ? 'ir_stories' : 'ir_posts';
  const { data: post } = await db
    .from(table)
    // `*` rather than a column list: the two tables differ (ir_stories has no
    // title, caption or facets) and a conditional select string defeats
    // supabase-js's literal-type parser.
    .select('*')
    .eq('id', nano.entity_id)
    .maybeSingle();

  if (!post) return new Response('Not found', { status: 404 });

  const photo   = await toDataUri(post.image);
  // A post carrying biodata facets is one of ours: a 1080x1920 show frame.
  const isFrame = (post as { gender?: string | null }).gender != null;
  const HEIGHT  = isFrame ? FRAME_HEIGHT : CARD_HEIGHT;

  /**
   * The QR belongs on the forward, not on the post.
   *
   * A code printed into every feed image is clutter -- nobody scans a phone
   * with the phone already holding the page. It earns its place only once the
   * picture leaves the site: this card is what lands in a family WhatsApp
   * group, often on someone else's screen, and there the code is the shortest
   * path back. `toDataURL` rather than the `toString({type:'svg'})` used on
   * the pay page: satori cannot decode SVG and drops it silently.
   */
  const shareUrl = `${SITE_URL}/p/${slug}`;
  const qr = await QRCode.toDataURL(shareUrl, {
    margin: 1,
    width: 200,
    errorCorrectionLevel: 'M',
    color: { dark: '#0E1B16', light: '#FFFFFF' },
  }).catch(() => null);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          backgroundColor: INK,
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            width={WIDTH}
            height={HEIGHT}
            style={{
              width: '100%',
              height: '100%',
              // A frame and the card are the same shape, so `cover` takes
              // nothing off it. An import is an unknown shape and is
              // contained, which is what stops a tall biodata scan losing its
              // bottom half to the crop.
              objectFit: isFrame ? 'cover' : 'contain',
            }}
          />
        ) : (
          // No usable photo. A branded panel, not an empty rectangle -- this
          // card gets forwarded into family groups and a blank one reads as
          // broken.
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#12241D',
            }}
          >
            <span style={{ fontSize: 120, fontWeight: 800, color: 'rgba(0,168,107,0.30)' }}>
              InstaRishta
            </span>
          </div>
        )}

        {/* The only thing laid over the picture. On a white plate because a
            QR on a dark photograph does not scan.

            Top-right on a show frame: the lower third is where the name, the
            fact grid and the description live, and the code was landing in
            the middle of the last paragraph. Up there it is over open
            photograph. An import has no such guarantee, so it keeps the
            bottom corner, which is the likelier margin on a scanned biodata. */}
        {qr && (
          <div
            style={{
              position: 'absolute',
              right: 40,
              ...(isFrame ? { top: 40 } : { bottom: 40 }),
              display: 'flex',
              padding: 14,
              borderRadius: 20,
              backgroundColor: '#FFFFFF',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="" width={160} height={160} style={{ width: 160, height: 160 }} />
          </div>
        )}
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        // Cards are immutable per slug: the photo and badge can change, but
        // not often, and a stale card in a WhatsApp thread is harmless.
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    },
  );
}
