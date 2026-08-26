/**
 * POST   /api/admin/channels  — create a new channel
 * PATCH  /api/admin/channels  — update a channel's editable fields
 * DELETE /api/admin/channels  — delete a channel by id (?id=)
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';

const COLS = 'id, name, slug, description, cover_image, created_at, is_cohort';

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
    .select(COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ channel: data });
});

/**
 * Partial update. Only the keys actually present in the body are written, so
 * clearing a field ("" → null) stays distinguishable from leaving it alone
 * (key omitted) — a PUT-shaped handler would wipe whatever the caller didn't
 * resend.
 *
 * `is_cohort` is deliberately NOT editable here. Flipping it moves a row
 * between two different products — real channels render at /channels, cohorts
 * at /cohorts with a profession_key and member_count — and doing that to a
 * channel that already holds posts strands them where nothing lists them.
 * That's a migration, not a field edit.
 */
export const PATCH = withAdmin(async (_req, { body, db }) => {
  const id = String(body.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const patch: Record<string, string | null> = {};

  if ('name' in body) {
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    patch.name = name;
  }

  if ('slug' in body) {
    const slug = String(body.slug ?? '').trim();
    if (!slug) return NextResponse.json({ error: 'slug cannot be empty' }, { status: 400 });
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json({ error: 'slug must be lowercase letters/numbers/hyphens' }, { status: 400 });
    }
    patch.slug = slug;
  }

  // These two are nullable, so an empty string is a real instruction to clear.
  if ('description' in body) patch.description = String(body.description ?? '').trim() || null;
  if ('cover_image' in body) patch.cover_image = String(body.cover_image ?? '').trim() || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { data, error } = await db
    .from('ir_channels')
    .update(patch)
    .eq('id', id)
    .select(COLS)
    .maybeSingle();

  if (error) {
    // The slug carries a unique constraint; report the collision plainly
    // rather than leaking the Postgres message.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That slug is already taken' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

  return NextResponse.json({ channel: data });
});

export const DELETE = withAdmin(async (req, { db }) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await db.from('ir_channels').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
});
