'use client';
/**
 * The CTA whitelist, mirrored from the DLT portal.
 *
 * Any link or call-back number in an SMS must be on it. The preview in
 * Templates, Test send and Campaigns checks against this list as you type.
 */
import { useCallback, useEffect, useState } from 'react';
import { FAINT, MUTED } from '../theme';
import { api, Button, Card, ConfirmButton, Field, input, mono, Pill, Problems, Table, td, when, type Toast } from './ui';

export interface CtaRow {
  id: string; dlt_cta_id: string | null; name: string; cta_type: 'url' | 'phone' | 'apk' | 'other';
  sub_type: 'static' | 'dynamic'; value: string; status: 'active' | 'inactive'; notes: string | null;
  matches?: string; created_at: string;
}

/** Active CTAs, for previews. */
export function useCtas(): CtaRow[] {
  const [ctas, setCtas] = useState<CtaRow[]>([]);
  useEffect(() => {
    let live = true;
    void api<{ ctas: CtaRow[] }>('/api/admin/messaging/ctas').then(r => {
      if (live && r.ok) setCtas(r.data.ctas.filter(c => c.status === 'active'));
    });
    return () => { live = false; };
  }, []);
  return ctas;
}

const BLANK = { dlt_cta_id: '', name: '', cta_type: 'url', sub_type: 'static', value: '' };

export default function CtaSection({ toast, onChange }: { toast: Toast; onChange: () => void }) {
  const [rows, setRows] = useState<CtaRow[]>([]);
  const [form, setForm] = useState(BLANK);
  const [problems, setProblems] = useState<string[]>([]);

  const fetchRows = useCallback(async () => {
    const r = await api<{ ctas: CtaRow[] }>('/api/admin/messaging/ctas');
    return r.ok ? r.data.ctas : [];
  }, []);

  useEffect(() => {
    let live = true;
    void fetchRows().then(x => { if (live) setRows(x); });
    return () => { live = false; };
  }, [fetchRows]);

  const reload = async () => { setRows(await fetchRows()); onChange(); };

  const add = async () => {
    setProblems([]);
    const r = await api('/api/admin/messaging/ctas', 'POST', form);
    if (!r.ok) { setProblems(r.data.problems ?? [r.data.error ?? 'Could not add']); return; }
    setForm(BLANK); toast('CTA added'); void reload();
  };

  const setStatus = async (id: string, status: string) => {
    const r = await api('/api/admin/messaging/ctas', 'PATCH', { id, status });
    if (!r.ok) { toast(r.data.error ?? 'Update failed'); return; }
    void reload();
  };

  const remove = async (id: string) => {
    const r = await api('/api/admin/messaging/ctas', 'DELETE', { id });
    if (!r.ok) { toast(r.data.error ?? 'Delete failed'); return; }
    void reload();
  };

  return (
    <Card title="Whitelisted CTAs" right={<span style={{ fontSize: 11, color: FAINT }}>Links & call-back numbers approved on DLT</span>}>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10, lineHeight: 1.6 }}>
        An SMS containing a link or number that is not whitelisted is blocked by the operator. A leading <code>www.</code> is
        ignored (SMS saying <code>instarishta.me</code> were delivered against the www entry). A <em>static</em> URL matches only
        itself; a <em>dynamic</em> URL also matches paths under it.
      </div>

      <Table head={['Name', 'Type', 'Value', 'DLT CTA ID', 'Status', '']}
        empty={rows.length === 0 && <div style={{ padding: 12, fontSize: 12, color: MUTED }}>No CTAs yet.</div>}>
        {rows.map(c => (
          <tr key={c.id}>
            <td style={td}>{c.name}<div style={{ color: FAINT, fontSize: 11 }}>added {when(c.created_at)}</div></td>
            <td style={{ ...td, color: MUTED, whiteSpace: 'nowrap' }}>{c.cta_type.toUpperCase()} · {c.sub_type}</td>
            <td style={{ ...td, ...mono, wordBreak: 'break-all' }}>{c.value}</td>
            <td style={{ ...td, ...mono, color: MUTED }}>{c.dlt_cta_id ?? '—'}</td>
            <td style={td}>
              <button type="button" onClick={() => setStatus(c.id, c.status === 'active' ? 'inactive' : 'active')}
                title="Toggle" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                <Pill status={c.status === 'active' ? 'approved' : 'inactive'} />
              </button>
            </td>
            <td style={{ ...td, textAlign: 'right' }}>
              <ConfirmButton onConfirm={() => remove(c.id)} confirmText="Delete?">Delete</ConfirmButton>
            </td>
          </tr>
        ))}
      </Table>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 14 }}>
        <Field name="Name">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Instarishta" style={input} />
        </Field>
        <Field name="Type">
          <select value={`${form.cta_type}:${form.sub_type}`} onChange={e => { const [t, s] = e.target.value.split(':'); setForm({ ...form, cta_type: t, sub_type: s }); }} style={input}>
            <option value="url:static">URL · static</option>
            <option value="url:dynamic">URL · dynamic</option>
            <option value="phone:static">Call-back number</option>
            <option value="apk:static">APK link</option>
          </select>
        </Field>
        <Field name={form.cta_type === 'phone' ? 'Number' : 'URL, exactly as whitelisted'}>
          <input value={form.value} onChange={e => setForm({ ...form, value: e.target.value })}
            placeholder={form.cta_type === 'phone' ? '+9198XXXXXXXX' : 'https://www.instarishta.me/'} style={{ ...input, ...mono }} />
        </Field>
        <Field name="DLT CTA ID">
          <input value={form.dlt_cta_id} onChange={e => setForm({ ...form, dlt_cta_id: e.target.value.replace(/\D/g, '') })}
            maxLength={19} inputMode="numeric" style={{ ...input, ...mono }} />
        </Field>
      </div>
      <Problems list={problems} />
      <Button tone="primary" onClick={add} disabled={!form.name.trim() || !form.value.trim()}>Add CTA</Button>
    </Card>
  );
}
