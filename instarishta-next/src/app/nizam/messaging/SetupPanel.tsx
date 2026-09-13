'use client';
/**
 * Setup: the DLT entity, sending mode and limits, and the registered senders.
 */
import { useCallback, useEffect, useState } from 'react';
import { AMBER, FAINT, MUTED } from '../theme';
import CtaSection from './CtaSection';
import { api, Banner, Button, Card, CATEGORY_LABEL, ConfirmButton, Field, input, mono, Problems, Table, td, type Toast } from './ui';

interface Settings {
  dlt_entity_id: string | null; mode: 'test' | 'live'; test_numbers: string[];
  sms_enabled: boolean; rcs_enabled: boolean; promo_window_start: number; promo_window_end: number;
  daily_cap: number; updated_by: string | null; updated_at: string;
}
interface Sender {
  id: string; channel: 'sms' | 'rcs'; sender_code: string; dlt_header_id: string | null;
  category: string; status: string; label: string | null; notes: string | null;
}

const ENV_VARS: [string, string][] = [
  ['MESSAGING_PROVIDER', 'ojiva — anything else uses the sandbox'],
  ['OJIVA_API_BASE', 'API base URL from the Nexus docs'],
  ['OJIVA_API_KEY', 'API key generated in Nexus'],
  ['OJIVA_AUTH_STYLE', 'bearer · header:X-Api-Key · query:apikey'],
  ['OJIVA_SMS_PATH', 'SMS send endpoint path'],
  ['OJIVA_RCS_PATH', 'RCS send endpoint path'],
  ['OJIVA_WEBHOOK_SECRET', 'Random string; also put in the callback URL'],
  ['OJIVA_CONTRACT_VERIFIED', '1 after a test message is confirmed on a handset'],
];

