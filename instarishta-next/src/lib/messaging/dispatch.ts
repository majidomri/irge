/**
 * Building campaigns and sending messages.
 *
 * ── Rows first, calls second ─────────────────────────────────────────────────
 * Every message is a row before it is a request. A campaign is built by writing
 * one row per recipient — queued, or skipped with the reason — and the runner
 * then walks the queued rows. So a crash, timeout or deploy mid-campaign loses
 * nothing: the next run picks up the rows still queued. And a row is flipped to
 * 'submitted' only after the provider answers, which means a request that timed
 * out is left 'failed' with a network error — "may have gone out" — rather than
 * silently retried into a duplicate.
 */
import 'server-only';

import type { AdminDb } from '@/lib/admin-route';
import { measureSms, nextPromoWindow, parseNumbers, renderTemplate, toE164 } from './dlt';
import { recipientDecision, templateProblems, textProblems } from './compliance';
import { ingestEvents } from './events';
import { activeProvider } from './providers';
import { loadCtas, loadMembers, loadOptouts, loadSettings, loadTemplate } from './store';
import type { MessageRow, Settings, SubmitRequest, Template } from './types';

export interface UploadRow { mobile: string; name?: string; cols?: Record<string, string> }

export type Audience =
  | { kind: 'consented_members' }
  | { kind: 'numbers'; numbers: string[] }
  | { kind: 'test_numbers' }
  /** A recipient file in Nexus's upload format; extra columns feed {col:…} variables. */
  | { kind: 'upload'; filename?: string; rows: UploadRow[] };

interface Target { phone: string; email: string | null; name: string | null; consented: boolean; cols?: Record<string, string> }

async function resolveTargets(db: AdminDb, audience: Audience, settings: Settings): Promise<{ targets: Target[]; invalid: string[] }> {
  const members = await loadMembers(db);
  const byPhone = new Map<string, (typeof members)[number]>();
  for (const m of members) {
    // Only a VERIFIED number is attributed to a member. An unverified one is a
    // string somebody typed, and its "consent" would be someone else's.
    if (m.phone && m.phone_verified) byPhone.set(m.phone, m);
  }

  const toTarget = (phone: string): Target => {
    const m = byPhone.get(phone);
    return { phone, email: m?.email ?? null, name: m?.name ?? null, consented: !!m?.rcs_consent };
  };

  if (audience.kind === 'consented_members') {
    return { targets: [...byPhone.values()].filter(m => m.rcs_consent).map(m => toTarget(m.phone!)), invalid: [] };
  }
  if (audience.kind === 'test_numbers') {
    return { targets: settings.test_numbers.map(toTarget), invalid: [] };
  }
  if (audience.kind === 'upload') {
    const invalid: string[] = [];
    const seen = new Set<string>();
    const targets: Target[] = [];
    for (const r of audience.rows) {
      const phone = toE164(r.mobile);
      if (!phone) { invalid.push(r.mobile); continue; }
      if (seen.has(phone)) continue;
      seen.add(phone);
      const t = toTarget(phone);
      // A member's verified name wins over whatever the file says; the file's
      // name is used for everyone else.
      targets.push({ ...t, name: t.name ?? (r.name?.trim() || null), cols: r.cols });
    }
    return { targets, invalid };
  }
  const { valid, invalid } = parseNumbers(audience.numbers.join('\n'));
  return { targets: valid.map(toTarget), invalid };
}

export interface BuildResult {
  ok:        boolean;
  problems:  string[];
  queued:    number;
  skipped:   number;
  invalid:   string[];
  reasons:   Record<string, number>;
  sample?:   { phone: string; text: string; segments: number; encoding: string };
}

/** Upper bound on one campaign. Bigger sends are several campaigns, on purpose. */
export const MAX_CAMPAIGN = 10_000;

/**
 * Turn a draft into rows. Safe to call again: existing rows for the campaign
 * are cleared first, as long as nothing has been sent from it yet.
 */
