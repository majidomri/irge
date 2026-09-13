'use client';
/**
 * The send log across every campaign and test, with each row's receipts.
 */
import { useCallback, useEffect, useState } from 'react';
import { BORDER, FAINT, MUTED, RED, SUBTLE, TEXT } from '../theme';
import { api, Button, Card, input, mono, Pill, Table, td, when, type Toast } from './ui';

interface Msg {
  id: string; campaign_id: string | null; channel: string; category: string; sender_code: string | null;
  phone: string; email: string | null; body: string; status: string; skip_reason: string | null;
  error: string | null; error_code: string | null; mode: string; provider: string | null;
  provider_message_id: string | null; segments: number | null; sent_by: string;
  created_at: string; submitted_at: string | null; delivered_at: string | null; read_at: string | null;
  campaign: { name: string } | null;
  source: string; external_campaign: string | null; sent_at: string | null; cost: number | null; gateway: string | null;
}
interface Evt { message_id: string; event_type: string; error: string | null; text: string | null; created_at: string }

export default function LogPanel({ toast }: { toast: Toast }) {
  const [f, setF] = useState({ status: '', channel: '', mode: '', phone: '', campaign: '' });
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ messages: Msg[]; events: Evt[]; total: number; pageSize: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const fetchLog = useCallback(async () => {
    const q = new URLSearchParams({ page: String(page) });
    Object.entries(f).forEach(([k, v]) => { if (v) q.set(k, v); });
    const r = await api<{ messages: Msg[]; events: Evt[]; total: number; pageSize: number }>(`/api/admin/messaging/messages?${q}`);
    if (!r.ok) { toast(r.data.error ?? 'Could not load log'); return null; }
    return r.data;
  }, [f, page, toast]);

  useEffect(() => {
    let live = true;
    void fetchLog().then(x => { if (live && x) setData(x); });
    return () => { live = false; };
  }, [fetchLog]);

  const set = (k: keyof typeof f, v: string) => { setPage(0); setF({ ...f, [k]: v }); };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Card title={`Send log${data ? ` (${data.total})` : ''}`} right={<Button onClick={async () => { const x = await fetchLog(); if (x) setData(x); }}>Refresh</Button>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select value={f.status} onChange={e => set('status', e.target.value)} aria-label="Status" style={{ ...input, width: 'auto' }}>
          <option value="">All statuses</option>
          {['queued', 'submitted', 'sent', 'delivered', 'read', 'failed', 'unreachable', 'skipped'].map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={f.channel} onChange={e => set('channel', e.target.value)} aria-label="Channel" style={{ ...input, width: 'auto' }}>
          <option value="">SMS + RCS</option><option value="sms">SMS</option><option value="rcs">RCS</option>
        </select>
        <select value={f.mode} onChange={e => set('mode', e.target.value)} aria-label="Mode" style={{ ...input, width: 'auto' }}>
          <option value="">Test + live</option><option value="test">Test</option><option value="live">Live</option>
        </select>
        <select value={f.campaign} onChange={e => set('campaign', e.target.value)} aria-label="Source" style={{ ...input, width: 'auto' }}>
          <option value="">All sources</option><option value="none">Test sends & Nexus imports</option>
        </select>
        <input value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="Search number" aria-label="Search number" style={{ ...input, width: 160 }} />
      </div>

      <Table head={['When', 'To', 'Ch.', 'Source', 'Status', 'Detail']}
        empty={data?.messages.length === 0 && <div style={{ padding: 12, fontSize: 12, color: MUTED }}>Nothing matches.</div>}>
        {(data?.messages ?? []).map(m => (
          <FragmentRow key={m.id} m={m} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)}
            events={(data?.events ?? []).filter(e => e.message_id === m.id)} />
        ))}
      </Table>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 12, color: MUTED }}>
        <Button disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Newer</Button>
        <span>Page {page + 1} of {pages}</span>
        <Button disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Older →</Button>
      </div>
    </Card>
  );
}

function FragmentRow({ m, open, onToggle, events }: { m: Msg; open: boolean; onToggle: () => void; events: Evt[] }) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td style={{ ...td, color: MUTED, whiteSpace: 'nowrap' }}>{when(m.sent_at ?? m.created_at)}</td>
        <td style={{ ...td, ...mono }}>{m.phone}</td>
        <td style={{ ...td, textTransform: 'uppercase', color: MUTED }}>{m.channel}</td>
        <td style={{ ...td, color: MUTED }}>
          {m.campaign?.name ?? (m.source === 'import' ? (m.external_campaign ? `Nexus · ${m.external_campaign}` : 'Nexus import') : 'Test send')}
          <span style={{ color: m.mode === 'live' ? TEXT : FAINT, fontSize: 11 }}> · {m.mode}</span>
        </td>
        <td style={td}><Pill status={m.status} /></td>
        <td style={{ ...td, fontSize: 11, color: m.error ? RED : FAINT, maxWidth: 300 }}>{m.error ?? m.skip_reason ?? ''}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} style={{ ...td, background: SUBTLE }}>
            <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
              <div style={{ whiteSpace: 'pre-wrap', color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10 }}>{m.body}</div>
              <div style={{ color: MUTED, lineHeight: 1.7 }}>
                {m.sender_code && <>From <code>{m.sender_code}</code> · </>}
                {m.segments && <>{m.segments} part{m.segments === 1 ? '' : 's'} · </>}
                {m.cost !== null && <>cost ₹{m.cost} · </>}
                {m.gateway && <>gateway {m.gateway} · </>}
                provider <code>{m.provider ?? '—'}</code>
                {m.provider_message_id && <> · id <code>{m.provider_message_id}</code></>}
                {m.error_code && <> · code <code>{m.error_code}</code></>}
                {' · '}by {m.sent_by}
                <br />
                submitted {when(m.submitted_at)} · delivered {when(m.delivered_at)} · read {when(m.read_at)}
              </div>
              {events.length > 0 && (
                <div style={{ color: MUTED }}>
                  Receipts: {events.map(e => `${e.event_type} ${when(e.created_at)}${e.error ? ` (${e.error})` : ''}${e.text ? ` “${e.text}”` : ''}`).join(' → ')}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
