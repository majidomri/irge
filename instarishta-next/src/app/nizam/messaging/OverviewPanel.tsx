'use client';
import { AMBER, FAINT, GREEN, MUTED, RED, TEXT } from '../theme';
import { Banner, Button, Card, mono, Pill, Stat, Table, td, when } from './ui';

export interface Overview {
  provider: { id: string; label: string; ready: boolean; reachesPhones: boolean; missing: string[]; notes: string[] };
  settings: { mode: 'test' | 'live'; dlt_entity_id: string | null; test_numbers: string[]; daily_cap: number; sms_enabled: boolean; rcs_enabled: boolean; promo_window_start: number; promo_window_end: number };
  checklist: { key: string; label: string; done: boolean }[];
  webhookUrl: string;
  volume: Record<string, number>;
  optouts: number;
  campaigns: { id: string; name: string; status: string; total: number; skipped: number; scheduled_at: string | null; created_at: string; last_error: string | null }[];
}

type Go = (s: 'overview' | 'setup' | 'templates' | 'test' | 'campaigns' | 'log' | 'audience') => void;

const GO_FOR: Record<string, Parameters<Go>[0]> = {
  entity: 'setup', ctas: 'setup', sms_sender: 'setup', rcs_sender: 'setup', tests: 'setup',
  sms_tpl: 'templates', rcs_tpl: 'templates', provider: 'setup', webhook: 'setup',
};

export default function OverviewPanel({ data, onRefresh, go }: { data: Overview | null; onRefresh: () => void; go: Go }) {
  if (!data) return <Card><div style={{ fontSize: 12, color: MUTED }}>Loading…</div></Card>;

  const v = data.volume;
  const sent = (v.submitted ?? 0) + (v.sent ?? 0) + (v.delivered ?? 0) + (v.read ?? 0) + (v.failed ?? 0) + (v.unreachable ?? 0);
  const delivered = (v.delivered ?? 0) + (v.read ?? 0);
  const done = data.checklist.filter(c => c.done).length;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {!data.provider.reachesPhones && (
        <Banner tone="warn" title="Sandbox provider — nothing reaches a phone">
          Everything works end to end — templates, test sends, campaigns, receipts — with simulated delivery.
          Set <code>MESSAGING_PROVIDER=ojiva</code> and the <code>OJIVA_*</code> variables to connect the real gateway.
          In the sandbox, numbers ending <code>0000</code> are rejected, <code>1111</code> have no RCS, and <code>2222</code> fail delivery.
        </Banner>
      )}
      {data.provider.reachesPhones && !data.provider.ready && (
        <Banner tone="warn" title={`${data.provider.label} is not ready`}>
          {data.provider.missing.length > 0 && <>Missing: <code>{data.provider.missing.join(', ')}</code>. </>}
          {data.provider.notes.join(' ')}
        </Banner>
      )}

      <Card title="Last 7 days" right={<Button onClick={onRefresh}>Refresh</Button>}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Stat k="Sent" v={sent} />
          <Stat k="Delivered" v={delivered} color={GREEN} />
          <Stat k="Delivery rate" v={sent ? `${Math.round((delivered / sent) * 100)}%` : '—'} color={GREEN} />
          <Stat k="Failed" v={(v.failed ?? 0) + (v.unreachable ?? 0)} color={(v.failed ?? 0) ? RED : TEXT} />
          <Stat k="Skipped" v={v.skipped ?? 0} color={FAINT} />
          <Stat k="Opt-outs" v={data.optouts} color={AMBER} />
        </div>
      </Card>

      <Card title={`Setup checklist · ${done}/${data.checklist.length}`}>
        <div style={{ display: 'grid', gap: 6 }}>
          {data.checklist.map(c => (
            <button key={c.key} type="button" onClick={() => go(GO_FOR[c.key] ?? 'setup')} style={{
              display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, textAlign: 'left',
              background: 'transparent', border: 'none', padding: '4px 0', cursor: 'pointer', color: c.done ? MUTED : TEXT,
            }}>
              <span aria-hidden style={{ color: c.done ? GREEN : AMBER, width: 16 }}>{c.done ? '✓' : '○'}</span>
              <span style={{ textDecoration: c.done ? 'line-through' : 'none' }}>{c.label}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Delivery webhook">
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 8, lineHeight: 1.6 }}>
          Register this as the delivery report (DLR) callback URL in the Ojiva Nexus panel, with your
          <code> OJIVA_WEBHOOK_SECRET</code> in place of the placeholder. It accepts GET or POST, JSON or form data.
        </div>
        <div style={{ ...mono, fontSize: 12, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', wordBreak: 'break-all' }}>
          {data.webhookUrl}
        </div>
      </Card>

      <Card title="Recent campaigns" right={<Button onClick={() => go('campaigns')}>All campaigns</Button>}>
        <Table head={['Campaign', 'Status', 'Recipients', 'Created']}
          empty={data.campaigns.length === 0 && <div style={{ padding: 12, fontSize: 12, color: MUTED }}>No campaigns yet.</div>}>
          {data.campaigns.map(c => (
            <tr key={c.id}>
              <td style={td}>{c.name}{c.last_error && <div style={{ color: RED, fontSize: 11 }}>{c.last_error}</div>}</td>
              <td style={td}><Pill status={c.status} /></td>
              <td style={td}>{c.total - c.skipped} <span style={{ color: FAINT }}>/ {c.total}</span></td>
              <td style={{ ...td, color: MUTED, whiteSpace: 'nowrap' }}>{when(c.created_at)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
