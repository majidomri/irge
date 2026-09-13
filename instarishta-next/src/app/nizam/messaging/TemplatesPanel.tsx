'use client';
/**
 * The template registry.
 *
 * Paste the approved text exactly as the DLT portal shows it, {#var#} and all.
 * The variable rows follow the slots automatically, and the preview underneath
 * is rendered by the same function the send path uses (lib/messaging/dlt).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AMBER, BORDER, FAINT, GREEN, MUTED, RED, SUBTLE, TEXT } from '../theme';
import { countSlots, DEFAULT_VAR_MAX, measureSms, renderTemplate, type TemplateVariable } from '@/lib/messaging/dlt';
import { api, Button, Card, CATEGORY_LABEL, ConfirmButton, Field, input, mono, Pill, Problems, Table, td, type Toast } from './ui';

export interface TemplateRow {
  id: string; name: string; channel: 'sms' | 'rcs'; category: string; sender_id: string | null;
  dlt_template_id: string | null; provider_template_id: string | null; body: string;
  variables: TemplateVariable[]; rcs_payload: unknown; status: string; notes: string | null;
  sender?: { id: string; sender_code: string; channel: string; category: string; status: string } | null;
}
interface Sender { id: string; channel: 'sms' | 'rcs'; sender_code: string; category: string; status: string }

const BLANK = {
  id: '', name: '', channel: 'sms' as 'sms' | 'rcs', category: 'service_implicit', sender_id: '',
  dlt_template_id: '', provider_template_id: '', body: '', variables: [] as TemplateVariable[],
  rcs_json: '', status: 'approved', notes: '',
};

export default function TemplatesPanel({ toast, onChange }: { toast: Toast; onChange: () => void }) {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [edit, setEdit] = useState<typeof BLANK | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [t, s] = await Promise.all([
      api<{ templates: TemplateRow[] }>('/api/admin/messaging/templates'),
      api<{ senders: Sender[] }>('/api/admin/messaging/senders'),
    ]);
    return { t: t.ok ? t.data.templates : [], s: s.ok ? s.data.senders : [] };
  }, []);

  useEffect(() => {
    let live = true;
    void load().then(({ t, s }) => { if (live) { setRows(t); setSenders(s); } });
    return () => { live = false; };
  }, [load]);

  const reload = async () => { const { t, s } = await load(); setRows(t); setSenders(s); };

  /** Keep one variable row per {#var#} slot, preserving what was typed. */
  const setBody = (body: string) => {
    if (!edit) return;
    const n = countSlots(body);
    const vars = Array.from({ length: n }, (_, i) => edit.variables[i] ?? { key: `var${i + 1}`, label: `Variable ${i + 1}`, sample: '', max: DEFAULT_VAR_MAX });
    setEdit({ ...edit, body, variables: vars });
  };

  const setVar = (i: number, patch: Partial<TemplateVariable>) => {
    if (!edit) return;
    setEdit({ ...edit, variables: edit.variables.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  };

  const open = (t?: TemplateRow) => {
    setProblems([]);
    setEdit(t ? {
      id: t.id, name: t.name, channel: t.channel, category: t.category, sender_id: t.sender_id ?? '',
      dlt_template_id: t.dlt_template_id ?? '', provider_template_id: t.provider_template_id ?? '',
      body: t.body, variables: t.variables, rcs_json: t.rcs_payload ? JSON.stringify(t.rcs_payload, null, 2) : '',
      status: t.status, notes: t.notes ?? '',
    } : { ...BLANK });
  };

  const preview = useMemo(() => {
    if (!edit) return null;
    const r = renderTemplate(edit.body, edit.variables, {}, { name: 'Ayesha Khan' }, { useSamples: true });
    return { ...r, seg: measureSms(r.text) };
  }, [edit]);

  const save = async () => {
    if (!edit) return;
    let rcs_payload: unknown = null;
    if (edit.channel === 'rcs' && edit.rcs_json.trim()) {
      try { rcs_payload = JSON.parse(edit.rcs_json); }
      catch { setProblems(['Rich content is not valid JSON']); return; }
    }
    setBusy(true); setProblems([]);
    const payload = {
      ...(edit.id ? { id: edit.id } : {}),
      name: edit.name, channel: edit.channel, category: edit.category, sender_id: edit.sender_id || null,
      dlt_template_id: edit.dlt_template_id, provider_template_id: edit.provider_template_id,
      body: edit.body, variables: edit.variables, rcs_payload, status: edit.status, notes: edit.notes,
    };
    const r = await api('/api/admin/messaging/templates', edit.id ? 'PATCH' : 'POST', payload);
    setBusy(false);
    if (!r.ok) { setProblems(r.data.problems ?? [r.data.error ?? 'Save failed']); return; }
    toast(edit.id ? 'Template updated' : 'Template added');
    setEdit(null); void reload(); onChange();
  };

  const remove = async (id: string) => {
    const r = await api('/api/admin/messaging/templates', 'DELETE', { id });
    if (!r.ok) { toast(r.data.error ?? 'Delete failed'); return; }
    toast('Deleted'); void reload(); onChange();
  };

  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 } as const;
  const channelSenders = senders.filter(s => edit && s.channel === edit.channel);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {!edit && (
        <Card title={`Templates (${rows.length})`} right={<Button tone="primary" onClick={() => open()}>Add template</Button>}>
          <Table head={['Name', 'Channel', 'Category', 'Sender', 'DLT template ID', 'Status', '']}
            empty={rows.length === 0 && <div style={{ padding: 12, fontSize: 12, color: MUTED }}>No templates yet. Add each template exactly as approved on the DLT portal.</div>}>
            {rows.map(t => (
              <tr key={t.id}>
                <td style={td}>
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div style={{ color: FAINT, fontSize: 11, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.body}</div>
                </td>
                <td style={{ ...td, textTransform: 'uppercase', color: MUTED }}>{t.channel}</td>
                <td style={td}>{CATEGORY_LABEL[t.category]}</td>
                <td style={{ ...td, ...mono }}>{t.sender?.sender_code ?? <span style={{ color: AMBER }}>none</span>}</td>
                <td style={{ ...td, ...mono, color: MUTED }}>{t.dlt_template_id ?? '—'}</td>
                <td style={td}><Pill status={t.status} /></td>
                <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <Button onClick={() => open(t)}>Edit</Button>{' '}
                  <ConfirmButton onConfirm={() => remove(t.id)} confirmText="Delete?">Delete</ConfirmButton>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {edit && preview && (
        <Card title={edit.id ? 'Edit template' : 'New template'} right={<Button onClick={() => setEdit(null)}>Cancel</Button>}>
          <div style={grid}>
            <Field name="Name" hint="For you — not sent.">
              <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="New match alert" style={input} />
            </Field>
            <Field name="Channel">
              <select value={edit.channel} onChange={e => setEdit({ ...edit, channel: e.target.value as 'sms' | 'rcs', sender_id: '' })} style={input}>
                <option value="sms">SMS</option><option value="rcs">RCS</option>
              </select>
            </Field>
            <Field name="DLT category">
              <select value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value, sender_id: '' })} style={input}>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field name={edit.channel === 'sms' ? 'Header' : 'RCS bot'}
              hint={channelSenders.length === 0 ? <span style={{ color: AMBER }}>Add a sender in Setup first.</span> : undefined}>
              <select value={edit.sender_id} onChange={e => setEdit({ ...edit, sender_id: e.target.value })} style={input}>
                <option value="">— choose —</option>
                {channelSenders.map(s => (
                  <option key={s.id} value={s.id}>{s.sender_code} · {CATEGORY_LABEL[s.category]}{s.status !== 'approved' ? ` (${s.status})` : ''}</option>
                ))}
              </select>
            </Field>
            <Field name="DLT template ID" hint={edit.channel === 'sms' ? 'Required for SMS. 19 digits.' : 'Optional for RCS.'}>
              <input value={edit.dlt_template_id} onChange={e => setEdit({ ...edit, dlt_template_id: e.target.value.replace(/\D/g, '') })}
                maxLength={19} inputMode="numeric" style={{ ...input, ...mono }} />
            </Field>
            <Field name="Ojiva template ID" hint="Only if Nexus gave the template its own ID.">
              <input value={edit.provider_template_id} onChange={e => setEdit({ ...edit, provider_template_id: e.target.value })} style={{ ...input, ...mono }} />
            </Field>
            <Field name="Status">
              <select value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })} style={input}>
                {['approved', 'pending', 'draft', 'paused', 'rejected'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <Field name="Approved text" hint={<>Paste it exactly as approved — spacing and punctuation included. Use <code>{'{#var#}'}</code> for each variable.</>}>
            <textarea value={edit.body} onChange={e => setBody(e.target.value)} rows={4}
              placeholder="Dear {#var#}, a new rishta matching your preferences is waiting on InstaRishta: {#var#} -PrimeConnect"
              style={{ ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
          </Field>

          {edit.variables.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: FAINT }}>Variables, in order</span>
              <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                {edit.variables.map((v, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px repeat(auto-fit, minmax(120px, 1fr))', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: FAINT, fontSize: 12 }}>#{i + 1}</span>
                    <input value={v.label} onChange={e => setVar(i, { label: e.target.value })} placeholder="Label" aria-label={`Variable ${i + 1} label`} style={input} />
                    <input value={v.key} onChange={e => setVar(i, { key: e.target.value })} placeholder="key" aria-label={`Variable ${i + 1} key`} style={{ ...input, ...mono }} />
                    <input value={v.sample ?? ''} onChange={e => setVar(i, { sample: e.target.value })} placeholder="Sample value" aria-label={`Variable ${i + 1} sample`} style={input} />
                    <input type="number" value={v.max ?? DEFAULT_VAR_MAX} onChange={e => setVar(i, { max: Number(e.target.value) })} aria-label={`Variable ${i + 1} max length`} title="Max length" style={input} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {edit.channel === 'rcs' && (
            <Field name="Rich content (optional, JSON)" hint={<>Card or carousel, e.g. <code>{'{"kind":"card","card":{"title":"…","description":"…","imageUrl":"https://…"}}'}</code>. Leave empty for plain text.</>}>
              <textarea value={edit.rcs_json} onChange={e => setEdit({ ...edit, rcs_json: e.target.value })} rows={4} style={{ ...input, ...mono, resize: 'vertical' }} />
            </Field>
          )}

          <Field name="Notes">
            <input value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })} style={input} />
          </Field>

          <div style={{ background: SUBTLE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 10, fontSize: 11, color: FAINT, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Preview with samples</span>
              {edit.channel === 'sms' && (
                <span style={{ color: preview.seg.segments > 1 ? AMBER : GREEN }}>
                  {preview.seg.encoding} · {preview.seg.units} chars · {preview.seg.segments} SMS part{preview.seg.segments === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: TEXT, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{preview.text || <span style={{ color: FAINT }}>—</span>}</div>
            {preview.problems.length > 0 && (
              <div style={{ color: RED, fontSize: 11, marginTop: 6 }}>{preview.problems.join(' · ')}</div>
            )}
          </div>

          <Problems list={problems} />
          <Button tone="primary" busy={busy} onClick={save}>{edit.id ? 'Save changes' : 'Add template'}</Button>
        </Card>
      )}
    </div>
  );
}
