/**
 * GET    /api/admin/biodata            — list every authored biodata
 * GET    /api/admin/biodata?profile_id= — one record
 * PUT    /api/admin/biodata            — create or replace (upsert by profile_id)
 * DELETE /api/admin/biodata?profile_id= — remove
 *
 * `sections` is validated through the same normaliser the renderer uses, so
 * what gets stored is exactly what the sheet can draw — no empty fields, no
 * unknown section types. Storing raw input would let an admin save a record
 * that silently renders as nothing.
 */
import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/admin-route';
import { normalizeSections } from '@/lib/biodata-schema';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { purgeTag } from '@/lib/cache/revalidate';

const COLS = 'profile_id, sections, updated_at, updated_by';

export const GET = withAdmin(async (req, { db }) => {
  const id = new URL(req.url).searchParams.get('profile_id');

  if (id) {
    const { data, error } = await db.from('ir_biodata').select(COLS).eq('profile_id', id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ biodata: data ?? null });
  }

  const { data, error } = await db.from('ir_biodata').select(COLS).order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ biodata: data ?? [] });
});

export const PUT = withAdmin(async (_req, { body, db, email }) => {
  const profileId = Number(body.profile_id);
  if (!Number.isSafeInteger(profileId) || profileId <= 0) {
    return NextResponse.json({ error: 'profile_id must be a positive integer' }, { status: 400 });
  }

  const sections = normalizeSections(body.sections);
  if (!sections.length) {
    return NextResponse.json(
      { error: 'No renderable sections. Every section needs a heading and at least one non-empty item.' },
      { status: 400 },
    );
  }

  const { data, error } = await db
    .from('ir_biodata')
    .upsert(
      { profile_id: profileId, sections, updated_at: new Date().toISOString(), updated_by: email },
      { onConflict: 'profile_id' },
    )
    .select(COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  purgeTag(CACHE_TAGS.biodata);
  return NextResponse.json({ biodata: data });
});

export const DELETE = withAdmin(async (req, { db }) => {
  const id = new URL(req.url).searchParams.get('profile_id');
  if (!id) return NextResponse.json({ error: 'profile_id required' }, { status: 400 });

  const { error } = await db.from('ir_biodata').delete().eq('profile_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  purgeTag(CACHE_TAGS.biodata);
  return NextResponse.json({ ok: true });
});
