'use client';
/**
 * The RCS console.
 *
 * ── The shape of this screen follows the shape of the risk ──────────────────
 * RCS has no unsend. Once a message lands it is on a stranger's phone, in the
 * same app as messages from their family. So the flow is deliberately not
 * "type, press send": it is compose → check who can actually receive → preview
 * the exact JSON → and only then a separate, explicit send that has to be armed
 * first. Dry run is the default everywhere, including in the API.
 *
 * ── It works before the credentials exist ───────────────────────────────────
 * RCS needs a partner account, a verified brand, per-carrier launch approval
 * and (in India) TRAI DLT registration — see lib/rcs/config.ts. None of that is
 * code, and none of it is fast. So this screen is fully usable unconfigured:
 * you can compose, validate, and render the real payload. Only the two buttons
 * that touch Google's API are disabled, and the banner says which of the four
 * things is missing rather than failing with a generic error.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  CARD, PANEL, SUBTLE, BORDER, TEXT, MUTED, FAINT,
  GREEN, RED, RED_BG, AMBER, AMBER_BG, FIELD, chip,
} from './theme';

type Kind    = 'text' | 'card' | 'carousel';
type Traffic = 'TRANSACTION' | 'PROMOTION' | 'SERVICEREQUEST' | 'ACKNOWLEDGEMENT';

interface Readiness { ready: boolean; missing: string[]; agentId: string; region: string }

interface LogRow {
  id: string; phone: string; status: string; error: string | null;
  traffic_type: string; sent_by: string; batch_id: string | null;
  created_at: string; delivered_at: string | null; read_at: string | null;
}

interface CapRow { phone: string; reachable: boolean | null; cached: boolean; error?: string }

interface Member {
  email: string; name: string | null; phone: string | null;
  phone_verified: boolean; rcs_consent: boolean; consent_at: string | null; plan: string | null;
}

interface Audience {
  members: Member[];
  counts: { total: number; withPhone: number; verified: number; consented: number; addressable: number };
  addressable: string[];
}

const STATUS_COLOR: Record<string, string> = {
  sent: GREEN, delivered: GREEN, read: GREEN,
  queued: AMBER, dry_run: FAINT,
  unreachable: MUTED, failed: RED,
};

/**
 * The four an admin can legitimately pick.
 *
 * AUTHENTICATION is deliberately absent: it is for OTP agents, this project's
 * OTP goes through Firebase Phone Auth, and mislabelling traffic is the fastest
 * way to lose an agent's carrier approval.
 */
const TRAFFIC_OPTIONS: { value: Traffic; label: string; hint: string }[] = [
  { value: 'TRANSACTION',    label: 'Transactional', hint: 'Triggered by something the member did' },
  { value: 'PROMOTION',      label: 'Promotional',   hint: 'Marketing — needs consent' },
  { value: 'SERVICEREQUEST', label: 'Service',       hint: 'Consented service updates' },
  { value: 'ACKNOWLEDGEMENT',label: 'Acknowledgement',hint: 'Unsubscribe confirmations' },
];

const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: FAINT, marginBottom: 6, display: 'block',
};

