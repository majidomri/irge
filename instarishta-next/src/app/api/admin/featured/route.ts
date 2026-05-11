/**
 * GET    /api/admin/featured    — list featured items
 * POST   /api/admin/featured    — create
 * DELETE /api/admin/featured?id= — delete
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';

export const GET = withAdmin(async (_req, { db }) => {
  const { data, error } = await db
    .from('ir_featured')
    .select('id, title, description, image_url, link_url, placement, active, sort_order, created_at')
    .order('sort_order', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ featured: data ?? [] });
});

export const POST = withAdmin(async (_req, { body, db }) => {
  const title       = String(body.title       ?? '').trim();
  const description = String(body.description ?? '').trim() || null;
  const imageUrl    = String(body.image_url   ?? '').trim() || null;
  const linkUrl     = String(body.link_url    ?? '').trim() || null;
  const placement   = String(body.placement   ?? 'all').trim();
  const active      = body.active !== false;
  const sortOrder   = Number(body.sort_order ?? 0);

  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  if (!['all', 'home', 'channels', 'profiles'].includes(placement)) {
    return NextResponse.json({ error: 'placement must be all|home|channels|profiles' }, { status: 400 });
  }

  const { data, error } = await db
    .from('ir_featured')
    .insert({
      title, description, image_url: imageUrl, link_url: linkUrl,
      placement, active, sort_order: sortOrder,
    })
    .select('id, title, description, image_url, link_url, placement, active, sort_order, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ featured: data });
});

export const DELETE = withAdmin(async (req, { db }) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await db.from('ir_featured').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
});
