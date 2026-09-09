/**
 * GET  /api/account/contacts  → the signed-in member's contact history
 * POST /api/account/contacts  → record one contact reveal
 *
 * This is lib/contact-log.ts moved onto the server. It used to live entirely
 * in localStorage under 'ir_contact_log_v1', which meant the history existed
 * only in the browser that made it: a member signing in on their phone saw an
 * empty list, and clearing site data destroyed the record of every credit they
 * had spent. See migration 033.
 *
 * The email comes from the better-auth session, never from the request body,
 * and both handlers write with the service role — the table denies writes to
 * `authenticated` precisely so a client cannot author its own history.
 *
 * Node runtime (better-auth needs it).
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { serviceClient } from '@/lib/credits';

export const runtime = 'nodejs';

/**
 * The cap that localStorage needed (MAX = 300) is gone — a table does not fill
 * up — but the READ is still bounded, because /contacted renders every row it
 * is given and a member with two years of history should not ship all of it to
 * paint the first screen.
 */
const READ_LIMIT = 300;

const KINDS = ['whatsapp', 'call'] as const;
type Kind = (typeof KINDS)[number];

interface LogRow {
  id: string;
  profile_id: number | null;
  profile_num: number | null;
  profile_title: string;
  kind: Kind;
  number: string;
  revealed: boolean;
  created_at: string;
}

/** The shape the page renders — unchanged from the localStorage ContactEntry,
 *  so the UI did not have to be rewritten along with the storage. */
function toEntry(row: LogRow) {
  return {
    id:           row.id,
    type:         row.kind,
    number:       row.number,
    profileId:    row.profile_id,
    profileNum:   row.profile_num ?? 0,
    profileTitle: row.profile_title,
    timestamp:    row.created_at,
    revealed:     row.revealed,
  };
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = session.user.email.toLowerCase();
  const db    = serviceClient();

  /**
   * Consume the reveal flags FIRST, in one statement, and use what it returns
   * as the "show in full this once" set.
   *
   * The localStorage version read every entry, mapped revealed→false and wrote
   * the whole array back — three steps, so two tabs opening /contacted at the
   * same time could each read `revealed: true` before either wrote, and both
   * would show a number meant to appear exactly once. `UPDATE ... RETURNING`
   * cannot split that way: the second call gets an empty set.
   */
  const { data: consumed, error: consumeErr } = await db
    .from('ir_contact_log')
    .update({ revealed: false })
    .eq('user_email', email)
    .eq('revealed', true)
    .select('id');

  if (consumeErr) {
    return NextResponse.json({ error: consumeErr.message }, { status: 500 });
  }

  const { data, error } = await db
    .from('ir_contact_log')
    .select('id, profile_id, profile_num, profile_title, kind, number, revealed, created_at')
    .eq('user_email', email)
    .order('created_at', { ascending: false })
    .limit(READ_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    entries:  (data ?? []).map(r => toEntry(r as LogRow)),
    freshIds: (consumed ?? []).map(r => r.id),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const kind = String(body?.type ?? '') as Kind;
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: 'type must be whatsapp or call' }, { status: 400 });
  }

  const number = String(body?.number ?? '').trim();
  if (!number) return NextResponse.json({ error: 'number required' }, { status: 400 });

  const profileId  = Number.parseInt(String(body?.profileId ?? ''), 10);
  const profileNum = Number.parseInt(String(body?.profileNum ?? ''), 10);

  const { data, error } = await serviceClient()
    .from('ir_contact_log')
    .insert({
      user_email:    session.user.email.toLowerCase(),
      profile_id:    Number.isFinite(profileId) ? profileId : null,
      profile_num:   Number.isFinite(profileNum) ? profileNum : null,
      profile_title: String(body?.profileTitle ?? '').slice(0, 300),
      kind,
      number,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
