import { ImageResponse } from 'next/og';
import { getProfiles } from '@/lib/data';
import type { Profile } from '@/types/profile';

/**
 * A share card per listing.
 *
 * The feed carries no photographs — the whole payload is id, title, phone,
 * whatsapp, age, body, gender, priority, date, education — so there is no
 * portrait to show and nothing to crop. The card is typographic instead:
 * what the listing is, in the two or three facts that identify it.
 *
 * That is also the safer artwork. A generated card cannot leak a face, and it
 * cannot leak a number, because the only fields it reads are the ones chosen
 * here.
 */
export const alt = 'Rishta listing on InstaRishta';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const GREEN = '#1E3932';
const ACCENT = '#00A86B';
const GOLD = '#F5E6C8';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let listing: Profile | null = null;
  try {
    const all = (await getProfiles()) as Profile[];
    listing = all.find((p) => p.id === Number.parseInt(id, 10)) ?? null;
  } catch {
    listing = null;
  }

  const role =
    listing?.gender === 'female' ? 'Bride' : listing?.gender === 'male' ? 'Groom' : 'Rishta';
  const facts = [
    listing?.age ? `${listing.age} years` : null,
    listing?.education || null,
  ].filter(Boolean).join('  ·  ');

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
          backgroundImage:
            'radial-gradient(circle at 88% 12%, rgba(0,168,107,0.30) 0%, rgba(30,57,50,0) 55%)',
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
            InstaRishta
          </div>
        </div>

        <div style={{ marginTop: 24, fontSize: 84, fontWeight: 700, letterSpacing: '-0.03em' }}>
          {role}
          {listing?.age ? `, ${listing.age}` : ''}
        </div>

        {facts && (
          <div style={{ marginTop: 14, fontSize: 34, color: 'rgba(255,255,255,0.86)' }}>
            {facts}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 'auto' }}>
          <div style={{ height: 3, width: 72, background: GOLD }} />
          <div style={{ fontSize: 26, color: GOLD }}>
            instarishta.me{listing?.id ? `/l/${listing.id}` : ''}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
