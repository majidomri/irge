/**
 * GET /api/professions?all=1  → the profession vocabulary
 *   200 → { professions: Profession[] }
 *
 * Public and unauthenticated: the apply form needs the list before anyone has
 * signed in, and it is display vocabulary (labels, icons, proof hints), not
 * member data. ir_professions is public-read by policy for the same reason.
 *
 * Defaults to ACTIVE professions only — a retired one must not be offered to
 * new applicants. `?all=1` returns retired ones too, which is what the badge
 * and /nizam need: members already hold retired keys and their badges must
 * keep rendering.
 *
 * Node runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/credits';
import { loadProfessions } from '@/lib/professions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const all = new URL(req.url).searchParams.get('all') === '1';
  const professions = await loadProfessions(serviceClient(), { activeOnly: !all });

  return NextResponse.json(
    { professions },
    {
      // The vocabulary changes when an admin edits it, which is rare. A short
      // cache keeps the apply form and every badge off the database on each
      // render without making an edit take long to show up.
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
    },
  );
}