export default function RcsTab({ toast }: { toast: (m: string) => void }) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [log, setLog]             = useState<LogRow[]>([]);

  const [kind, setKind]       = useState<Kind>('text');
  const [traffic, setTraffic] = useState<Traffic>('TRANSACTION');
  const [text, setText]       = useState('');
  const [title, setTitle]     = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl]       = useState('');

  const [recipientsRaw, setRecipientsRaw] = useState('');
  const [audience, setAudience] = useState<Audience | null>(null);
  const [caps, setCaps]       = useState<CapRow[] | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const [busy, setBusy]   = useState<string | null>(null);
  // Sending is a two-step gesture on purpose: arming is reversible, sending is
  // not, and a single button one mis-click away from 200 real phones is not a
  // safe control no matter how it is labelled.
  const [armed, setArmed] = useState(false);

  /**
   * Fetch only — the caller decides what to do with the result.
   *
   * Split this way so the mount effect can await it before touching state:
   * a useCallback that setStates internally reads to the lint rule as a
   * synchronous setState in an effect body, because it cannot see past the
   * indirection to the await.
   */
  const fetchState = useCallback(async () => {
    const res = await fetch('/api/admin/rcs/send');
    return await res.json() as { readiness?: Readiness; messages?: LogRow[] };
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchState();
      setReadiness(data.readiness ?? null);
      setLog(data.messages ?? []);
    } catch { /* the banner already says if nothing is configured */ }
  }, [fetchState]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const data = await fetchState();
        if (!live) return;
        setReadiness(data.readiness ?? null);
        setLog(data.messages ?? []);
      } catch { /* banner covers it */ }
    })();
    return () => { live = false; };
  }, [fetchState]);

  /** One number per line, or comma separated — paste from anywhere. */
  const recipients = recipientsRaw
    .split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);

  function buildPayload() {
    if (kind === 'text')  return { kind: 'text', text };
    if (kind === 'card')  return { kind: 'card', card: { title, description, imageUrl: imageUrl || undefined } };
    return {
      kind: 'carousel',
      cards: [
        { title, description, imageUrl: imageUrl || undefined },
        { title: title ? `${title} (2)` : 'Card 2', description },
      ],
    };
  }

  async function post(url: string, body: unknown) {
    const res  = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { res, data: await res.json().catch(() => ({})) };
  }

  const loadAudience = async () => {
    if (busy) return;
    setBusy('aud');
    try {
      const res = await fetch('/api/admin/rcs/audience');
      const data = await res.json() as Audience & { error?: string };
      if (data.error) { toast(data.error); return; }
      setAudience(data);
    } finally { setBusy(null); }
  };

  /** Replace the recipient box with everyone who may lawfully be messaged. */
  const useAddressable = () => {
    if (!audience?.addressable.length) return;
    setRecipientsRaw(audience.addressable.join('\n'));
    setCaps(null);
    toast(`Loaded ${audience.addressable.length} consented members`);
  };

  const runDryRun = async () => {
    if (busy) return;
    setBusy('dry'); setProblems([]); setPreview(null);
    try {
      const { res, data } = await post('/api/admin/rcs/send', {
        recipients, payload: buildPayload(), traffic, dryRun: true,
      });
      if (!res.ok) {
        setProblems(data.problems ?? [data.error ?? 'Dry run failed']);
        toast(data.error ?? 'Dry run failed');
        return;
      }
      setPreview(JSON.stringify(data.rendered, null, 2));
      toast(`Valid — would send to ${data.tally?.dry_run ?? 0}`);
      void load();
    } finally { setBusy(null); }
  };

  const runCapability = async () => {
    if (busy) return;
    setBusy('cap');
    try {
      const { res, data } = await post('/api/admin/rcs/capability', { recipients });
      if (!res.ok) { toast(data.error ?? 'Check failed'); return; }
      setCaps(data.results ?? []);
      toast(data.note ?? `${data.reachable} reachable · ${data.unreachable} not · ${data.unknown} unknown`);
    } finally { setBusy(null); }
  };

  const runSend = async () => {
    if (busy || !armed) return;
    setBusy('send');
    try {
      const { res, data } = await post('/api/admin/rcs/send', {
        recipients, payload: buildPayload(), traffic, dryRun: false,
      });
      if (!res.ok) { toast(data.error ?? 'Send failed'); return; }
      const parts = Object.entries(data.tally ?? {}).map(([k, v]) => `${v} ${k}`);
      toast(data.stopped ? data.stopped : `Sent — ${parts.join(', ')}`);
      setArmed(false);
      void load();
    } finally { setBusy(null); }
  };

  const blocked = readiness ? !readiness.ready : true;

  return (
    <div style={{ display: 'grid', gap: 12 }}>

      {/* ── Readiness ─────────────────────────────────────────────────────── */}
      {readiness && !readiness.ready && (
        <div style={{ ...CARD, background: AMBER_BG, border: `1px solid ${AMBER}` }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: AMBER }}>RCS is not connected yet</div>
          <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
            Missing environment: <code style={{ color: TEXT }}>{readiness.missing.join(', ')}</code>.
            <br />
            Before those can exist you need, in order: an approved RCS for Business
            <strong style={{ color: TEXT }}> partner account</strong>, a
            <strong style={{ color: TEXT }}> verified brand</strong> and agent, per-carrier
            <strong style={{ color: TEXT }}> launch approval</strong> (Jio, Airtel and Vi separately),
            and <strong style={{ color: TEXT }}>TRAI DLT registration</strong>. Google&apos;s India
            guidance is to go through a partner rather than hold your own account.
            <br /><br />
            Everything on this screen works without them except the two buttons that call Google:
            you can compose, validate and see the exact payload.
          </div>
        </div>
      )}

      {readiness?.ready && (
        <div style={{ ...CARD, display: 'flex', gap: 16, alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: GREEN, fontWeight: 700 }}>● Connected</span>
          <span style={{ color: MUTED }}>agent <code style={{ color: TEXT }}>{readiness.agentId}</code></span>
          <span style={{ color: MUTED }}>region <code style={{ color: TEXT }}>{readiness.region}</code></span>
        </div>
      )}

      {/* ── Compose ───────────────────────────────────────────────────────── */}
      <div style={CARD}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Compose</div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {(['text', 'card', 'carousel'] as Kind[]).map(k => (
            <button key={k} type="button" onClick={() => { setKind(k); setPreview(null); }} style={chip(kind === k)}>
              {k === 'text' ? 'Text' : k === 'card' ? 'Rich card' : 'Carousel'}
            </button>
          ))}
        </div>

        {kind === 'text' ? (
          <>
            <label style={label}>Message</label>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
              placeholder="What the member sees in Google Messages"
              style={{ ...FIELD, width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ fontSize: 11, color: text.length > 3072 ? RED : FAINT, marginTop: 4 }}>
              {text.length} / 3072
            </div>
          </>
        ) : (
          <>
            <label style={label}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              style={{ ...FIELD, width: '100%', marginBottom: 10 }} />
            <label style={label}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              style={{ ...FIELD, width: '100%', resize: 'vertical', fontFamily: 'inherit', marginBottom: 10 }} />
            <label style={label}>Image URL</label>
            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
              placeholder="https://…  (must be publicly reachable)"
              style={{ ...FIELD, width: '100%' }} />
          </>
        )}

        <div style={{ marginTop: 14 }}>
          <label style={label}>Traffic type</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TRAFFIC_OPTIONS.map(t => (
              <button key={t.value} type="button" onClick={() => setTraffic(t.value)}
                title={t.hint} style={chip(traffic === t.value)}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: FAINT, marginTop: 6 }}>
            {TRAFFIC_OPTIONS.find(t => t.value === traffic)?.hint}. Carriers bill and filter on this —
            labelling a promotion as transactional risks the agent&apos;s approval.
          </div>
        </div>
      </div>

      {/* ── Audience ──────────────────────────────────────────────────────────
          A member is addressable only with BOTH a verified phone and consent.
          The funnel is shown rather than just the final number, because
          "17 members, 0 addressable" tells an admin where the audience is
          being lost; "0" on its own looks like a bug. */}
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 700 }}>Member audience</div>
          <button type="button" onClick={loadAudience} disabled={busy !== null}
            style={{ ...chip(false), marginLeft: 'auto', opacity: busy ? 0.5 : 1 }}>
            {busy === 'aud' ? 'Loading…' : audience ? 'Refresh' : 'Load members'}
          </button>
        </div>

        {!audience ? (
          <div style={{ fontSize: 12, color: MUTED }}>
            Load the member list to see who can lawfully receive a promotional message.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {([
                ['Members',    audience.counts.total,       MUTED],
                ['With phone', audience.counts.withPhone,   MUTED],
                ['Verified',   audience.counts.verified,    MUTED],
                ['Consented',  audience.counts.consented,   audience.counts.consented ? GREEN : AMBER],
                ['Addressable',audience.counts.addressable, audience.counts.addressable ? GREEN : AMBER],
              ] as [string, number, string][]).map(([k, v, c]) => (
                <div key={k} style={{
                  background: SUBTLE, border: `1px solid ${BORDER}`, borderRadius: 8,
                  padding: '8px 12px', minWidth: 92,
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
                  <div style={{ fontSize: 10, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
                </div>
              ))}
            </div>

            <button type="button" onClick={useAddressable}
              disabled={audience.counts.addressable === 0}
              style={{
                ...chip(false), border: `1px solid ${audience.counts.addressable ? GREEN : BORDER}`,
                color: audience.counts.addressable ? GREEN : FAINT,
                padding: '7px 14px', marginBottom: 10,
                cursor: audience.counts.addressable ? 'pointer' : 'not-allowed',
              }}>
              Use {audience.counts.addressable} consented {audience.counts.addressable === 1 ? 'member' : 'members'}
            </button>

            <div style={{ maxHeight: 220, overflowY: 'auto', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
              {audience.members.map(m => {
                const ok = m.phone_verified && m.rcs_consent && !!m.phone;
                return (
                  <div key={m.email} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderBottom: `1px solid ${BORDER}`, fontSize: 12,
                  }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                                   whiteSpace: 'nowrap', color: ok ? TEXT : MUTED }}>
                      {m.name || m.email}
                    </span>
                    <span style={{ color: m.phone_verified ? GREEN : FAINT, fontSize: 11 }}>
                      {m.phone_verified ? 'phone ✓' : m.phone ? 'unverified' : 'no phone'}
                    </span>
                    <span style={{ color: m.rcs_consent ? GREEN : AMBER, fontSize: 11, minWidth: 76, textAlign: 'right' }}>
                      {m.rcs_consent ? 'opted in' : 'no consent'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 11, color: FAINT, marginTop: 8, lineHeight: 1.6 }}>
              Consent is granted by the member in their own account and cannot be set from here —
              a flag an operator can tick is not consent. Promotional messages to anyone outside
              this list are exactly what DLT scrubbing exists to catch.
            </div>
          </>
        )}
      </div>

      {/* ── Recipients ────────────────────────────────────────────────────── */}
      <div style={CARD}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>
          Recipients <span style={{ color: FAINT, fontWeight: 400, fontSize: 12 }}>({recipients.length})</span>
        </div>
        <textarea value={recipientsRaw} onChange={e => { setRecipientsRaw(e.target.value); setCaps(null); }}
          rows={5}
          placeholder={'+918886667121\n9876543210\nOne per line, or comma separated. Bare 10-digit numbers are treated as Indian.'}
          style={{ ...FIELD, width: '100%', resize: 'vertical', fontFamily: 'ui-monospace, monospace' }} />

        {caps && (
          <div style={{ marginTop: 10, maxHeight: 200, overflowY: 'auto',
                        border: `1px solid ${BORDER}`, borderRadius: 8 }}>
            {caps.map(c => (
              <div key={c.phone} style={{
                display: 'flex', justifyContent: 'space-between', padding: '6px 10px',
                borderBottom: `1px solid ${BORDER}`, fontSize: 12,
              }}>
                <span style={{ fontFamily: 'ui-monospace, monospace' }}>{c.phone}</span>
                <span style={{ color: c.reachable === true ? GREEN : c.reachable === false ? MUTED : AMBER }}>
                  {c.reachable === true ? 'RCS ✓' : c.reachable === false ? 'no RCS' : (c.error ? 'check failed' : 'unknown')}
                  {c.cached && <span style={{ color: FAINT }}> · cached</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Validate / send ───────────────────────────────────────────────── */}
      <div style={{ ...CARD, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={runDryRun} disabled={busy !== null || recipients.length === 0}
          style={{ ...chip(false), border: `1px solid ${GREEN}`, color: GREEN,
                   padding: '7px 14px', opacity: busy || !recipients.length ? 0.5 : 1 }}>
          {busy === 'dry' ? 'Checking…' : 'Dry run & preview'}
        </button>

        <button type="button" onClick={runCapability}
          disabled={busy !== null || blocked || recipients.length === 0}
          title={blocked ? 'Needs a connected agent' : 'Ask Google which of these can receive RCS'}
          style={{ ...chip(false), padding: '7px 14px',
                   opacity: busy || blocked || !recipients.length ? 0.5 : 1 }}>
          {busy === 'cap' ? 'Checking…' : 'Check reachability'}
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: armed ? RED : MUTED, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={armed} disabled={blocked}
              onChange={e => setArmed(e.target.checked)} />
            I understand this sends to real phones
          </label>
          <button type="button" onClick={runSend}
            disabled={busy !== null || blocked || !armed || recipients.length === 0}
            style={{
              fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 999,
              border: `1px solid ${armed && !blocked ? RED : BORDER}`,
              background: armed && !blocked ? RED_BG : 'transparent',
              color: armed && !blocked ? RED : FAINT,
              cursor: armed && !blocked ? 'pointer' : 'not-allowed',
              opacity: busy ? 0.5 : 1,
            }}>
            {busy === 'send' ? 'Sending…' : `Send to ${recipients.length}`}
          </button>
        </div>
      </div>

      {problems.length > 0 && (
        <div style={{ ...CARD, background: RED_BG, border: `1px solid ${RED}` }}>
          <div style={{ fontWeight: 700, color: RED, marginBottom: 6 }}>Not valid</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: MUTED }}>
            {problems.map(p => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}

      {preview && (
        <div style={CARD}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Payload <span style={{ color: FAINT, fontWeight: 400, fontSize: 12 }}>— exactly what would be sent</span>
          </div>
          <pre style={{
            margin: 0, background: SUBTLE, padding: 12, borderRadius: 8, overflowX: 'auto',
            fontSize: 11, color: MUTED, lineHeight: 1.5,
          }}>{preview}</pre>
        </div>
      )}

      {/* ── Log ───────────────────────────────────────────────────────────── */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', fontWeight: 700, borderBottom: `1px solid ${BORDER}` }}>
          Send log <span style={{ color: FAINT, fontWeight: 400, fontSize: 12 }}>({log.length})</span>
        </div>
        {log.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12, color: MUTED }}>Nothing sent yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: SUBTLE, textAlign: 'left' }}>
                  {['When', 'To', 'Type', 'Status', 'By'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', fontWeight: 600, color: FAINT }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.map(r => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: MUTED }}>
                      {new Date(r.created_at).toLocaleString('en-IN', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'ui-monospace, monospace' }}>{r.phone}</td>
                    <td style={{ padding: '8px 12px', color: MUTED }}>{r.traffic_type.toLowerCase()}</td>
                    <td style={{ padding: '8px 12px', color: STATUS_COLOR[r.status] ?? MUTED }}>
                      {r.status.replace(/_/g, ' ')}
                      {r.error && (
                        <div style={{ color: FAINT, fontSize: 11, maxWidth: 320 }}>{r.error}</div>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', color: MUTED }}>{r.sent_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ ...CARD, background: PANEL, fontSize: 11, color: FAINT, lineHeight: 1.6 }}>
        Dry run is the default in the API too — a send only happens when this screen
        explicitly asks for one. There is no unsend in RCS.
      </div>
    </div>
  );
}