export async function buildCampaign(db: AdminDb, campaignId: string): Promise<BuildResult> {
  const empty = { queued: 0, skipped: 0, invalid: [], reasons: {} };

  const { data: c } = await db.from('ir_msg_campaigns').select('*').eq('id', campaignId).maybeSingle();
  if (!c) return { ok: false, problems: ['Campaign not found'], ...empty };
  if (!['draft', 'scheduled'].includes(c.status)) {
    return { ok: false, problems: [`Campaign is ${c.status}; only drafts can be rebuilt`], ...empty };
  }

  const settings = await loadSettings(db);
  const loaded = await loadTemplate(db, c.template_id);
  if (!loaded) return { ok: false, problems: ['Template not found'], ...empty };
  const { template, sender } = loaded;

  const ctas = await loadCtas(db);
  const problems = templateProblems(template, sender, settings, ctas);
  // Render once with samples to catch template-wide faults (slot count, a
  // static value over the limit, a link that is not a whitelisted CTA) before
  // writing thousands of rows.
  // File-column variables are probed with the file's first row; without a file
  // they resolve empty, which is the right error ("{col:var1}" needs an upload).
  const audience = c.audience as Audience;
  const firstCols = audience.kind === 'upload' ? audience.rows[0]?.cols : undefined;
  const probe = renderTemplate(template.body, template.variables, c.variables ?? {}, { name: 'Sample Name', cols: firstCols });
  problems.push(...probe.problems, ...textProblems(template, probe.text, ctas));
  if (problems.length) return { ok: false, problems, ...empty };

  const { targets, invalid } = await resolveTargets(db, c.audience as Audience, settings);
  if (targets.length > MAX_CAMPAIGN) {
    return { ok: false, problems: [`${targets.length} recipients — the limit per campaign is ${MAX_CAMPAIGN}`], ...empty, invalid };
  }

  const optouts = await loadOptouts(db);

  const { count: already } = await db.from('ir_msg_messages').select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId).not('status', 'in', '(queued,skipped,dry_run)');
  if ((already ?? 0) > 0) {
    return { ok: false, problems: ['Messages from this campaign have already been sent; it cannot be rebuilt'], ...empty };
  }
  await db.from('ir_msg_messages').delete().eq('campaign_id', campaignId);

  const reasons: Record<string, number> = {};
  const rows: Record<string, unknown>[] = [];
  let queued = 0;

  for (const t of targets) {
    const decision = recipientDecision(template, settings, { phone: t.phone, consented: t.consented, optedOut: optouts.has(t.phone) });
    const r = renderTemplate(template.body, template.variables, c.variables ?? {}, { name: t.name, cols: t.cols });
    const ok = decision.ok && r.ok;
    const reason = !decision.ok ? decision.reason : !r.ok ? r.problems[0] : null;
    if (reason) reasons[reason] = (reasons[reason] ?? 0) + 1;
    if (ok) queued++;

    rows.push({
      campaign_id: campaignId, template_id: template.id,
      channel: template.channel, category: template.category,
      sender_code: sender?.sender_code ?? null, dlt_template_id: template.dlt_template_id,
      phone: t.phone, email: t.email,
      body: r.text, variables: Object.fromEntries(template.variables.map((v, i) => [v.key, r.values[i] ?? ''])),
      segments: template.channel === 'sms' ? measureSms(r.text).segments : null,
      status: ok ? 'queued' : 'skipped', skip_reason: reason,
      mode: settings.mode, sent_by: c.created_by, provider: activeProvider().id,
    });
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('ir_msg_messages').insert(rows.slice(i, i + 500));
    if (error) return { ok: false, problems: [`Could not write messages: ${error.message}`], ...empty };
  }

  await db.from('ir_msg_campaigns').update({ total: rows.length, skipped: rows.length - queued }).eq('id', campaignId);

  const first = rows.find(r => r.status === 'queued') ?? rows[0];
  const text = String(first?.body ?? probe.text);
  const m = measureSms(text);
  return {
    ok: true, problems: [], queued, skipped: rows.length - queued, invalid, reasons,
    sample: first ? { phone: String(first.phone), text, segments: m.segments, encoding: m.encoding } : undefined,
  };
}

// ── Sending ───────────────────────────────────────────────────────────────────

function toRequest(row: MessageRow, template: Template, settings: Settings): SubmitRequest {
  return {
    messageId: row.id, channel: row.channel, category: row.category, phone: row.phone,
    text: row.body, values: template.variables.map(v => row.variables?.[v.key] ?? ''),
    senderCode: row.sender_code, dltEntityId: settings.dlt_entity_id,
    dltTemplateId: row.dlt_template_id, providerTemplateId: template.provider_template_id,
    rcsPayload: template.rcs_payload,
  };
}

