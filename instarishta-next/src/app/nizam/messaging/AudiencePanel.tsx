'use client';
/**
 * Who can be messaged, and who asked not to be.
 *
 * Consent is not settable here — members grant it in /account and nowhere
 * else. Blocking is: stopping messages is never the unsafe direction.
 */
import { useCallback, useEffect, useState } from 'react';
import { AMBER, FAINT, GREEN, MUTED } from '../theme';
import { api, Button, Card, ConfirmButton, Field, input, mono, Problems, Stat, Table, td, when, type Toast } from './ui';

interface Member { email: string; name: string | null; phone: string | null; phone_verified: boolean; rcs_consent: boolean; consent_at: string | null; plan: string | null; opted_out: boolean; reachable: boolean }
interface Funnel { members: number; withPhone: number; verified: number; consented: number; reachable: number }
interface Optout { phone: string; source: string; reason: string | null; created_by: string | null; created_at: string }

const SOURCE_LABEL: Record<string, string> = { reply: 'Replied STOP', member: 'Member turned off', admin: 'Blocked by admin', provider: 'Provider / DND' };

export default function AudiencePanel({ toast }: { toast: Toast }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [optouts, setOptouts] = useState<Optout[]>([]);
  const [add, setAdd] = useState({ phones: '', reason: '' });
  const [problems, setProblems] = useState<string[]>([]);

  const fetchAll = useCallback(async () => {
    const [a, o] = await Promise.all([
      api<{ members: Member[]; funnel: Funnel }>('/api/admin/messaging/audience'),
      api<{ optouts: Optout[] }>('/api/admin/messaging/optouts'),
    ]);
    return { a: a.ok ? a.data : null, o: o.ok ? o.data.optouts : [] };
  }, []);

  const apply = ({ a, o }: Awaited<ReturnType<typeof fetchAll>>) => {
    if (a) { setMembers(a.members); setFunnel(a.funnel); }
    setOptouts(o);
  };

  useEffect(() => {
    let live = true;
    void fetchAll().then(({ a, o }) => {
      if (!live) return;
      if (a) { setMembers(a.members); setFunnel(a.funnel); }
      setOptouts(o);
    });
    return () => { live = false; };
  }, [fetchAll]);

  const block = async () => {
    setProblems([]);
    const r = await api<{ added: number; invalid: string[] }>('/api/admin/messaging/optouts', 'POST', add);
    if (!r.ok) { setProblems([r.data.error ?? 'Could not add']); return; }
    toast(`Blocked ${r.data.added}`); setAdd({ phones: '', reason: '' });
    apply(await fetchAll());
  };

  const unblock = async (phone: string) => {
    const r = await api('/api/admin/messaging/optouts', 'DELETE', { phone });
    if (!r.ok) { toast(r.data.error ?? 'Could not remove'); return; }
    apply(await fetchAll());
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card title="Member audience">
        {funnel && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Stat k="Members" v={funnel.members} />
            <Stat k="With phone" v={funnel.withPhone} />
            <Stat k="Verified" v={funnel.verified} />
            <Stat k="Opted in" v={funnel.consented} color={funnel.consented ? GREEN : AMBER} />
            <Stat k="Reachable" v={funnel.reachable} color={funnel.reachable ? GREEN : AMBER} />
          </div>
        )}
        <div style={{ fontSize: 11, color: FAINT, marginBottom: 10, lineHeight: 1.6 }}>
          Reachable = verified phone + opted in from their account + not opted out. Promotional and explicit-service campaigns only go to these members.
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          <Table head={['Member', 'Phone', 'Verified', 'Consent', 'Reachable']}>
            {members.map(m => (
              <tr key={m.email}>
                <td style={td}>{m.name || m.email}<div style={{ color: FAINT, fontSize: 11 }}>{m.name ? m.email : ''}</div></td>
                <td style={{ ...td, ...mono, color: MUTED }}>{m.phone ?? '—'}</td>
                <td style={{ ...td, color: m.phone_verified ? GREEN : FAINT }}>{m.phone_verified ? 'yes' : 'no'}</td>
                <td style={{ ...td, color: m.rcs_consent ? GREEN : FAINT }}>{m.rcs_consent ? `since ${when(m.consent_at)}` : 'no'}</td>
                <td style={{ ...td, color: m.reachable ? GREEN : m.opted_out ? AMBER : FAINT }}>{m.reachable ? 'yes' : m.opted_out ? 'opted out' : 'no'}</td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>

      <Card title={`Opt-outs (${optouts.length})`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <Field name="Block numbers" hint="One per line. Queued messages to them are skipped immediately.">
            <textarea value={add.phones} onChange={e => setAdd({ ...add, phones: e.target.value })} rows={3} style={{ ...input, ...mono, resize: 'vertical' }} />
          </Field>
          <Field name="Reason">
            <input value={add.reason} onChange={e => setAdd({ ...add, reason: e.target.value })} placeholder="Complaint by phone" style={input} />
          </Field>
        </div>
        <Problems list={problems} />
        <Button tone="danger" disabled={!add.phones.trim()} onClick={block}>Block</Button>

        <div style={{ marginTop: 14 }}>
          <Table head={['Number', 'Source', 'Reason', 'When', '']}
            empty={optouts.length === 0 && <div style={{ padding: 12, fontSize: 12, color: MUTED }}>No opt-outs.</div>}>
            {optouts.map(o => (
              <tr key={o.phone}>
                <td style={{ ...td, ...mono }}>{o.phone}</td>
                <td style={td}>{SOURCE_LABEL[o.source] ?? o.source}</td>
                <td style={{ ...td, color: MUTED }}>{o.reason ?? '—'}</td>
                <td style={{ ...td, color: MUTED, whiteSpace: 'nowrap' }}>{when(o.created_at)}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {o.source === 'admin'
                    ? <ConfirmButton tone="plain" onConfirm={() => unblock(o.phone)} confirmText="Unblock?">Unblock</ConfirmButton>
                    : <span style={{ fontSize: 11, color: FAINT }} title="Only the member can reverse their own opt-out">member’s choice</span>}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>
    </div>
  );
}