export default function SetupPanel({ toast, onChange }: { toast: Toast; onChange: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [draft, setDraft] = useState({ entity: '', tests: '', start: 9, end: 21, cap: 1000, sms: true, rcs: true });
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const [senders, setSenders] = useState<Sender[]>([]);
  const [form, setForm] = useState({ channel: 'sms' as 'sms' | 'rcs', sender_code: '', category: 'service_implicit', dlt_header_id: '', label: '' });
  const [senderProblems, setSenderProblems] = useState<string[]>([]);

  const apply = (st: Settings) => {
    setS(st);
    setDraft({
      entity: st.dlt_entity_id ?? '', tests: st.test_numbers.join('\n'),
      start: st.promo_window_start, end: st.promo_window_end, cap: st.daily_cap, sms: st.sms_enabled, rcs: st.rcs_enabled,
    });
  };

  const loadSenders = useCallback(async () => {
    const r = await api<{ senders: Sender[] }>('/api/admin/messaging/senders');
    if (r.ok) setSenders(r.data.senders);
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [a, b] = await Promise.all([
        api<{ settings: Settings }>('/api/admin/messaging/settings'),
        api<{ senders: Sender[] }>('/api/admin/messaging/senders'),
      ]);
      if (!live) return;
      if (a.ok) apply(a.data.settings);
      if (b.ok) setSenders(b.data.senders);
    })();
    return () => { live = false; };
  }, []);

  const save = async (patch: Record<string, unknown>, what: string) => {
    setBusy(what); setProblems([]);
    const r = await api<{ settings: Settings }>('/api/admin/messaging/settings', 'PUT', patch);
    setBusy(null);
    if (!r.ok) { setProblems(r.data.problems ?? [r.data.error ?? 'Save failed']); return false; }
    apply(r.data.settings); toast('Saved'); onChange();
    return true;
  };

  const saveGeneral = () => save({
    dlt_entity_id: draft.entity, test_numbers: draft.tests, promo_window_start: draft.start,
    promo_window_end: draft.end, daily_cap: draft.cap, sms_enabled: draft.sms, rcs_enabled: draft.rcs,
  }, 'general');

  const toggleMode = async () => {
    if (!s) return;
    await save({ mode: s.mode === 'live' ? 'test' : 'live' }, 'mode');
  };

  const addSender = async () => {
    setSenderProblems([]);
    const r = await api('/api/admin/messaging/senders', 'POST', { ...form, status: 'approved' });
    if (!r.ok) { setSenderProblems(r.data.problems ?? [r.data.error ?? 'Could not add']); return; }
    setForm(f => ({ ...f, sender_code: '', dlt_header_id: '', label: '' }));
    toast('Sender added'); void loadSenders(); onChange();
  };

  const setSenderStatus = async (id: string, status: string) => {
    const r = await api('/api/admin/messaging/senders', 'PATCH', { id, status });
    if (!r.ok) { toast(r.data.error ?? 'Update failed'); return; }
    void loadSenders(); onChange();
  };

  const removeSender = async (id: string) => {
    const r = await api('/api/admin/messaging/senders', 'DELETE', { id });
    if (!r.ok) { toast(r.data.error ?? 'Delete failed'); return; }
    void loadSenders(); onChange();
  };

  if (!s) return <Card><div style={{ fontSize: 12, color: MUTED }}>Loading…</div></Card>;

  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 } as const;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card title="Sending mode">
        {s.mode === 'test'
          ? <Banner tone="warn" title="Test mode">Every send — test or campaign — goes only to the test numbers below. Use this while your carrier approval is for testing.</Banner>
          : <Banner tone="ok" title="Live mode">Campaigns send to members who opted in, within the promotional window and daily cap.</Banner>}
        <div style={{ marginTop: 10 }}>
          {s.mode === 'live'
            ? <Button busy={busy === 'mode'} onClick={toggleMode}>Switch back to test mode</Button>
            : <ConfirmButton busy={busy === 'mode'} onConfirm={toggleMode} confirmText="Confirm: send to real members">Switch to live mode</ConfirmButton>}
        </div>
      </Card>

      <Card title="DLT entity & limits">
        <div style={grid}>
          <Field name="DLT principal entity ID" hint="19 digits, from the SmartPing portal.">
            <input value={draft.entity} onChange={e => setDraft({ ...draft, entity: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric" maxLength={19} placeholder="1201234567890123456" style={{ ...input, ...mono }} />
          </Field>
          <Field name="Daily live cap" hint="Live messages per IST day across all campaigns.">
            <input type="number" min={0} value={draft.cap} onChange={e => setDraft({ ...draft, cap: Number(e.target.value) })} style={input} />
          </Field>
          <Field name="Promotional window (IST)" hint="TRAI allows 09:00–21:00. You can narrow it, not widen it.">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="number" min={9} max={20} value={draft.start} onChange={e => setDraft({ ...draft, start: Number(e.target.value) })} style={input} aria-label="Start hour" />
              <span style={{ color: FAINT }}>to</span>
              <input type="number" min={10} max={21} value={draft.end} onChange={e => setDraft({ ...draft, end: Number(e.target.value) })} style={input} aria-label="End hour" />
            </div>
          </Field>
          <Field name="Channels">
            <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 6 }}>
              <input type="checkbox" checked={draft.sms} onChange={e => setDraft({ ...draft, sms: e.target.checked })} /> SMS enabled
            </label>
            <label style={{ display: 'flex', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={draft.rcs} onChange={e => setDraft({ ...draft, rcs: e.target.checked })} /> RCS enabled
            </label>
          </Field>
        </div>
        <Field name="Test numbers" hint="Your own phones, one per line. Up to 20. Test sends can only go to these.">
          <textarea value={draft.tests} onChange={e => setDraft({ ...draft, tests: e.target.value })} rows={3}
            placeholder={'+9198XXXXXXXX\n98XXXXXXXX'} style={{ ...input, ...mono, resize: 'vertical' }} />
        </Field>
        <Problems list={problems} />
        <Button tone="primary" busy={busy === 'general'} onClick={saveGeneral}>Save settings</Button>
        {s.updated_by && <span style={{ fontSize: 11, color: FAINT, marginLeft: 10 }}>Last saved by {s.updated_by}</span>}
      </Card>

      <Card title="Senders" right={<span style={{ fontSize: 11, color: FAINT }}>SMS headers from DLT · RCS bot IDs from Ojiva</span>}>
        <Table head={['Channel', 'Code', 'Category', 'DLT header ID', 'Status', '']}
          empty={senders.length === 0 && <div style={{ padding: 12, fontSize: 12, color: MUTED }}>No senders yet — add your approved header below.</div>}>
          {senders.map(x => (
            <tr key={x.id}>
              <td style={{ ...td, textTransform: 'uppercase', color: MUTED }}>{x.channel}</td>
              <td style={{ ...td, ...mono, fontWeight: 600 }}>{x.sender_code}{x.label && <div style={{ color: FAINT, fontSize: 11, fontFamily: 'inherit' }}>{x.label}</div>}</td>
              <td style={td}>{CATEGORY_LABEL[x.category]}</td>
              <td style={{ ...td, ...mono, color: MUTED }}>{x.dlt_header_id ?? '—'}</td>
              <td style={td}>
                <select value={x.status} onChange={e => setSenderStatus(x.id, e.target.value)} style={{ ...input, width: 'auto', padding: '3px 6px' }}>
                  {['approved', 'pending', 'rejected', 'inactive'].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <ConfirmButton onConfirm={() => removeSender(x.id)} confirmText="Delete?">Delete</ConfirmButton>
              </td>
            </tr>
          ))}
        </Table>

        <div style={{ ...grid, marginTop: 14 }}>
          <Field name="Channel">
            <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value as 'sms' | 'rcs' })} style={input}>
              <option value="sms">SMS header</option>
              <option value="rcs">RCS bot</option>
            </select>
          </Field>
          <Field name={form.channel === 'sms' ? 'Header' : 'Bot ID'}>
            <input value={form.sender_code} onChange={e => setForm({ ...form, sender_code: e.target.value })}
              placeholder={form.channel === 'sms' ? 'INSRTA' : 'bot id from Ojiva'} style={{ ...input, ...mono }} />
          </Field>
          <Field name="DLT category" hint={form.category === 'promotional' ? 'Promotional headers carry promotional templates only.' : undefined}>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={input}>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field name="DLT header ID (optional)">
            <input value={form.dlt_header_id} onChange={e => setForm({ ...form, dlt_header_id: e.target.value })} style={{ ...input, ...mono }} />
          </Field>
        </div>
        <Problems list={senderProblems} />
        <Button tone="primary" onClick={addSender} disabled={!form.sender_code.trim()}>Add sender</Button>
      </Card>

      <CtaSection toast={toast} onChange={onChange} />

      <Card title="Server environment" right={<span style={{ fontSize: 11, color: AMBER }}>Set in Vercel — never pasted here</span>}>
        <Table head={['Variable', 'What it holds']}>
          {ENV_VARS.map(([k, v]) => (
            <tr key={k}><td style={{ ...td, ...mono }}>{k}</td><td style={{ ...td, color: MUTED }}>{v}</td></tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
