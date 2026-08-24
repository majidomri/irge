/**
 * GET /api/admin/profiles-list — id + title + gender for every feed profile.
 *
 * The biodata editor needs to let an admin pick any profile by id or ad text,
 * but profiles live in the Cloudflare-relayed feed rather than Postgres. This
 * exposes just enough of that feed to drive the picker, admin-gated because it
 * is a bulk listing.
 *
 * `body` is trimmed hard: the picker only searches and shows a one-line label,
 * and shipping 500 full Urdu ads to the browser for that is wasteful.
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';
import { getProfiles } from '@/lib/data';

interface FeedProfile { id?: number; title?: string; body?: string; gender?: string }

export const GET = withAdmin(async () => {
  const all = (await getProfiles()) as FeedProfile[];

  // `num` is the 1-based feed position, which is the "IR #" the public site
  // shows. `id` is the stable upstream key we actually store against. They are
  // different numbers (ids start at 1767), so the picker needs both: the admin
  // recognises the profile by num, the record is keyed by id.
  const profiles = all
    .map((p, i) => ({ p, num: i + 1 }))
    .filter(({ p }) => typeof p.id === 'number')
    .map(({ p, num }) => ({
      id:     p.id!,
      num,
      title:  (p.title ?? '').slice(0, 120),
      body:   (p.body  ?? '').slice(0, 200),
      gender: p.gender ?? '',
    }));

  return NextResponse.json({ profiles });
});
