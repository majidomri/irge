/**
 * POST   /api/admin/channels  — create a new channel
 * DELETE /api/admin/channels  — delete a channel by id (?id=)
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';

export const POST = withAdmin(async (_req, { body, db }) => {
  const name        = String(body.name        ?? '').trim();
  const slug        = String(body.slug        ?? '').trim();
  const description = String(body.description ?? '').trim() || null;
  const coverImage  = String(body.cover_image ?? '').trim() || null;

  if (!name || !slug) {
    return NextResponse.json({ error: 'name and slug required' }, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: 'slug must be lowercase letters/numbers/hyphens' }, { status: 400 });
  }

  const { data, error } = await db
    .from('ir_channels')
    .insert({ name, slug, description, cover_image: coverImage })
    .select('id, name, slug, description, cover_image, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ channel: data });
});

export const DELETE = withAdmin(async (req, { db }) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await db.from('ir_channels').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
});
