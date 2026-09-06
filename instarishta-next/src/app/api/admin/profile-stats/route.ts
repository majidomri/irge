/**
 * GET /api/admin/profile-stats?days=30[&entityId=1767]
 *
 * The read side of ir_profile_events.
 *
 * Without entityId: a leaderboard — every listing that saw activity in the
 * window, with its totals and where the traffic came from.
 * With entityId: one listing in full, broken down by source and by day.
 *
 * Aggregated here rather than in SQL views on purpose. The volumes are small
 * (a listing gets tens of events, not millions), the shapes are still changing
 * while the dashboard finds its feet, and a view would have to be migrated
 * every time /nizam wants a different cut. If this ever outgrows that, the
 * rollup belongs in a materialised view keyed by (entity_id, day, event,
 * source) — not in a bigger query here.
 */
import { NextResponse } from 'next/server';

import { withAdmin } from '@/lib/admin-route';
import { SOURCE_LABEL, type TrafficSource } from '@/lib/traffic-source';

type Row = {
  entity_type: string;
  entity_id: string;
  event: string;
  source: string;
  country: string | null;
  device: string | null;
  visitor_hash: string | null;
  created_at: string;
};

/** Bounded, because an unbounded read here is the anti-pattern this route helps find. */
const MAX_ROWS = 50_000;

function tally<T extends string>(rows: Row[], key: (r: Row) => T | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r);
    if (k) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export const GET = withAdmin(async (req, { db }) => {
  const params = new URL(req.url).searchParams;
  const days = Math.min(365, Math.max(1, Number(params.get('days')) || 30));
  const entityId = params.get('entityId');
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  let query = db
    .from('ir_profile_events')
    .select('entity_type, entity_id, event, source, country, device, visitor_hash, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (entityId) query = query.eq('entity_id', entityId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = (data ?? []) as Row[];

  // Sources, with the label the dashboard shows, ordered by volume.
  const bySource = tally(rows, (r) => r.source as TrafficSource);
  const sources = Object.entries(bySource)
    .map(([source, count]) => ({
      source,
      label: SOURCE_LABEL[source as TrafficSource] ?? source,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const totals = {
    ...tally(rows, (r) => r.event),
    // Distinct visitors, not events: ten impressions from one phone is one
    // person, and a dashboard that conflates them flatters itself.
    reach: new Set(rows.map((r) => r.visitor_hash).filter(Boolean)).size,
  };

  if (entityId) {
    const byDay: Record<string, number> = {};
    for (const r of rows) {
      const day = r.created_at.slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + 1;
    }

    return NextResponse.json({
      days,
      entityId,
      totals,
      sources,
      countries: tally(rows, (r) => r.country),
      devices: tally(rows, (r) => r.device),
      byDay: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)),
      sampled: rows.length >= MAX_ROWS,
    });
  }

  // Leaderboard.
  const perEntity = new Map<string, { entity_type: string; events: Row[] }>();
  for (const r of rows) {
    const cur = perEntity.get(r.entity_id);
    if (cur) cur.events.push(r);
    else perEntity.set(r.entity_id, { entity_type: r.entity_type, events: [r] });
  }

  const listings = [...perEntity.entries()]
    .map(([entity_id, { entity_type, events }]) => ({
      entityId: entity_id,
      entityType: entity_type,
      total: events.length,
      reach: new Set(events.map((e) => e.visitor_hash).filter(Boolean)).size,
      ...tally(events, (e) => e.event),
      topSource: Object.entries(tally(events, (e) => e.source))
        .sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'direct',
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 100);

  return NextResponse.json({
    days,
    totals,
    sources,
    listings,
    sampled: rows.length >= MAX_ROWS,
    note: rows.length === 0
      ? 'No events yet — they arrive as visitors browse listings.'
      : undefined,
  });
});
