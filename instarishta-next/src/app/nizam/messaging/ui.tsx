'use client';
/**
 * Small shared pieces for the Messaging tab. Everything visual comes from
 * ../theme so this tab cannot drift from the rest of the admin.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AMBER, AMBER_BG, BORDER, CARD, FAINT, FIELD, GREEN, GREEN_BG, MUTED, NEUTRAL, RED, RED_BG, SUBTLE, TEXT,
} from '../theme';

export type Toast = (m: string) => void;

export interface ApiResult<T> { ok: boolean; status: number; data: T & { error?: string; problems?: string[] } }

/** fetch + JSON, never throws. */
export async function api<T = Record<string, unknown>>(url: string, method = 'GET', body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: (e as Error).message } as T & { error: string } };
  }
}

export const label: CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: FAINT, marginBottom: 6, display: 'block',
};

export const input: CSSProperties = { ...FIELD, width: '100%', padding: '7px 10px', boxSizing: 'border-box' };
export const mono: CSSProperties  = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' };

export function Card({ title, right, children, style }: { title?: ReactNode; right?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <section style={{ ...CARD, ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          {title && <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>}
          {right && <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ name, hint, children }: { name: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12, minWidth: 0 }}>
      <span style={label}>{name}</span>
      {children}
      {hint && <div style={{ fontSize: 11, color: FAINT, marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

type Tone = 'primary' | 'danger' | 'plain';

export function Button({ tone = 'plain', busy, disabled, onClick, children, title, type = 'button' }: {
  tone?: Tone; busy?: boolean; disabled?: boolean; onClick?: () => void; children: ReactNode; title?: string; type?: 'button' | 'submit';
}) {
  const off = disabled || busy;
  const color = tone === 'primary' ? GREEN : tone === 'danger' ? RED : MUTED;
  const bg    = tone === 'primary' ? GREEN_BG : tone === 'danger' ? RED_BG : 'transparent';
  return (
    <button type={type} onClick={onClick} disabled={off} title={title} style={{
      fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 999,
      border: `1px solid ${tone === 'plain' ? BORDER : color}`, background: off ? 'transparent' : bg,
      color: off ? FAINT : color, cursor: off ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
    }}>
      {busy ? 'Working…' : children}
    </button>
  );
}

/**
 * A button that needs a second click within a few seconds.
 *
 * Instead of window.confirm: a native dialog is easy to click through by
 * reflex, and it blocks the whole page while open.
 */
export function ConfirmButton({ tone = 'danger', busy, disabled, onConfirm, children, confirmText = 'Click again to confirm' }: {
  tone?: Tone; busy?: boolean; disabled?: boolean; onConfirm: () => void; children: ReactNode; confirmText?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button tone={armed ? 'danger' : tone} busy={busy} disabled={disabled}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmText : children}
    </Button>
  );
}

export function Problems({ list }: { list: string[] }) {
  if (!list.length) return null;
  return (
    <div role="alert" style={{ background: RED_BG, border: `1px solid ${RED}`, borderRadius: 10, padding: '10px 12px', margin: '10px 0' }}>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: TEXT, lineHeight: 1.6 }}>
        {list.map(p => <li key={p}>{p}</li>)}
      </ul>
    </div>
  );
}

export function Banner({ tone, title, children }: { tone: 'warn' | 'ok' | 'info'; title: ReactNode; children?: ReactNode }) {
  const c  = tone === 'warn' ? AMBER : tone === 'ok' ? GREEN : NEUTRAL;
  const bg = tone === 'warn' ? AMBER_BG : tone === 'ok' ? GREEN_BG : SUBTLE;
  return (
    <div style={{ background: bg, border: `1px solid ${c}`, borderRadius: 12, padding: '10px 14px' }}>
      <div style={{ fontWeight: 700, color: c, fontSize: 13 }}>{title}</div>
      {children && <div style={{ fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.6 }}>{children}</div>}
    </div>
  );
}

export function Stat({ k, v, color = TEXT }: { k: string; v: ReactNode; color?: string }) {
  return (
    <div style={{ background: SUBTLE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', minWidth: 96, flex: '1 1 96px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      <div style={{ fontSize: 10, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{k}</div>
    </div>
  );
}

export const STATUS_COLOR: Record<string, string> = {
  delivered: GREEN, read: GREEN, approved: GREEN, completed: GREEN, running: GREEN,
  submitted: NEUTRAL, sent: NEUTRAL, scheduled: NEUTRAL,
  queued: AMBER, pending: AMBER, paused: AMBER, draft: MUTED,
  failed: RED, rejected: RED, unreachable: MUTED, cancelled: MUTED, inactive: MUTED,
  skipped: FAINT, dry_run: FAINT,
};

export function Pill({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? MUTED;
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
      border: `1px solid ${c}`, color: c, whiteSpace: 'nowrap', textTransform: 'capitalize',
    }}>{status.replace(/_/g, ' ')}</span>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${BORDER}`, borderRadius: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: SUBTLE, textAlign: 'left' }}>
            {head.map(h => <th key={h} style={{ padding: '8px 10px', fontWeight: 600, color: FAINT, whiteSpace: 'nowrap' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export const td: CSSProperties = { padding: '8px 10px', borderTop: `1px solid ${BORDER}`, verticalAlign: 'top' };

export const when = (iso: string | null | undefined) => iso
  ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—';

export const CATEGORY_LABEL: Record<string, string> = {
  promotional: 'Promotional', transactional: 'Transactional',
  service_implicit: 'Service · implicit', service_explicit: 'Service · explicit',
};
