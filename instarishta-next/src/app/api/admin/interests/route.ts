/**
 * GET   /api/admin/interests?status=new  → lead queue
 * PATCH /api/admin/interests { id, status }
 *
 * The team relays each lead to the advertiser offline (the feed carries no
 * per-advertiser contact — every profile shows the same business relay number)
 * and records the answer here:
 *
 *   accepted → the advertiser wants to connect. Unlocks the member's ability to
 *              spend a contact credit and see the number.
 *   declined → no. The member can never reveal, and was never charged.
 *
 * 'connected' is terminal and set by the reveal flow, not here — the member has
 * already paid at that point, so it must not be walked back.
 *
 * ir_interests has RLS enabled with no policies, so this admin-gated
 * service-role route is the only read path. Node runtime.
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';

const COLS = 'id, from_email, from_name, profile_id, profile_num, profile_title, profile_gender, chip, note, status, responded_at, revealed_at, created_at';

/** Statuses an admin may set. 'connected' is deliberately absent. */
const SETTABLE = ['new', 'seen', 'forwarded', 'rejected', 'accepted', 'declined'] as const;

/** "12", "#12", "IR 12", "IR #12" → 12. The number shown on every profile card. */
function parseIrNumber(term: string): number | null {
  const m = term.trim().match(/^(?:ir)?\s*#?\s*(\d{1,6})$/i);
  return m ? parseInt(m[1], 10) : null;
}

export const GET = withAdmin(async (req, { db }) => {
  const url    = new URL(req.url);
  const status = url.searchParams.get('status');
  const q      = url.searchParams.get('q')?.trim();

  let query = db.from('ir_interests').select(COLS).order('created_at', { ascending: false }).limit(200);
  if (status) query = query.eq('status', status);

  if (q) {
    const ir = parseIrNumber(q);
    if (ir !== null) {
      // Leads for one profile — by the IR # members see, or the feed id.
      query = query.or(`profile_num.eq.${ir},profile_id.eq.${ir}`);
    } else {
      const term = q.replace(/[,()*"']/g, ' ').trim();
      if (term) query = query.or(`from_email.ilike.%${term}%,from_name.ilike.%${term}%,profile_title.ilike.%${term}%`);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count } = await db
    .from('ir_interests').select('id', { count: 'exact', head: true }).eq('status', 'new');

  return NextResponse.json({ interests: data ?? [], newCount: count ?? 0 });
});

export const PATCH = withAdmin(async (_req, { db, body }) => {
  const id     = typeof body.id === 'string' ? body.id : null;
  const status = typeof body.status === 'string' ? body.status : null;

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  if (!status || !(SETTABLE as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  // Via the RPC so the 'connected' guard and responded_at stamping live in one
  // place rather than being re-implemented per caller.
  const { error } = await db.rpc('ir_respond_interest', { p_id: id, p_status: status });
  if (error) {
    const terminal = error.message.includes('no updatable interest');
    return NextResponse.json(
      { error: terminal ? 'Already connected — the member has paid to reveal this contact.' : error.message },
      { status: terminal ? 409 : 500 },
    );
  }

  const { data } = await db.from('ir_interests').select(COLS).eq('id', id).single();
  return NextResponse.json({ interest: data });
});
