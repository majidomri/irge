import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function verifyAdmin(req: NextRequest) {
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!bearer) return null;
  const { data: { user } } = await serviceClient().auth.getUser(bearer);
  if (!user) return null;
  const allowed = process.env.ADMIN_EMAILS;
  if (allowed && !allowed.split(',').map(e => e.trim()).includes(user.email ?? '')) return null;
  return user;
}

export async function GET(req: NextRequest) {
  const caller = await verifyAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = serviceClient();

  const [nanoRows, eventRows] = await Promise.all([
    db.from('ir_nano_ids')
      .select('slug, entity_type, views, shares, created_at')
      .order('views', { ascending: false })
      .limit(200),
    db.from('ir_share_events')
      .select('slug, event_type, source, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const all = nanoRows.data ?? [];

  // Aggregate by entity_type
  const byType: Record<string, { entities: number; views: number; shares: number }> = {};
  let totalViews = 0, totalShares = 0;
  for (const row of all) {
    const t = row.entity_type as string;
    if (!byType[t]) byType[t] = { entities: 0, views: 0, shares: 0 };
    byType[t].entities++;
    byType[t].views  += (row.views  as number) ?? 0;
    byType[t].shares += (row.shares as number) ?? 0;
    totalViews  += (row.views  as number) ?? 0;
    totalShares += (row.shares as number) ?? 0;
  }

  const topByViews  = [...all].sort((a, b) => ((b.views  as number) ?? 0) - ((a.views  as number) ?? 0)).slice(0, 10);
  const topByShares = [...all].sort((a, b) => ((b.shares as number) ?? 0) - ((a.shares as number) ?? 0)).slice(0, 10);

  // Events by day (last 14 days)
  const events = eventRows.data ?? [];
  const dayMap: Record<string, { views: number; shares: number; referrals: number }> = {};
  for (const e of events) {
    const day = (e.created_at as string).slice(0, 10);
    if (!dayMap[day]) dayMap[day] = { views: 0, shares: 0, referrals: 0 };
    const type = e.event_type as string;
    if (type === 'view')     dayMap[day].views++;
    if (type === 'share')    dayMap[day].shares++;
    if (type === 'referral') dayMap[day].referrals++;
  }

  return NextResponse.json({
    totals: { views: totalViews, shares: totalShares, entities: all.length },
    byType,
    topByViews,
    topByShares,
    recentEvents: events.slice(0, 30),
    eventsByDay:  dayMap,
  });
}
