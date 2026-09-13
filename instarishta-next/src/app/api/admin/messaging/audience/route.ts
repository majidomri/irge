/**
 * GET /api/admin/messaging/audience — the member funnel for campaigns:
 * members → with phone → verified → consented → not opted out.
 *
 * Shown as a funnel, not a single number, because "17 members, 0 reachable"
 * tells an admin where the audience is being lost and "0" looks like a bug.
 */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/admin-route';
import { loadMembers, loadOptouts } from '@/lib/messaging/store';

export const runtime = 'nodejs';

export const GET = withAdmin(async (_req, { db }) => {
  const [members, optouts] = await Promise.all([loadMembers(db), loadOptouts(db)]);

  const rows = members.map(m => ({
    ...m,
    opted_out: !!m.phone && optouts.has(m.phone),
    reachable: !!m.phone && m.phone_verified && m.rcs_consent && !optouts.has(m.phone),
  }));

  return NextResponse.json({
    members: rows,
    funnel: {
      members:   rows.length,
      withPhone: rows.filter(m => m.phone).length,
      verified:  rows.filter(m => m.phone && m.phone_verified).length,
      consented: rows.filter(m => m.phone && m.phone_verified && m.rcs_consent).length,
      reachable: rows.filter(m => m.reachable).length,
    },
  });
});
