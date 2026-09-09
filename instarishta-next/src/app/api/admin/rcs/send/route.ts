/**
 * POST /api/admin/rcs/send — send one RCS message, or a batch.
 * GET  /api/admin/rcs/send — readiness, plus the recent send log.
 *
 * Body: { recipients: string[], payload: RcsPayload, traffic?: TrafficType,
 *         dryRun?: boolean, profileId?: number }
 *
 * ── Dry run is the default ───────────────────────────────────────────────────
 * `dryRun` must be explicitly set to false to dispatch anything. RCS has no
 * unsend: a mistake here is on a stranger's phone, next to messages from their
 * family, and no amount of apologising takes it back. A default that sends is
 * the wrong default for an endpoint whose worst outcome is irreversible.
 *
 * ── The log is written first ─────────────────────────────────────────────────
 * Every recipient gets a row at status 'queued' BEFORE its API call. A send
 * that times out therefore leaves a 'queued' row — "this may have gone out" —
 * which is the honest state. Writing the row afterwards would silently lose
 * exactly the sends most worth knowing about.
 *
 * The row id IS the messageId handed to Google, which is what makes a retry
 * idempotent rather than a second message.
 *
 * Admin-gated by withAdmin. Node runtime.
 */
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { withAdmin } from '@/lib/admin-route';
import { rcsReadiness, toE164 } from '@/lib/rcs/config';
import { isFatal, sendMessage } from '@/lib/rcs/client';
import { buildAgentMessage, validatePayload, type RcsPayload, type TrafficType } from '@/lib/rcs/messages';

export const runtime = 'nodejs';

/**
 * Recipients per request.
 *
 * Not a throughput limit — it is a blast-radius limit. A serverless function
 * has a wall-clock ceiling anyway, and a mistake that reaches 200 people is
 * recoverable in a way that one reaching 5,000 is not.
 */
const MAX_RECIPIENTS = 200;

const TRAFFIC: TrafficType[] = ['AUTHENTICATION', 'TRANSACTION', 'PROMOTION', 'SERVICEREQUEST', 'ACKNOWLEDGEMENT'];

export const GET = withAdmin(async (_req, { db }) => {
  const { data, error } = await db
    .from('ir_rcs_messages')
    .select('id, phone, status, error, traffic_type, payload, sent_by, batch_id, created_at, delivered_at, read_at')
    .order('created_at', { ascending: false })
    .limit(200);

  return NextResponse.json({
    readiness: rcsReadiness(),
    messages:  error ? [] : (data ?? []),
    error:     error?.message ?? null,
  });
});

export const POST = withAdmin(async (_req, { body, db, email }) => {
  const payload = body.payload as RcsPayload | undefined;
  if (!payload || typeof payload !== 'object' || !('kind' in payload)) {
    return NextResponse.json({ error: 'payload is required' }, { status: 400 });
  }

  const traffic: TrafficType = TRAFFIC.includes(body.traffic as TrafficType)
    ? (body.traffic as TrafficType)
    : 'TRANSACTION';

  // Every problem at once — an admin fixing a campaign one error per submit is
  // an admin who gives up on the fourth round trip.
  const problems = validatePayload(payload);
  if (problems.length) {
    return NextResponse.json({ error: problems[0], problems }, { status: 400 });
  }

  // ── Recipients ─────────────────────────────────────────────────────────────
  const raw = Array.isArray(body.recipients) ? body.recipients : [];
  if (raw.length === 0) return NextResponse.json({ error: 'No recipients' }, { status: 400 });

  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    const e164 = toE164(String(entry ?? ''));
    if (!e164) { invalid.push(String(entry)); continue; }
    // The same advertiser number appears on many listings — the business relay
    // number is on all 500. Deduping is what stops "send to this filter" from
    // meaning "send the same message to one person 40 times".
    if (seen.has(e164)) continue;
    seen.add(e164);
    valid.push(e164);
  }

  if (valid.length === 0) {
    return NextResponse.json({ error: 'No valid E.164 numbers among the recipients', invalid }, { status: 400 });
  }
  if (valid.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `${valid.length} recipients — the cap is ${MAX_RECIPIENTS} per send` },
      { status: 400 },
    );
  }

  // Explicit opt-in to actually dispatching. Anything other than a literal
  // false — missing, null, "false", 0 — stays a dry run.
  const dryRun = body.dryRun !== false;

  const readiness = rcsReadiness();
  if (!dryRun && !readiness.ready) {
    return NextResponse.json(
      { error: `Cannot send — RCS is not configured. Missing: ${readiness.missing.join(', ')}`, readiness },
      { status: 503 },
    );
  }

  const batchId    = randomUUID();
  const profileId  = Number.isFinite(Number(body.profileId)) ? Number(body.profileId) : null;
  const rendered   = buildAgentMessage(payload, traffic);

  const results: { phone: string; status: string; error?: string }[] = [];
  let stopped: string | null = null;

  for (const phone of valid) {
    const messageId = randomUUID();

    // Written BEFORE the call. See the header.
    const { error: insertErr } = await db.from('ir_rcs_messages').insert({
      id: messageId, phone, profile_id: profileId,
      payload: rendered, traffic_type: traffic,
      status: dryRun ? 'dry_run' : 'queued',
      sent_by: email, batch_id: batchId,
    });

    if (insertErr) {
      // An unlogged send is worse than an unsent message: it is a message on
      // someone's phone that nothing here records. Refuse rather than proceed.
      results.push({ phone, status: 'failed', error: `log write failed: ${insertErr.message}` });
      stopped = 'Could not write the send log — stopped before dispatching.';
      break;
    }

    if (dryRun) { results.push({ phone, status: 'dry_run' }); continue; }

    const outcome = await sendMessage({ phone, payload, traffic, messageId });

    const status = outcome.status === 'sent'        ? 'sent'
                 : outcome.status === 'unreachable' ? 'unreachable'
                 : 'failed';
    const error  = outcome.status === 'failed' ? outcome.error : null;

    await db.from('ir_rcs_messages').update({ status, error }).eq('id', messageId);
    results.push({ phone, status, ...(error ? { error } : {}) });

    if (isFatal(outcome)) {
      // An expired credential or a rate limit will fail identically for every
      // remaining number. Grinding through them turns one problem into 200 log
      // rows and, on a 429, digs the hole deeper.
      stopped = `Stopped after ${results.length} of ${valid.length}: ${error}`;
      break;
    }
  }

  const tally = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    ok: true, batchId, dryRun, tally, results,
    skippedInvalid: invalid,
    stopped,
    rendered: dryRun ? rendered : undefined,   // let the UI show what WOULD go
  });
});