/** Send one queued row. Returns whether the failure should stop a campaign. */
export async function sendRow(db: AdminDb, row: MessageRow, template: Template, settings: Settings): Promise<{ status: string; fatal: boolean; error?: string }> {
  const provider = activeProvider();
  const req = toRequest(row, template, settings);

  // Claim the row: queued → submitted-in-flight is done by a conditional update
  // so two runners racing on the same campaign cannot both send it.
  const { data: claimed } = await db.from('ir_msg_messages')
    .update({ status: 'submitted', provider: provider.id, mode: settings.mode, submitted_at: new Date().toISOString() })
    .eq('id', row.id).eq('status', 'queued').select('id');
  if (!claimed?.length) return { status: 'skipped', fatal: false, error: 'already claimed' };

  const outcome = await provider.submit(req);

  if (outcome.status === 'submitted') {
    await db.from('ir_msg_messages').update({ provider_message_id: outcome.providerMessageId }).eq('id', row.id);
    if (provider.simulateReceipts) await ingestEvents(db, provider.id, provider.simulateReceipts(req, outcome));
    return { status: 'submitted', fatal: false };
  }
  if (outcome.status === 'unreachable') {
    await db.from('ir_msg_messages').update({ status: 'unreachable', error: outcome.error ?? null }).eq('id', row.id);
    return { status: 'unreachable', fatal: false };
  }

  if (outcome.fatal) {
    // Nothing went out, so give the row back to the queue: resuming the
    // campaign after fixing credentials should send it, not skip it.
    await db.from('ir_msg_messages').update({ status: 'queued', submitted_at: null, error: outcome.error, error_code: outcome.code ?? null }).eq('id', row.id);
  } else {
    await db.from('ir_msg_messages').update({ status: 'failed', error: outcome.error, error_code: outcome.code ?? null }).eq('id', row.id);
  }
  return { status: 'failed', fatal: outcome.fatal, error: outcome.error };
}

export interface BatchResult {
  processed:  number;
  remaining:  number;
  done:       boolean;
  /** Promotional traffic outside the window: try again at this time. */
  waitUntil?: string;
  stopped?:   string;
}

/**
 * Send the next `size` queued messages of a running campaign.
 *
 * Called by the Inngest runner in a loop, and by the "send next batch" button
 * as a manual fallback. Every guard is re-checked per batch — status, window,
 * cap, template approval — because any of them can change mid-campaign.
 */
export async function runCampaignBatch(db: AdminDb, campaignId: string, size = 50): Promise<BatchResult> {
  const { data: c } = await db.from('ir_msg_campaigns').select('*').eq('id', campaignId).maybeSingle();
  if (!c) return { processed: 0, remaining: 0, done: true, stopped: 'Campaign not found' };
  if (c.status !== 'running') return { processed: 0, remaining: 0, done: true, stopped: `Campaign is ${c.status}` };

  const settings = await loadSettings(db);
  const loaded = await loadTemplate(db, c.template_id);
  if (!loaded) return stop(db, campaignId, 'Template was deleted');
  const { template, sender } = loaded;

  const problems = templateProblems(template, sender, settings, await loadCtas(db));
  if (problems.length) return pause(db, campaignId, problems[0]);

  const provider = activeProvider().readiness();
  if (!provider.ready) return pause(db, campaignId, `Provider not ready: ${[...provider.missing, ...provider.notes].join('; ')}`);

  if (template.category === 'promotional') {
    const next = nextPromoWindow(settings.promo_window_start, settings.promo_window_end);
    if (next) return { processed: 0, remaining: await remainingCount(db, campaignId), done: false, waitUntil: next.toISOString() };
  }

  let limit = size;
  if (settings.mode === 'live') {
    const { data: today } = await db.rpc('ir_msg_live_count_today');
    const left = settings.daily_cap - Number(today ?? 0);
    if (left <= 0) return pause(db, campaignId, `Daily cap of ${settings.daily_cap} live messages reached`);
    limit = Math.min(limit, left);
  }

  const { data: rows } = await db.from('ir_msg_messages').select('*')
    .eq('campaign_id', campaignId).eq('status', 'queued').order('created_at').limit(limit);

  // Opt-outs can arrive while a campaign runs — a STOP to message 3 must
  // protect that number from message 3's retry and every later campaign.
  const batch = (rows ?? []) as MessageRow[];
  const optouts = await loadOptouts(db, batch.map(r => r.phone));

  let processed = 0;
  for (const row of batch) {
    const decision = recipientDecision(template, settings, { phone: row.phone, consented: true, optedOut: optouts.has(row.phone) });
    // Switching to test mode mid-campaign is a pause, not a reason to skip the
    // rest of the audience forever.
    if (!decision.ok && decision.reason.startsWith('test mode')) {
      return pause(db, campaignId, 'Switched to test mode — campaign recipients are not test numbers');
    }
    if (!decision.ok) {
      await db.from('ir_msg_messages').update({ status: 'skipped', skip_reason: decision.reason }).eq('id', row.id).eq('status', 'queued');
      processed++;
      continue;
    }
    const r = await sendRow(db, row, template, settings);
    processed++;
    if (r.fatal) return failCampaign(db, campaignId, r.error ?? 'Provider error', processed);
  }

  const remaining = await remainingCount(db, campaignId);
  if (remaining === 0) {
    await db.from('ir_msg_campaigns').update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', campaignId).eq('status', 'running');
    return { processed, remaining, done: true };
  }
  return { processed, remaining, done: false };
}

