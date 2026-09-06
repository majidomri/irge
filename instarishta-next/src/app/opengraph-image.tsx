import { ImageResponse } from 'next/og';

/**
 * The site's link preview.
 *
 * openGraph.images pointed at /logo.svg, and every platform that matters for
 * this site rejects SVG in a preview — WhatsApp, Facebook, X, LinkedIn all
 * want a raster. So every share, including every profile link sent in a
 * WhatsApp thread, rendered with no image at all. On a site whose entire
 * distribution is people forwarding links to family, that is the single most
 * visible thing that was broken.
 *
 * 1200×630 is the landscape ratio those platforms crop to. It is deliberately
 * not the /api/share-card artwork: that card is portrait 1080×1350, built to
 * fill a phone screen as an *attachment* in a thread, and its own comment
 * notes that a landscape OG image "renders as a thin strip there". Two
 * different jobs, two different pictures.
 *
 * Drawn rather than photographed: listings are real people's biodata, and a
 * link preview is the one image that gets copied into every group chat the
 * link reaches.
 */
export const alt = 'InstaRishta — trusted Muslim matrimony and nikah matchmaking';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const GREEN = '#1E3932';
const ACCENT = '#00A86B';
const GOLD = '#F5E6C8';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '72px 80px',
          background: GREEN,
          color: '#fff',
          fontFamily: 'sans-serif',
          // A soft accent wash from the corner, so the card is not a flat
          // rectangle at thumbnail size.
          backgroundImage: `radial-gradient(circle at 88% 12%, rgba(0,168,107,0.30) 0%, rgba(30,57,50,0) 55%)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 12, height: 12, borderRadius: 999, background: ACCENT }} />
          <div
            style={{
              fontSize: 22,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.72)',
            }}
          >
            Muslim Matrimony
          </div>
        </div>

        <div style={{ marginTop: 22, fontSize: 92, fontWeight: 700, letterSpacing: '-0.03em' }}>
          InstaRishta
        </div>

        <div
          style={{
            marginTop: 18,
            fontSize: 34,
            lineHeight: 1.35,
            color: 'rgba(255,255,255,0.86)',
            maxWidth: 820,
          }}
        >
          Verified rishta profiles. Contact details stay under the family&rsquo;s control.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 'auto' }}>
          <div style={{ height: 3, width: 72, background: GOLD }} />
          <div style={{ fontSize: 26, color: GOLD }}>instarishta.me</div>
        </div>
      </div>
    ),
    size,
  );
}
