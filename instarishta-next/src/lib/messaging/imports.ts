/**
 * Importing Nexus (Ojiva) exports into the log.
 *
 * Three file shapes, recognised by their header row — the formats below are
 * copied from the first real exports, not from documentation:
 *
 *   delivery_report   Message ID, Campaign, Mobile, Sender ID, Message, Sent At,
 *                     Delivered At, Status, Error Code, Gateway, Cost
 *   campaign_report   S.No, Campaign, Mobile, Message, Status, Error Code,
 *                     DLR Status, Delivered At
 *   account_summary   #, User, Mobile, Role, Billing, Total SMS, Delivered,
 *                     Failed, Pending, Delivery Rate, Credits Used, Balance, Rate/SMS
 *
 * ── Where a row goes ────────────────────────────────────────────────────────
 * A report row is matched, in order, to:
 *   1. the message with that gateway Message ID (re-importing is idempotent);
 *   2. a message of OUR campaign with the same name, to the same number — the
 *      round trip for a campaign exported from here and uploaded to Nexus;
 *   3. an earlier imported message to the same number with the same text —
 *      the campaign report has no Message ID, so this is how it joins the
 *      delivery report instead of duplicating it;
 * and inserted as history otherwise. Status only moves forward, as with
 * webhook receipts.
 *
 * Every import is a preview first: `commit: false` returns what would happen,
 * and nothing is written until the admin confirms.
 */
import 'server-only';

import type { AdminDb } from '@/lib/admin-route';
import { csvObjects } from './csv';
import { matchTemplate, measureSms, toE164 } from './dlt';
import { RANK } from './events';
import type { MessageStatus, Template } from './types';

export type ImportKind = 'delivery_report' | 'campaign_report' | 'account_summary' | 'audience' | 'unknown';

export function detectKind(headers: string[]): ImportKind {
  const h = new Set(headers);
  if (h.has('message id') && h.has('mobile') && h.has('status')) return 'delivery_report';
  if (h.has('dlr status') && h.has('mobile'))                    return 'campaign_report';
  if (h.has('rate/sms') || (h.has('credits used') && h.has('balance'))) return 'account_summary';
  if (h.has('mobile') && !h.has('status'))                       return 'audience';
  return 'unknown';
}

/**
 * What the error codes seen so far meant, from the evidence in the reports.
 * Only codes with evidence are described; anything else is shown raw.
 */
export const ERROR_NOTES: Record<string, string> = {
  '000': 'Delivered',
  '321': 'Refused — seen on messages sent with {#alp#}/{#num#} left unfilled, i.e. text not matching the approved template',
  '350': 'Operator reported undelivered to this handset (meaning not yet confirmed with Ojiva)',
};

/** Nexus timestamps are IST without an offset: "2026-09-12 17:11:37" or "12 Sep 2026 17:11:44". */
export function parseIst(raw: string | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s || s === '—' || s === '-') return null;
  const months: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  let y: number, mo: number, d: number, hh = 0, mm = 0, ss = 0;
  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) { [y, mo, d, hh, mm] = [+m[1], +m[2], +m[3], +m[4], +m[5]]; ss = +(m[6] ?? 0); }
  else if ((m = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s))) {
    d = +m[1]; mo = months[m[2].toLowerCase()] ?? 0; y = +m[3]; hh = +(m[4] ?? 0); mm = +(m[5] ?? 0); ss = +(m[6] ?? 0);
    if (!mo) return null;
  } else return null;
  return new Date(Date.UTC(y, mo - 1, d, hh, mm, ss) - 330 * 60_000).toISOString();
}