async function remainingCount(db: AdminDb, campaignId: string) {
  const { count } = await db.from('ir_msg_messages').select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId).eq('status', 'queued');
  return count ?? 0;
}

async function pause(db: AdminDb, id: string, reason: string): Promise<BatchResult> {
  await db.from('ir_msg_campaigns').update({ status: 'paused', last_error: reason }).eq('id', id).eq('status', 'running');
  return { processed: 0, remaining: await remainingCount(db, id), done: true, stopped: reason };
}

async function stop(db: AdminDb, id: string, reason: string): Promise<BatchResult> {
  await db.from('ir_msg_campaigns').update({ status: 'failed', last_error: reason }).eq('id', id);
  return { processed: 0, remaining: 0, done: true, stopped: reason };
}

async function failCampaign(db: AdminDb, id: string, reason: string, processed: number): Promise<BatchResult> {
  await db.from('ir_msg_campaigns').update({ status: 'failed', last_error: reason }).eq('id', id);
  return { processed, remaining: await remainingCount(db, id), done: true, stopped: reason };
}

// ── Test sends ───────────────────────────────────────────────────────────────

export const MAX_TEST_SEND = 5;

/**
 * Send one template to up to five of the listed test numbers, now.
 *
 * Restricted to test numbers in BOTH modes. A "quick test" field that accepts
 * any number is a campaign of one without any of a campaign's checks.
 */
export async function testSend(db: AdminDb, opts: {
  templateId: string; variables: Record<string, string>; phones: string[]; actor: string;
}) {
  const settings = await loadSettings(db);
  const loaded = await loadTemplate(db, opts.templateId);
  if (!loaded) return { ok: false as const, problems: ['Template not found'] };
  const { template, sender } = loaded;

  const problems = templateProblems(template, sender, settings);
  const { valid, invalid } = parseNumbers(opts.phones.join('\n'));
  if (invalid.length) problems.push(`Not valid numbers: ${invalid.join(', ')}`);
  if (valid.length === 0) problems.push('No numbers');
  if (valid.length > MAX_TEST_SEND) problems.push(`At most ${MAX_TEST_SEND} numbers per test`);
  const strangers = valid.filter(p => !settings.test_numbers.includes(p));
  if (strangers.length) problems.push(`Not in the test numbers list (Settings): ${strangers.join(', ')}`);

  const r = renderTemplate(template.body, template.variables, opts.variables, { name: 'Test' }, { useSamples: true });
  const ctas = await loadCtas(db);
  problems.push(...r.problems, ...textProblems(template, r.text, ctas));

  const provider = activeProvider();
  const ready = provider.readiness();
  if (!ready.ready) problems.push(`Provider not ready: ${[...ready.missing, ...ready.notes].join('; ')}`);
  if (problems.length) return { ok: false as const, problems };

  const results: { phone: string; status: string; error?: string; id: string }[] = [];
  for (const phone of valid) {
    const { data, error } = await db.from('ir_msg_messages').insert({
      template_id: template.id, channel: template.channel, category: template.category,
      sender_code: sender?.sender_code ?? null, dlt_template_id: template.dlt_template_id,
      phone, body: r.text,
      variables: Object.fromEntries(template.variables.map((v, i) => [v.key, r.values[i] ?? ''])),
      segments: template.channel === 'sms' ? measureSms(r.text).segments : null,
      status: 'queued', mode: 'test', sent_by: opts.actor, provider: provider.id,
    }).select('*').single();
    if (error || !data) { results.push({ phone, status: 'failed', error: error?.message ?? 'log write failed', id: '' }); break; }

    // Test sends are always recorded as test traffic, whatever the mode.
    const out = await sendRow(db, data as MessageRow, template, { ...settings, mode: 'test' });
    results.push({ phone, status: out.status, error: out.error, id: (data as MessageRow).id });
    if (out.fatal) break;
  }

  return { ok: true as const, provider: provider.id, reachesPhones: ready.reachesPhones, text: r.text, results };
}
