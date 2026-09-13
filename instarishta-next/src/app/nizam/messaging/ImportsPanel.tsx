'use client';
/**
 * Import Nexus exports: delivery reports, campaign reports, the account summary.
 *
 * Every file is previewed first — what kind it is, how many rows would be added
 * or updated, which messages match no registered template — and written only
 * when the admin confirms.
 */
import { useCallback, useEffect, useState } from 'react';
import { AMBER, BORDER, FAINT, GREEN, MUTED, SUBTLE, TEXT } from '../theme';
import { api, Banner, Button, Card, Stat, Table, td, when, type Toast } from './ui';

interface Result {
  kind: string; rows: number; inserted: number; updated: number; skipped: number;
  notes: string[]; sample: Record<string, unknown>[]; summary?: Record<string, string>; committed: boolean;
}
interface ImportRow { id: string; kind: string; filename: string | null; rows: number; inserted: number; updated: number; skipped: number; imported_by: string; created_at: string }
interface Account { provider_balance: number | null; provider_rate: number | null; provider_summary: Record<string, string> | null; provider_summary_at: string | null }

const KIND_LABEL: Record<string, string> = {
  delivery_report: 'Delivery report', campaign_report: 'Campaign report',
  account_summary: 'Account summary', audience: 'Recipient list', unknown: 'Unrecognised file',
};

type Payload = { filename: string; text?: string; base64?: string };

async function readFile(file: File): Promise<Payload> {
  if (/\.xlsx$/i.test(file.name)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { filename: file.name, base64: btoa(bin) };
  }
  return { filename: file.name, text: await file.text() };
}

export default function ImportsPanel({ toast, onChange }: { toast: Toast; onChange: () => void }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportRow[]>([]);
  const [account, setAccount] = useState<Account | null>(null);

  const fetchHistory = useCallback(async () => {
    const r = await api<{ imports: ImportRow[]; account: Account | null }>('/api/admin/messaging/imports');
    return r.ok ? r.data : null;
  }, []);

  useEffect(() => {
    let live = true;
    void fetchHistory().then(d => { if (live && d) { setHistory(d.imports); setAccount(d.account); } });
    return () => { live = false; };
  }, [fetchHistory]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setPreview(null);
    if (file.size > 8 * 1024 * 1024) { setError('File is larger than 8 MB'); return; }
    const p = await readFile(file);
    setPayload(p);
    setBusy('preview');
    const r = await api<Result>('/api/admin/messaging/imports', 'POST', { ...p, commit: false });
    setBusy(null);
    if (!r.ok) { setError(r.data.error ?? 'Could not read the file'); return; }
    setPreview(r.data);
  };

  const commit = async () => {
    if (!payload) return;
    setBusy('commit');
    const r = await api<Result>('/api/admin/messaging/imports', 'POST', { ...payload, commit: true });
    setBusy(null);
    if (!r.ok) { setError(r.data.error ?? 'Import failed'); return; }
    toast(`Imported — ${r.data.inserted} added, ${r.data.updated} updated`);
    setPreview(null); setPayload(null);
    const d = await fetchHistory();
    if (d) { setHistory(d.imports); setAccount(d.account); }
    onChange();
  };

  const canCommit = preview && ['delivery_report', 'campaign_report', 'account_summary'].includes(preview.kind);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {account?.provider_summary_at && (
        <Card title="Ojiva account" right={<span style={{ fontSize: 11, color: FAINT }}>from summary imported {when(account.provider_summary_at)}</span>}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Stat k="Credit balance" v={account.provider_balance?.toLocaleString('en-IN') ?? '—'} color={GREEN} />
            <Stat k="Rate / SMS" v={account.provider_rate !== null ? `₹${account.provider_rate}` : '—'} />
            <Stat k="Total SMS" v={account.provider_summary?.['total sms'] ?? '—'} />
            <Stat k="Delivered" v={account.provider_summary?.['delivered'] ?? '—'} color={GREEN} />
            <Stat k="Failed" v={account.provider_summary?.['failed'] ?? '—'} />
            <Stat k="Delivery rate" v={account.provider_summary?.['delivery rate'] ?? '—'} />
          </div>
        </Card>
      )}

      <Card title="Import a Nexus export">
        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, marginBottom: 12 }}>
          Accepted: the <strong style={{ color: TEXT }}>SMS delivery report</strong> CSV, a <strong style={{ color: TEXT }}>campaign report</strong> CSV,
          and the <strong style={{ color: TEXT }}>SMS static report</strong> XLSX. Import the delivery report first — the campaign report has no
          message IDs and joins onto it. Re-importing the same file updates rows instead of duplicating them.
        </div>
        <label style={{
          display: 'block', border: `1px dashed ${BORDER}`, borderRadius: 12, padding: '22px 16px', textAlign: 'center',
          background: SUBTLE, cursor: 'pointer', fontSize: 13, color: MUTED,
        }}>
          <input type="file" accept=".csv,.xlsx,text/csv" style={{ display: 'none' }}
            onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
          {busy === 'preview' ? 'Reading…' : payload ? `${payload.filename} — choose another file` : 'Choose a .csv or .xlsx file'}
        </label>

        {error && <div style={{ marginTop: 10 }}><Banner tone="warn" title="Could not import">{error}</Banner></div>}

        {preview && (
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Stat k="Detected" v={KIND_LABEL[preview.kind] ?? preview.kind} color={preview.kind === 'unknown' ? AMBER : TEXT} />
              <Stat k="Rows" v={preview.rows} />
              {preview.kind !== 'account_summary' && <>
                <Stat k="Will add" v={preview.inserted} color={GREEN} />
                <Stat k="Will update" v={preview.updated} />
                <Stat k="Skipped" v={preview.skipped} color={FAINT} />
              </>}
            </div>
            {preview.summary && (
              <div style={{ fontSize: 12, color: MUTED }}>
                {Object.entries(preview.summary).map(([k, v]) => <span key={k} style={{ marginRight: 14 }}>{k}: <strong style={{ color: TEXT }}>{v}</strong></span>)}
              </div>
            )}
            {preview.notes.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: AMBER, lineHeight: 1.6 }}>
                {preview.notes.map(n => <li key={n}>{n}</li>)}
              </ul>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button tone="primary" busy={busy === 'commit'} disabled={!canCommit} onClick={commit}>Import</Button>
              <Button onClick={() => { setPreview(null); setPayload(null); }}>Discard</Button>
            </div>
          </div>
        )}
      </Card>

      <Card title="Import history">
        <Table head={['When', 'File', 'Kind', 'Rows', 'Added', 'Updated', 'By']}
          empty={history.length === 0 && <div style={{ padding: 12, fontSize: 12, color: MUTED }}>Nothing imported yet.</div>}>
          {history.map(h => (
            <tr key={h.id}>
              <td style={{ ...td, color: MUTED, whiteSpace: 'nowrap' }}>{when(h.created_at)}</td>
              <td style={td}>{h.filename ?? '—'}</td>
              <td style={{ ...td, color: MUTED }}>{KIND_LABEL[h.kind] ?? h.kind}</td>
              <td style={td}>{h.rows}</td>
              <td style={{ ...td, color: GREEN }}>{h.inserted}</td>
              <td style={td}>{h.updated}</td>
              <td style={{ ...td, color: MUTED }}>{h.imported_by}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
