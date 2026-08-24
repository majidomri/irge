/**
 * GET   /api/admin/professions  → the full vocabulary, retired included
 * POST  /api/admin/professions  { key, label, icon, slug, accepts, proofHint, labelUr?, sortOrder?, active? }
 * PATCH /api/admin/professions  { key, ...same fields }  → edit in place
 *
 * Lets the business owner add "Lawyer" or "Professor" from /nizam instead of
 * waiting on a deploy. Creating a profession also creates its cohort circle,
 * in one transaction — see ir_upsert_profession (migration 017). A profession
 * without a circle is a badge with nowhere to go.
 *
 * Two rules this route enforces that the schema cannot:
 *
 *   1. A key is permanent. It is stored on ir_user_profiles.profession_key
 *      and ir_channels.profession_key, and renaming it would orphan every
 *      member holding it — their badge would silently stop rendering. PATCH
 *      therefore edits everything EXCEPT the key.
 *
 *   2. There is no delete. Retiring (active=false) hides a profession from
 *      the apply form while leaving existing members verified. A hard delete
 *      is the same orphaning problem wearing a different hat.
 *
 * Admin-gated via withAdmin. Node runtime (inherited from withAdmin).
 */
import { NextResponse } from 'next/server';
import { withAdmin, type AdminDb } from '@/lib/admin-route';
import {
  loadProfessions, isDocType, slugifyProfession, isValidProfessionKey,
  PROFESSION_COLS, type DocType,
} from '@/lib/professions';

interface ParsedInput {
  label: string;
  icon: string;
  slug: string;
  accepts: DocType[];
  proofHint: string | null;
  labelUr: string | null;
  sortOrder: number;
  active: boolean;
}

/** Validate the shared field set. Returns an error string, or the parsed input. */
function parseInput(body: Record<string, unknown>): { error: string } | ParsedInput {
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label) return { error: 'A label is required' };
  if (label.length > 60) return { error: 'Label is too long (60 characters max)' };

  const rawAccepts = Array.isArray(body.accepts) ? body.accepts : [];
  const accepts = rawAccepts.filter(isDocType);
  // A profession that accepts nothing can never be applied for — it would
  // sit on the form rejecting every submission.
  if (accepts.length === 0) return { error: 'Choose at least one accepted proof type' };

  const slug = (typeof body.slug === 'string' && body.slug.trim())
    ? slugifyProfession(body.slug)
    : slugifyProfession(label);
  if (!slug) return { error: 'Could not derive a valid slug from that label' };

  return {
    label,
    icon:      typeof body.icon === 'string' && body.icon.trim() ? body.icon.trim().slice(0, 8) : '✅',
    slug,
    accepts,
    proofHint: typeof body.proofHint === 'string' ? body.proofHint.trim().slice(0, 500) || null : null,
    labelUr:   typeof body.labelUr === 'string' ? body.labelUr.trim().slice(0, 120) || null : null,
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 100,
    active:    body.active === undefined ? true : body.active !== false,
  };
}

async function upsert(db: AdminDb, key: string, input: ParsedInput) {
  const { data, error } = await db.rpc('ir_upsert_profession', {
    p_key:        key,
    p_label:      input.label,
    p_icon:       input.icon,
    p_slug:       input.slug,
    p_accepts:    input.accepts,
    p_proof_hint: input.proofHint,
    p_label_ur:   input.labelUr,
    p_sort_order: input.sortOrder,
    p_active:     input.active,
  });

  if (error) {
    // ir_professions.slug is unique, and so is ir_channels.slug — either way
    // the admin needs to pick a different one.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'That slug is already taken by another profession or channel' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, profession: data });
}

export const GET = withAdmin(async (_req, { db }) => {
  // Retired professions included: /nizam is where they get un-retired.
  const professions = await loadProfessions(db, { activeOnly: false });
  return NextResponse.json({ professions });
});

export const POST = withAdmin(async (_req, { db, body }) => {
  const key = typeof body.key === 'string' ? body.key.trim().toLowerCase() : '';
  if (!isValidProfessionKey(key)) {
    return NextResponse.json(
      { error: 'Key must be lowercase letters, digits and underscores, starting with a letter' },
      { status: 400 },
    );
  }

  const parsed = parseInput(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // POST is create-only. Silently overwriting an existing profession would
  // let a typo'd key rewrite a live one.
  const { data: existing } = await db
    .from('ir_professions').select('key').eq('key', key).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `Profession "${key}" already exists` }, { status: 409 });
  }

  return upsert(db, key, parsed);
});

export const PATCH = withAdmin(async (_req, { db, body }) => {
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

  const { data: existing } = await db
    .from('ir_professions').select(PROFESSION_COLS).eq('key', key).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'No such profession' }, { status: 404 });

  const parsed = parseInput(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  return upsert(db, key, parsed);
});
