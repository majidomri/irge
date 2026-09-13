'use client';
/**
 * Campaigns: build → review → launch or schedule → watch.
 *
 * Creating a campaign builds it straight away, so the first thing an admin
 * sees is who will get it and who was left out and why — before there is any
 * button that sends. Launching then confirms that exact queued count; if it
 * changed in the meantime the server refuses and shows the new number.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AMBER, BORDER, FAINT, GREEN, MUTED, RED, SUBTLE, TEXT } from '../theme';
import { ctaViolations, measureSms, parseNumbers, renderTemplate } from '@/lib/messaging/dlt';
import { useCtas } from './CtaSection';
import type { Overview } from './OverviewPanel';
import type { TemplateRow } from './TemplatesPanel';
import {
  api, Banner, Button, Card, CATEGORY_LABEL, ConfirmButton, Field, input, mono, Pill, Problems, Stat, Table, td, when, type Toast,
} from './ui';

interface CampaignRow {
  id: string; name: string; status: string; total: number; skipped: number;
  scheduled_at: string | null; started_at: string | null; completed_at: string | null; created_at: string;
  last_error: string | null; created_by: string; variables: Record<string, string>;
  audience: { kind: string; numbers?: string[] };
  template: { id: string; name: string; channel: string; category: string; body?: string } | null;
  counts?: Record<string, number>;
}
interface Msg {
  id: string; phone: string; email: string | null; status: string; skip_reason: string | null; error: string | null;
  body: string; segments: number | null; delivered_at: string | null; read_at: string | null; submitted_at: string | null;
}
interface Detail { campaign: CampaignRow; counts: Record<string, number>; reasons: Record<string, number>; messages: Msg[] }

const AUDIENCES = [
  { value: 'consented_members', label: 'Members who opted in', hint: 'Verified phone + marketing consent, minus opt-outs.' },
  { value: 'test_numbers',      label: 'Test numbers',         hint: 'Your own phones from Setup.' },
  { value: 'numbers',           label: 'Pasted numbers',       hint: 'Promotional templates still require each number’s consent.' },
];

export default function CampaignsPanel({ toast, overview, onChange }: { toast: Toast; overview: Overview | null; onChange: () => void }) {
  const [list, setList] = useState<CampaignRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchList = useCallback(async () => {
    const r = await api<{ campaigns: CampaignRow[] }>('/api/admin/messaging/campaigns');
    return r.ok ? r.data.campaigns : [];
  }, []);

  useEffect(() => {
    let live = true;
    void fetchList().then(c => { if (live) setList(c); });
    return () => { live = false; };
  }, [fetchList]);

  const reload = async () => { setList(await fetchList()); onChange(); };

  if (creating) {
    return <NewCampaign toast={toast} overview={overview} onCancel={() => setCreating(false)}
      onCreated={(id) => { setCreating(false); setOpenId(id); void reload(); }} />;
  }
  if (openId) {
    return <CampaignDetail id={openId} toast={toast} overview={overview} onBack={() => { setOpenId(null); void reload(); }} />;
  }

  return (
    <Card title={`Campaigns (${list.length})`} right={<><Button onClick={reload}>Refresh</Button><Button tone="primary" onClick={() => setCreating(true)}>New campaign</Button></>}>
      <Table head={['Campaign', 'Template', 'Status', 'Queued', 'Delivered', 'Failed', 'Skipped', 'When']}
        empty={list.length === 0 && <div style={{ padding: 12, fontSize: 12, color: MUTED }}>No campaigns yet.</div>}>
        {list.map(c => {
          const k = c.counts ?? {};
          return (
            <tr key={c.id} onClick={() => setOpenId(c.id)} style={{ cursor: 'pointer' }}>
              <td style={td}>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                {c.last_error && <div style={{ color: RED, fontSize: 11 }}>{c.last_error}</div>}
              </td>
              <td style={{ ...td, color: MUTED }}>{c.template ? `${c.template.channel.toUpperCase()} · ${c.template.name}` : '—'}</td>
              <td style={td}><Pill status={c.status} /></td>
              <td style={td}>{k.queued ?? 0}</td>
              <td style={{ ...td, color: GREEN }}>{(k.delivered ?? 0) + (k.read ?? 0)}</td>
              <td style={{ ...td, color: (k.failed ?? 0) ? RED : MUTED }}>{(k.failed ?? 0) + (k.unreachable ?? 0)}</td>
              <td style={{ ...td, color: FAINT }}>{k.skipped ?? 0}</td>
              <td style={{ ...td, color: MUTED, whiteSpace: 'nowrap' }}>{c.scheduled_at && c.status === 'scheduled' ? `⏰ ${when(c.scheduled_at)}` : when(c.created_at)}</td>
            </tr>
          );
        })}
      </Table>
    </Card>
  );
}

// ── New ──────────────────────────────────────────────────────────────────────

function NewCampaign({ toast, overview, onCancel, onCreated }: {
  toast: Toast; overview: Overview | null; onCancel: () => void; onCreated: (id: string) => void;
}) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [kind, setKind] = useState('consented_members');
  const [pasted, setPasted] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const ctas = useCtas();

  useEffect(() => {
    let live = true;
    void api<{ templates: TemplateRow[] }>('/api/admin/messaging/templates').then(r => {
      if (live && r.ok) setTemplates(r.data.templates.filter(t => t.status === 'approved'));
    });
    return () => { live = false; };
  }, []);

  const template = templates.find(t => t.id === templateId) ?? null;
  const parsed = useMemo(() => parseNumbers(pasted), [pasted]);
  const preview = useMemo(() => {
    if (!template) return null;
    const r = renderTemplate(template.body, template.variables, values, { name: 'Ayesha Khan' });
    const cta = template.channel === 'sms' ? ctaViolations(r.text, ctas) : [];
    return { ...r, problems: [...r.problems, ...cta], seg: measureSms(r.text) };
  }, [template, values, ctas]);

  const create = async () => {
    setBusy(true); setProblems([]);
    const r = await api<{ id: string }>('/api/admin/messaging/campaigns', 'POST', {
      name, templateId, variables: values,
      audience: kind === 'numbers' ? { kind, numbers: parsed.valid } : { kind },
    });
    setBusy(false);
    if (!r.ok) { setProblems(r.data.problems ?? [r.data.error ?? 'Could not create']); return; }
    toast('Campaign built — review before launching');
    onCreated(r.data.id);
  };

  return (
    <Card title="New campaign" right={<Button onClick={onCancel}>Cancel</Button>}>
      {overview?.settings.mode === 'test' && (
        <div style={{ marginBottom: 12 }}>
          <Banner tone="warn" title="Test mode">Anyone who is not a test number will be listed as skipped. Switch to live mode in Setup when your carrier approval is final.</Banner>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <Field name="Campaign name">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="September new profiles" style={input} />
        </Field>
        <Field name="Template">
          <select value={templateId} onChange={e => { setTemplateId(e.target.value); setValues({}); }} style={input}>
            <option value="">— choose an approved template —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.channel.toUpperCase()} · {CATEGORY_LABEL[t.category]} · {t.name}</option>)}
          </select>
        </Field>
      </div>

      {template && template.variables.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {template.variables.map(v => (
            <Field key={v.key} name={v.label} hint={<>Up to {v.max ?? 30} chars. Use <code>{'{first_name}'}</code> or <code>{'{name}'}</code> to personalise.</>}>
              <input value={values[v.key] ?? ''} placeholder={v.sample ?? ''} onChange={e => setValues({ ...values, [v.key]: e.target.value })} style={input} />
            </Field>
          ))}
        </div>
      )}

      {preview && (
        <div style={{ background: SUBTLE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: FAINT, marginBottom: 6 }}>
            Example for “Ayesha Khan”{template?.channel === 'sms' && ` · ${preview.seg.segments} SMS part${preview.seg.segments === 1 ? '' : 's'} each`}
          </div>
          <div style={{ fontSize: 13, color: TEXT, whiteSpace: 'pre-wrap' }}>{preview.text}</div>
          {preview.problems.length > 0 && <div style={{ color: RED, fontSize: 11, marginTop: 6 }}>{preview.problems.join(' · ')}</div>}
        </div>
      )}

      <Field name="Audience">
        <div style={{ display: 'grid', gap: 6 }}>
          {AUDIENCES.map(a => (
            <label key={a.value} style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'baseline' }}>
              <input type="radio" name="aud" checked={kind === a.value} onChange={() => setKind(a.value)} />
              <span>{a.label} <span style={{ color: FAINT, fontSize: 11 }}>— {a.hint}</span></span>
            </label>
          ))}
        </div>
      </Field>

      {kind === 'numbers' && (
        <Field name="Numbers" hint={`${parsed.valid.length} valid${parsed.invalid.length ? ` · ${parsed.invalid.length} not recognised` : ''}`}>
          <textarea value={pasted} onChange={e => setPasted(e.target.value)} rows={5} style={{ ...input, ...mono, resize: 'vertical' }}
            placeholder={'+9198XXXXXXXX\n98XXXXXXXX'} />
        </Field>
      )}

      <Problems list={problems} />
      <Button tone="primary" busy={busy} disabled={!name.trim() || !template || (preview?.problems.length ?? 0) > 0} onClick={create}>
        Build campaign
      </Button>
      <span style={{ fontSize: 11, color: FAINT, marginLeft: 10 }}>Nothing is sent yet — you review the audience next.</span>
    </Card>
  );
}

// ── Detail ───────────────────────────────────────────────────────────────────

function CampaignDetail({ id, toast, overview, onBack }: { id: string; toast: Toast; overview: Overview | null; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [at, setAt] = useState('');

  const fetchDetail = useCallback(async () => {
    const r = await api<Detail>(`/api/admin/messaging/campaigns/${id}${filter ? `?status=${filter}` : ''}`);
    return r.ok ? r.data : null;
  }, [id, filter]);

  // Keyed on the status, not the whole detail object: depending on `d` would
  // refetch on every refetch.
  const status = d?.campaign.status;
  useEffect(() => {
    let live = true;
    const tick = async () => { const x = await fetchDetail(); if (live && x) setD(x); };
    void tick();
    // Poll only while something is moving; a finished campaign does not change.
    const moving = status === 'running' || status === 'scheduled';
    const timer = moving ? setInterval(() => { void tick(); }, 5000) : null;
    return () => { live = false; if (timer) clearInterval(timer); };
  }, [fetchDetail, status]);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action); setProblems([]);
    const r = await api<{ warning?: string; batch?: { processed: number; remaining: number; waitUntil?: string; stopped?: string } }>(
      `/api/admin/messaging/campaigns/${id}`, 'PATCH', { action, ...extra });
    setBusy(null);
    if (!r.ok) { setProblems(r.data.problems ?? [r.data.error ?? 'Failed']); }
    else if (r.data.warning) toast(r.data.warning);
    else if (r.data.batch) {
      const b = r.data.batch;
      toast(b.stopped ? b.stopped : b.waitUntil ? `Outside promotional hours — resumes ${when(b.waitUntil)}` : `Sent ${b.processed}, ${b.remaining} left`);
    } else toast('Done');
    const x = await fetchDetail(); if (x) setD(x);
  };

  const remove = async () => {
    const r = await api(`/api/admin/messaging/campaigns/${id}`, 'DELETE');
    if (!r.ok) { toast(r.data.error ?? 'Delete failed'); return; }
    toast('Draft deleted'); onBack();
  };

  if (!d) return <Card><div style={{ fontSize: 12, color: MUTED }}>Loading…</div></Card>;

  const c = d.campaign;
  const k = d.counts;
  const queued = k.queued ?? 0;
  const delivered = (k.delivered ?? 0) + (k.read ?? 0);
  const inFlight = (k.submitted ?? 0) + (k.sent ?? 0);
  const failed = (k.failed ?? 0) + (k.unreachable ?? 0);
  const reachesPhones = overview?.provider.reachesPhones ?? false;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card title={<>{c.name} <Pill status={c.status} /></>} right={<Button onClick={onBack}>← All campaigns</Button>}>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 12, lineHeight: 1.7 }}>
          {c.template ? <>{c.template.channel.toUpperCase()} · {CATEGORY_LABEL[c.template.category]} · <strong style={{ color: TEXT }}>{c.template.name}</strong></> : 'Template deleted'}
          {' · '}audience: {AUDIENCES.find(a => a.value === c.audience.kind)?.label ?? c.audience.kind}
          {' · '}by {c.created_by}
          {c.scheduled_at && <> · scheduled {when(c.scheduled_at)}</>}
          {c.started_at && <> · started {when(c.started_at)}</>}
          {c.completed_at && <> · finished {when(c.completed_at)}</>}
        </div>

        {c.last_error && <div style={{ marginBottom: 12 }}><Banner tone="warn" title="Stopped">{c.last_error}</Banner></div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <Stat k="Queued" v={queued} color={queued ? AMBER : MUTED} />
          <Stat k="In flight" v={inFlight} />
          <Stat k="Delivered" v={delivered} color={GREEN} />
          <Stat k="Failed" v={failed} color={failed ? RED : MUTED} />
          <Stat k="Skipped" v={k.skipped ?? 0} color={FAINT} />
        </div>

        {Object.keys(d.reasons).length > 0 && (
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
            Skipped because: {Object.entries(d.reasons).map(([r, n]) => `${r} (${n})`).join(' · ')}
          </div>
        )}

        <Problems list={problems} />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {(c.status === 'draft' || c.status === 'scheduled') && (
            <ConfirmButton tone="primary" busy={busy === 'launch'} disabled={queued === 0}
              confirmText={reachesPhones ? `Confirm: send ${queued} now` : `Confirm: simulate ${queued}`}
              onConfirm={() => act('launch', { expectQueued: queued })}>
              Launch now · {queued}
            </ConfirmButton>
          )}
          {c.status === 'draft' && (
            <>
              <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} aria-label="Schedule time" style={{ ...input, width: 'auto' }} />
              <Button busy={busy === 'schedule'} disabled={!at || queued === 0}
                onClick={() => act('schedule', { at: new Date(at).toISOString(), expectQueued: queued })}>Schedule</Button>
              <Button busy={busy === 'rebuild'} onClick={() => act('rebuild')} title="Re-read the audience and opt-outs">Rebuild audience</Button>
              <ConfirmButton onConfirm={remove} confirmText="Delete draft?">Delete</ConfirmButton>
            </>
          )}
          {c.status === 'running' && (
            <>
              <Button busy={busy === 'pause'} onClick={() => act('pause')}>Pause</Button>
              <Button busy={busy === 'run_batch'} onClick={() => act('run_batch')} title="Send the next 50 now — use if the background runner is not active">Send next batch</Button>
            </>
          )}
          {c.status === 'scheduled' && <Button busy={busy === 'pause'} onClick={() => act('pause')}>Unschedule (pause)</Button>}
          {(c.status === 'paused' || c.status === 'failed') && queued > 0 && (
            <Button tone="primary" busy={busy === 'resume'} onClick={() => act('resume')}>Resume</Button>
          )}
          {!['completed', 'cancelled', 'draft'].includes(c.status) && (
            <ConfirmButton busy={busy === 'cancel'} onConfirm={() => act('cancel')} confirmText="Cancel for good?">Cancel campaign</ConfirmButton>
          )}
        </div>
      </Card>

      <Card title="Messages" right={
        <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter by status" style={{ ...input, width: 'auto' }}>
          <option value="">All statuses</option>
          {['queued', 'submitted', 'sent', 'delivered', 'read', 'failed', 'unreachable', 'skipped'].map(s => <option key={s} value={s}>{s}{k[s] ? ` (${k[s]})` : ''}</option>)}
        </select>
      }>
        <Table head={['Number', 'Member', 'Status', 'Delivered', 'Detail']}
          empty={d.messages.length === 0 && <div style={{ padding: 12, fontSize: 12, color: MUTED }}>No messages{filter ? ` with status ${filter}` : ''}.</div>}>
          {d.messages.map(m => (
            <tr key={m.id}>
              <td style={{ ...td, ...mono }}>{m.phone}</td>
              <td style={{ ...td, color: MUTED }}>{m.email ?? '—'}</td>
              <td style={td}><Pill status={m.status} /></td>
              <td style={{ ...td, color: MUTED, whiteSpace: 'nowrap' }}>{when(m.read_at ?? m.delivered_at)}</td>
              <td style={{ ...td, fontSize: 11, color: m.error ? RED : FAINT, maxWidth: 360 }}>{m.error ?? m.skip_reason ?? ''}</td>
            </tr>
          ))}
        </Table>
        {d.messages.length === 100 && <div style={{ fontSize: 11, color: FAINT, marginTop: 8 }}>Showing the first 100 — use the filter or the Log tab for the rest.</div>}
      </Card>
    </div>
  );
}
