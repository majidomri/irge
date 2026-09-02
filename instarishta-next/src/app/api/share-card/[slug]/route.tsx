/**
 * GET /api/share-card/[slug]  → a PNG rishta card for one post
 *
 * This is the distribution surface. Rishtas in India spread through family
 * WhatsApp groups, not through links — an aunt forwards a picture, and the
 * picture has to carry everything on its own because nobody in that group is
 * going to tap through to read context. So the card bakes in the photo, the
 * verified profession and the short URL, and every forward carries the badge
 * and the brand into a group of exactly the right people.
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
 * Portrait 1080×1350 — a 4:5 card is what fills a phone screen in a WhatsApp
 * thread; a 1200×630 landscape OG image renders as a thin strip there.
 *
 * Public: the underlying post is already public, and the card exposes nothing
 * the post page does not. Node runtime (needs the service-role client).
 */
import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { getProfession, loadProfessions } from '@/lib/professions';

export const runtime = 'nodejs';

const WIDTH  = 1080;
const HEIGHT = 1350;

const GREEN = '#00A86B';
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
    .select('image, title, caption, user_id')
    .eq('id', nano.entity_id)
    .maybeSingle();

  if (!post) return new Response('Not found', { status: 404 });

  // The badge is the whole reason this card is worth forwarding, so resolve
  // the poster's verified profession. Absent (or unverified) simply means no
  // badge — never a placeholder one.
  let professionKey: string | null = null;
  if (post.user_id) {
    const { data: owner } = await db
      .from('ir_user_profiles')
      .select('profession_key')
      .eq('id', post.user_id)
      .maybeSingle();
    professionKey = owner?.profession_key ?? null;
  }
  const profession = getProfession(await loadProfessions(db), professionKey);

  const photo   = await toDataUri(post.image);
  const heading = (post.title || post.caption || 'A rishta on InstaRishta').slice(0, 110);
  const site    = process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, '') || 'instarishta.com';

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
  const shareUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://instarishta.me'}/p/${slug}`;
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
          flexDirection: 'column',
          backgroundColor: INK,
        }}
      >
        {/* Photo — fixed height so the caption block never gets squeezed out */}
        <div style={{ display: 'flex', width: '100%', height: 860, position: 'relative' }}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt=""
              width={WIDTH}
              height={860}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            // No usable photo. A branded panel, not an empty rectangle — this
            // card gets forwarded into family groups and a blank top half
            // reads as broken.
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

          {profession && (
            <div
              style={{
                position: 'absolute',
                top: 40,
                left: 40,
                display: 'flex',
                alignItems: 'center',
                padding: '14px 26px',
                borderRadius: 999,
                backgroundColor: 'rgba(0,0,0,0.62)',
                border: `2px solid ${GREEN}`,
              }}
            >
              <span style={{ fontSize: 34, marginRight: 12 }}>{profession.icon}</span>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#FFFFFF' }}>
                {`Verified ${profession.label}`}
              </span>
            </div>
          )}
        </div>

        {/* Caption + brand */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '48px 56px',
          }}
        >
          <div style={{ display: 'flex', fontSize: 52, lineHeight: 1.25, fontWeight: 700, color: '#FFFFFF' }}>
            {heading}
          </div>

          <div style={{ display: 'flex', flex: 1 }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 38, fontWeight: 800, color: GREEN }}>InstaRishta</span>
              <span style={{ fontSize: 26, color: 'rgba(255,255,255,0.55)' }}>
                Verified professionals only
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qr}
                  alt=""
                  width={150}
                  height={150}
                  style={{ width: 150, height: 150, borderRadius: 12 }}
                />
              )}
              <span style={{ fontSize: 26, color: 'rgba(255,255,255,0.75)', marginTop: 10 }}>
                {`${site}/p/${slug}`}
              </span>
            </div>
          </div>
        </div>
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