function mapStatus(status: string, dlr?: string): MessageStatus {
  const s = `${status} ${dlr ?? ''}`.toLowerCase();
  if (/deliv(ered|rd)/.test(s) && !/undeliv/.test(s)) return 'delivered';
  if (/undeliv|fail|reject|expire/.test(s))           return 'failed';
  if (/pending|sent|submit|accept/.test(s))           return 'sent';
  return 'sent';
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

interface Parsed {
  phone: string; body: string; status: MessageStatus; campaign: string | null; senderCode: string | null;
  providerMessageId: string | null; sentAt: string | null; deliveredAt: string | null;
  errorCode: string | null; gateway: string | null; cost: number | null; rowNo: number;
}

export interface ImportResult {
  kind:      ImportKind;
  rows:      number;
  inserted:  number;
  updated:   number;
  skipped:   number;
  notes:     string[];
  sample:    Record<string, unknown>[];
  summary?:  Record<string, string>;
  committed: boolean;
}

export async function importGrid(db: AdminDb, opts: {
  grid: string[][]; filename: string; actor: string; commit: boolean;
}): Promise<ImportResult> {
  const { headers, records } = csvObjects(opts.grid);
  const kind = detectKind(headers);
  const base: ImportResult = { kind, rows: records.length, inserted: 0, updated: 0, skipped: 0, notes: [], sample: [], committed: false };

  if (kind === 'unknown') {
    return { ...base, notes: [`Unrecognised columns: ${headers.join(', ')}`] };
  }
  if (kind === 'audience') {
    return { ...base, notes: ['This is a recipient list (Nexus upload format). Use it in Campaigns → New campaign → Upload file.'] };
  }

  // ── Account summary ─────────────────────────────────────────────────────────
  if (kind === 'account_summary') {
    const row = records[0] ?? {};
    const num = (v: string | undefined) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : null; };
    const summary = row;
    if (opts.commit) {
      await db.from('ir_msg_settings').update({
        provider_balance: num(row['balance']), provider_rate: num(row['rate/sms']),
        provider_summary: summary, provider_summary_at: new Date().toISOString(),
      }).eq('id', 1);
      await logImport(db, kind, opts, { rows: records.length, inserted: 0, updated: 1, skipped: 0, notes: [] });
    }
    return { ...base, updated: 1, summary, committed: opts.commit };
  }

  // ── Message reports ─────────────────────────────────────────────────────────
  const notes: string[] = [];
  const parsed: Parsed[] = [];
  records.forEach((r, i) => {
    const phone = toE164(r['mobile'] ?? '');
    const body = (r['message'] ?? '').replace(/\r\n/g, '\n');
    if (!phone || !body) { notes.push(`Row ${i + 2}: missing or invalid mobile/message — skipped`); return; }
    const code = (r['error code'] ?? '').trim();
    parsed.push({
      phone, body, rowNo: i + 2,
      status: mapStatus(r['status'] ?? '', r['dlr status']),
      campaign: r['campaign'] || null,
      senderCode: r['sender id'] || null,
      providerMessageId: r['message id'] || null,
      sentAt: parseIst(r['sent at']),
      deliveredAt: parseIst(r['delivered at']),
      errorCode: code || null,
      gateway: r['gateway'] || null,
      cost: r['cost'] ? Number(r['cost']) : null,
    });
  });

  const { data: tplData } = await db.from('ir_msg_templates').select('*');
  const templates = (tplData ?? []) as Template[];

  // Existing rows that could match, fetched once.
  const phones = [...new Set(parsed.map(p => p.phone))];
  const { data: existingData } = phones.length
    ? await db.from('ir_msg_messages')
        .select('id, phone, body, status, provider_message_id, campaign_id, external_campaign, delivered_at, source')
        .in('phone', phones).limit(20_000)
    : { data: [] };
  const existing = (existingData ?? []) as {
    id: string; phone: string; body: string; status: MessageStatus; provider_message_id: string | null;
    campaign_id: string | null; external_campaign: string | null; delivered_at: string | null; source: string;
  }[];

  const names = [...new Set(parsed.map(p => p.campaign?.toLowerCase()).filter(Boolean))] as string[];
  const { data: ours } = names.length
    ? await db.from('ir_msg_campaigns').select('id, name')
    : { data: [] };
  const campaignByName = new Map(((ours ?? []) as { id: string; name: string }[])
    .filter(c => names.includes(c.name.toLowerCase())).map(c => [c.name.toLowerCase(), c.id]));

  const used = new Set<string>();
  const inserts: Record<string, unknown>[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const touchedCampaigns = new Set<string>();
  let unmatchedTemplates = 0;
  let skipped = 0;

  for (const p of parsed) {
    const match = matchTemplate(p.body, templates);
    if (!match) unmatchedTemplates++;

    const byId = p.providerMessageId
      ? existing.find(e => e.provider_message_id === p.providerMessageId && !used.has(e.id)) : undefined;
    const ourCampaign = p.campaign ? campaignByName.get(p.campaign.toLowerCase()) : undefined;
    const byCampaign = !byId && ourCampaign
      ? existing.find(e => e.campaign_id === ourCampaign && e.phone === p.phone && !used.has(e.id)) : undefined;
    const byText = !byId && !byCampaign
      ? existing.find(e => e.phone === p.phone && !used.has(e.id) && collapse(e.body) === collapse(p.body)
          && (e.source === 'import' || !e.provider_message_id)) : undefined;
    const target = byId ?? byCampaign ?? byText;

    const fields: Record<string, unknown> = {
      provider: 'ojiva',
      external_campaign: p.campaign,
      gateway: p.gateway,
      ...(p.providerMessageId ? { provider_message_id: p.providerMessageId } : {}),
      ...(p.sentAt ? { sent_at: p.sentAt, submitted_at: p.sentAt } : {}),
      ...(p.deliveredAt ? { delivered_at: p.deliveredAt } : {}),
      ...(p.cost !== null && Number.isFinite(p.cost) ? { cost: p.cost } : {}),
      ...(p.errorCode && p.errorCode !== '000' ? { error_code: p.errorCode, error: ERROR_NOTES[p.errorCode] ?? `Gateway error ${p.errorCode}` } : {}),
    };

    if (target) {
      used.add(target.id);
      const patch: Record<string, unknown> = { ...fields };
      if (RANK[p.status] > RANK[target.status]) patch.status = p.status;
      else if (p.status === 'failed' && target.status === 'sent') patch.status = 'failed';
      if (target.campaign_id) touchedCampaigns.add(target.campaign_id);
      updates.push({ id: target.id, patch });
      continue;
    }

    // A second row for the same gateway id inside one file is a duplicate.
    // Rows WITHOUT an id are never deduplicated within a file: the same text to
    // the same number twice may be two real sends, and nothing tells them apart.
    if (p.providerMessageId && inserts.some(r => r.provider_message_id === p.providerMessageId)) { skipped++; continue; }

    inserts.push({
      ...fields,
      source: 'import', channel: 'sms', mode: 'test',
      phone: p.phone, body: p.body, status: p.status,
      sender_code: p.senderCode,
      template_id: match?.template.id ?? null,
      category: match?.template.category ?? 'unknown',
      dlt_template_id: match?.template.dlt_template_id ?? null,
      variables: match ? Object.fromEntries(match.template.variables.map((v, i) => [v.key, match.values[i] ?? ''])) : {},
      segments: measureSms(p.body).segments,
      sent_by: `import:${opts.actor}`,
    });
  }

  if (unmatchedTemplates) {
    notes.push(`${unmatchedTemplates} of ${parsed.length} messages match no template registered here — either add the template, or these were sent with text the operator would refuse.`);
  }
  const codes = parsed.filter(p => p.errorCode && p.errorCode !== '000').reduce<Record<string, number>>((a, p) => { a[p.errorCode!] = (a[p.errorCode!] ?? 0) + 1; return a; }, {});
  for (const [code, n] of Object.entries(codes)) notes.push(`Error ${code} × ${n}: ${ERROR_NOTES[code] ?? 'meaning unknown — ask Ojiva'}`);

  const result: ImportResult = {
    ...base, inserted: inserts.length, updated: updates.length, skipped: skipped + (records.length - parsed.length), notes,
    sample: [...inserts.slice(0, 5), ...updates.slice(0, 5).map(u => ({ id: u.id, ...u.patch }))],
  };
  if (!opts.commit) return result;

  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await db.from('ir_msg_messages').insert(inserts.slice(i, i + 500));
    if (error) throw new Error(`insert: ${error.message}`);
  }
  for (const u of updates) {
    const { error } = await db.from('ir_msg_messages').update(u.patch).eq('id', u.id);
    if (error) throw new Error(`update: ${error.message}`);
  }

  // A campaign exported from here and sent through Nexus is finished once its
  // report accounts for every queued row.
  for (const id of touchedCampaigns) {
    const { count } = await db.from('ir_msg_messages').select('id', { count: 'exact', head: true }).eq('campaign_id', id).eq('status', 'queued');
    if ((count ?? 0) === 0) {
      await db.from('ir_msg_campaigns').update({ status: 'completed', completed_at: new Date().toISOString(), last_error: null })
        .eq('id', id).in('status', ['draft', 'scheduled', 'running', 'paused']);
    }
  }

  await logImport(db, kind, opts, result);
  return { ...result, committed: true };
}

async function logImport(db: AdminDb, kind: ImportKind, opts: { filename: string; actor: string },
  r: { rows: number; inserted: number; updated: number; skipped: number; notes: string[] }) {
  await db.from('ir_msg_imports').insert({
    kind, filename: opts.filename, rows: r.rows, inserted: r.inserted, updated: r.updated,
    skipped: r.skipped, notes: r.notes, imported_by: opts.actor,
  });
}
