'use client';
/**
 * Test send: one approved template, to your own phones, right now.
 *
 * This is how each template gets proven before a campaign uses it — and how
 * OJIVA_CONTRACT_VERIFIED earns its 1: send here, check the handset, check the
 * receipt arrived in the table below.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AMBER, BORDER, FAINT, MUTED, RED, SUBTLE, TEXT } from '../theme';
import { ctaViolations, measureSms, renderTemplate } from '@/lib/messaging/dlt';
import { useCtas } from './CtaSection';
import type { Overview } from './OverviewPanel';
import type { TemplateRow } from './TemplatesPanel';
import { api, Banner, Button, Card, Field, input, mono, Pill, Problems, Table, td, when, type Toast } from './ui';

interface Sent { phone: string; status: string; error?: string; id: string }
interface LogMsg { id: string; status: string; error: string | null; delivered_at: string | null; read_at: string | null }

export default function TestPanel({ toast, overview }: { toast: Toast; overview: Overview | null }) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [phones, setPhones] = useState<string[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent[]>([]);
  const [status, setStatus] = useState<Record<string, LogMsg>>({});
  const ctas = useCtas();

  useEffect(() => {
    let live = true;
    void api<{ templates: TemplateRow[] }>('/api/admin/messaging/templates').then(r => {
      if (live && r.ok) setTemplates(r.data.templates.filter(t => t.status === 'approved'));
    });
    return () => { live = false; };
  }, []);

  const template = templates.find(t => t.id === templateId) ?? null;
  const testNumbers = overview?.settings.test_numbers ?? [];

  const preview = useMemo(() => {
    if (!template) return null;
    const r = renderTemplate(template.body, template.variables, values, { name: 'Test' }, { useSamples: true });
    const cta = template.channel === 'sms' ? ctaViolations(r.text, ctas) : [];
    return { ...r, problems: [...r.problems, ...cta], seg: measureSms(r.text) };
  }, [template, values, ctas]);

  /** Re-read the rows just sent, so receipts appear as they arrive. */
  const poll = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const r = await api<{ messages: LogMsg[] }>('/api/admin/messaging/messages?campaign=none');
    if (!r.ok) return;
    setStatus(Object.fromEntries(r.data.messages.filter(m => ids.includes(m.id)).map(m => [m.id, m])));
  }, []);

  useEffect(() => {
    const ids = sent.map(s => s.id).filter(Boolean);
    if (!ids.length) return;
    const timer = setInterval(() => { void poll(ids); }, 5000);
    return () => clearInterval(timer);
  }, [sent, poll]);

  const send = async () => {
    if (!template) return;
    setBusy(true); setProblems([]);
    const r = await api<{ results: Sent[]; reachesPhones: boolean }>('/api/admin/messaging/test-send', 'POST', {
      templateId: template.id, variables: values, phones,
    });
    setBusy(false);
    if (!r.ok) { setProblems(r.data.problems ?? [r.data.error ?? 'Send failed']); return; }
    setSent(r.data.results);
    toast(r.data.reachesPhones ? 'Test sent — check your phone' : 'Sandbox send recorded');
    void poll(r.data.results.map(x => x.id));
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {testNumbers.length === 0 && (
        <Banner tone="warn" title="No test numbers yet">Add your own phones under Setup → Test numbers. Test sends can only go to those.</Banner>
      )}

      <Card title="Send a test">
        <Field name="Template" hint={templates.length === 0 ? 'Only approved templates are listed.' : undefined}>
          <select value={templateId} onChange={e => { setTemplateId(e.target.value); setValues({}); }} style={input}>
            <option value="">— choose an approved template —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.channel.toUpperCase()} · {t.name}</option>)}
          </select>
        </Field>

        {template && (
          <>
            {template.variables.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                {template.variables.map(v => (
                  <Field key={v.key} name={v.label} hint={`Up to ${v.max ?? 30} characters`}>
                    <input value={values[v.key] ?? ''} placeholder={v.sample ?? ''}
                      onChange={e => setValues({ ...values, [v.key]: e.target.value })} style={input} />
                  </Field>
                ))}
              </div>
            )}

            {preview && (
              <div style={{ background: SUBTLE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: FAINT, marginBottom: 6 }}>
                  What arrives{template.channel === 'sms' && ` · ${preview.seg.encoding} · ${preview.seg.segments} part${preview.seg.segments === 1 ? '' : 's'}`}
                </div>
                <div style={{ fontSize: 13, color: TEXT, whiteSpace: 'pre-wrap' }}>{preview.text}</div>
                {preview.problems.length > 0 && <div style={{ color: RED, fontSize: 11, marginTop: 6 }}>{preview.problems.join(' · ')}</div>}
              </div>
            )}

            <Field name={`Send to (max 5)`}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {testNumbers.map(n => (
                  <label key={n} style={{ display: 'flex', gap: 6, fontSize: 13, ...mono }}>
                    <input type="checkbox" checked={phones.includes(n)}
                      onChange={e => setPhones(e.target.checked ? [...phones, n].slice(0, 5) : phones.filter(p => p !== n))} />
                    {n}
                  </label>
                ))}
              </div>
            </Field>

            <Problems list={problems} />
            <Button tone="primary" busy={busy} disabled={!phones.length || (preview?.problems.length ?? 0) > 0} onClick={send}>
              Send test to {phones.length || '…'}
            </Button>
            {overview && !overview.provider.reachesPhones && (
              <span style={{ fontSize: 11, color: AMBER, marginLeft: 10 }}>Sandbox — simulated, no SMS will arrive</span>
            )}
          </>
        )}
      </Card>

      {sent.length > 0 && (
        <Card title="This test" right={<Button onClick={() => poll(sent.map(s => s.id))}>Refresh receipts</Button>}>
          <Table head={['Number', 'Status', 'Delivered', 'Detail']}>
            {sent.map(s => {
              const live = status[s.id];
              return (
                <tr key={s.phone}>
                  <td style={{ ...td, ...mono }}>{s.phone}</td>
                  <td style={td}><Pill status={live?.status ?? s.status} /></td>
                  <td style={{ ...td, color: MUTED }}>{when(live?.read_at ?? live?.delivered_at)}</td>
                  <td style={{ ...td, color: RED, fontSize: 11 }}>{live?.error ?? s.error ?? ''}</td>
                </tr>
              );
            })}
          </Table>
          <div style={{ fontSize: 11, color: FAINT, marginTop: 8 }}>Receipts refresh every 5 seconds while this screen is open.</div>
        </Card>
      )}
    </div>
  );
}
