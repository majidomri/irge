'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthClient } from '@/lib/auth-client';
import { getSessionUid, computeFpHash } from '@/lib/iris';
import GradientText from '@/components/ui/GradientText';

interface SessionRow {
  session_uid:  string;
  fp_hash:      string | null;
  ip:           string | null;
  user_agent:   string | null;
  country:      string | null;
  city:         string | null;
  created_at:   string;
  last_seen_at: string;
  revoked_at:   string | null;
}

// Naive UA → label parser. Good-enough for "iPhone 17 · Safari" style hints
// without pulling in ua-parser-js (~30 KB).
function deviceLabel(ua: string | null): { device: string; browser: string; emoji: string } {
  if (!ua) return { device: 'Unknown device', browser: '', emoji: '🖥️' };
  const u = ua;

  let device = 'Computer';
  let emoji  = '💻';
  if (/iPad/i.test(u))                          { device = 'iPad';     emoji = '📱'; }
  else if (/iPhone/i.test(u))                   { device = 'iPhone';   emoji = '📱'; }
  else if (/Android.*Tablet/i.test(u))          { device = 'Android tablet'; emoji = '📱'; }
  else if (/Android/i.test(u))                  { device = 'Android';  emoji = '📱'; }
  else if (/Macintosh|Mac OS X/i.test(u))       { device = 'Mac';      emoji = '💻'; }
  else if (/Windows/i.test(u))                  { device = 'Windows';  emoji = '🖥️'; }
  else if (/Linux/i.test(u))                    { device = 'Linux';    emoji = '🖥️'; }

  let browser = 'Browser';
  if      (/Edg\//.test(u))                     browser = 'Edge';
  else if (/OPR\/|Opera/.test(u))               browser = 'Opera';
  else if (/Chrome\//.test(u) && !/Edg\//.test(u)) browser = 'Chrome';
  else if (/Firefox\//.test(u))                 browser = 'Firefox';
  else if (/Safari\//.test(u) && !/Chrome\//.test(u)) browser = 'Safari';

  return { device, browser, emoji };
}

function relTime(iso: string): string {
  const d  = new Date(iso).getTime();
  const ms = Date.now() - d;
  const s  = Math.floor(ms / 1000);
  if (s < 60)      return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60)      return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24)      return `${h} hr ago`;
  const dd = Math.floor(h / 24);
  if (dd < 30)     return `${dd} day${dd === 1 ? '' : 's'} ago`;
  const mo = Math.floor(dd / 30);
  return `${mo} mo ago`;
}

function fmtLocation(s: SessionRow): string {
  const parts = [s.city, s.country].filter(Boolean) as string[];
  if (parts.length) return parts.join(', ');
  return s.ip ? `IP ${s.ip}` : 'Unknown location';
}

export default function DevicesPage() {
  const router = useRouter();
  const { user, session, loading: authLoading, signOut } = useAuth();

  const [rows, setRows]         = useState<SessionRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState<string | null>(null);
  const [toast, setToast]       = useState('');

  const currentUid = typeof window !== 'undefined' ? getSessionUid() : '';

  useEffect(() => {
    if (!authLoading && !user) router.replace('/');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await getAuthClient().rpc('ir_user_sessions_list');
      if (error) throw error;
      setRows((data as SessionRow[]) ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const token = session?.access_token;
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        // Force a server-side log first so the row for THIS device exists
        // before we fetch the list. Covers users who were signed in before
        // the sessions feature shipped and never had a SIGNED_IN event fire.
        // Token comes from AuthContext (no extra getSession lock acquisition).
        const fpHash = await computeFpHash();
        await fetch('/api/account/sessions/log', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ session_uid: getSessionUid(), fp_hash: fpHash }),
        }).catch(() => {});

        const { data, error } = await getAuthClient().rpc('ir_user_sessions_list');
        if (cancelled) return;
        if (error) throw error;
        setRows((data as SessionRow[]) ?? []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, session]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const callRevoke = async (
    scope: 'session' | 'others' | 'global',
    target?: string,
  ): Promise<boolean> => {
    // Use the token already held by AuthContext — avoids re-acquiring the
    // Supabase auth lock here and racing with the subsequent signOut().
    const token = session?.access_token;
    if (!token) return false;

    const res = await fetch('/api/account/sessions/revoke', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ scope, session_uid: target, current_uid: currentUid }),
    });
    return res.ok;
  };

  const handleSignOutDevice = async (row: SessionRow) => {
    setBusy(row.session_uid);
    const isCurrent = row.session_uid === currentUid;

    const ok = await callRevoke('session', row.session_uid);
    if (!ok) { setBusy(null); showToast('Could not sign out that device.'); return; }

    if (isCurrent) {
      await signOut();
      router.push('/');
      return;
    }
    showToast('Device signed out.');
    setBusy(null);
    load();
  };

  const handleSignOutOthers = async () => {
    setBusy('others');
    const ok = await callRevoke('others');
    setBusy(null);
    if (!ok) { showToast('Could not sign out other devices.'); return; }
    showToast('Other devices signed out.');
    load();
  };

  const handleSignOutEverywhere = async () => {
    if (!confirm('Sign out of every device, including this one?')) return;
    setBusy('global');
    await callRevoke('global');
    await signOut();
    router.push('/');
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a1a14' }}>
        <span className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin block" />
      </div>
    );
  }

  const activeRows  = rows.filter(r => !r.revoked_at);
  const revokedRows = rows.filter(r => r.revoked_at);

  return (
    <div className="min-h-screen px-5 py-8" style={{ background: '#0a1a14' }}>
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-xl border-0 shrink-0"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}
            aria-label="Back"
          >‹</button>
          <h1 className="text-xl font-extrabold leading-tight">
            <GradientText colors={['#00C87A', '#ffffff', '#00A86B', '#ffffff']} animationSpeed={5}>
              Where you&apos;re signed in
            </GradientText>
          </h1>
        </div>

        <p className="text-[13px] mb-6 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Devices currently signed in to your account. You can sign out of a single device or every other device at once.
        </p>

        {/* Loading */}
        {loading && (
          <div className="py-12 flex justify-center">
            <span className="w-7 h-7 rounded-full border-2 border-green-500 border-t-transparent animate-spin block" />
          </div>
        )}

        {/* Empty */}
        {!loading && activeRows.length === 0 && (
          <div className="rounded-2xl p-8 text-center mb-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-3xl mb-2">🤔</p>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              No active devices on record yet. Sign in from any device and it&apos;ll appear here.
            </p>
          </div>
        )}

        {/* Active rows */}
        {!loading && activeRows.length > 0 && (
          <div className="flex flex-col gap-2.5 mb-6">
            {activeRows.map(row => {
              const { device, browser, emoji } = deviceLabel(row.user_agent);
              const isCurrent = row.session_uid === currentUid;
              return (
                <div
                  key={row.session_uid}
                  className="rounded-2xl p-4"
                  style={{
                    background: isCurrent ? 'rgba(0,168,107,0.10)' : 'rgba(255,255,255,0.05)',
                    border:     isCurrent ? '1px solid rgba(0,168,107,0.35)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style={{ background: isCurrent ? 'rgba(0,168,107,0.18)' : 'rgba(255,255,255,0.06)' }}>
                      {emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-white">{device} · {browser}</p>
                        {isCurrent && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(0,168,107,0.25)', color: '#00C87A' }}>This device</span>
                        )}
                      </div>
                      <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {fmtLocation(row)}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        Last active {relTime(row.last_seen_at)} · Signed in {relTime(row.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Device fingerprint — our "MAC equivalent" since browsers
                      do not expose real MAC addresses to JavaScript. */}
                  <details className="mb-3 group">
                    <summary
                      className="cursor-pointer text-[10px] font-semibold flex items-center gap-1.5 list-none"
                      style={{ color: 'rgba(255,255,255,0.4)' }}
                    >
                      <span className="transition-transform group-open:rotate-90">›</span>
                      Device details
                    </summary>
                    <div className="mt-2 grid grid-cols-[68px_1fr] gap-x-2 gap-y-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      <span style={{ color: 'rgba(255,255,255,0.3)' }}>IP</span>
                      <span className="font-mono break-all">{row.ip ?? '—'}</span>

                      <span style={{ color: 'rgba(255,255,255,0.3)' }}>Device hash</span>
                      <span className="font-mono break-all" title="Stable browser fingerprint (canvas+WebGL+audio+fonts+env)">
                        {row.fp_hash ? `${row.fp_hash.slice(0, 16)}…` : '—'}
                      </span>

                      <span style={{ color: 'rgba(255,255,255,0.3)' }}>Country</span>
                      <span>{row.country ?? '—'}</span>

                      <span style={{ color: 'rgba(255,255,255,0.3)' }}>UA</span>
                      <span className="font-mono break-all" style={{ wordBreak: 'break-all' }}>
                        {row.user_agent ? row.user_agent.slice(0, 90) + (row.user_agent.length > 90 ? '…' : '') : '—'}
                      </span>
                    </div>
                  </details>

                  <button
                    onClick={() => handleSignOutDevice(row)}
                    disabled={busy === row.session_uid}
                    className="w-full text-xs font-bold rounded-full py-2 transition-opacity disabled:opacity-50"
                    style={{
                      background: isCurrent ? 'rgba(255,107,107,0.12)' : 'rgba(255,255,255,0.07)',
                      color:      isCurrent ? '#FF8080' : 'rgba(255,255,255,0.7)',
                      border:     isCurrent ? '1px solid rgba(255,107,107,0.25)' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {busy === row.session_uid
                      ? 'Signing out…'
                      : isCurrent ? 'Sign out of this device' : 'Sign out'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Bulk actions */}
        {!loading && activeRows.length > 1 && (
          <div className="rounded-2xl p-4 mb-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Sign out remotely
            </p>
            <button
              onClick={handleSignOutOthers}
              disabled={busy === 'others'}
              className="w-full text-sm font-bold rounded-full py-3 mb-2 transition-opacity disabled:opacity-50"
              style={{ background: 'rgba(0,168,107,0.15)', color: '#00C87A', border: '1px solid rgba(0,168,107,0.3)' }}
            >
              {busy === 'others' ? 'Working…' : 'Sign out of all other devices'}
            </button>
            <button
              onClick={handleSignOutEverywhere}
              disabled={busy === 'global'}
              className="w-full text-sm font-bold rounded-full py-3 transition-opacity disabled:opacity-50"
              style={{ background: 'rgba(255,107,107,0.12)', color: '#FF8080', border: '1px solid rgba(255,107,107,0.25)' }}
            >
              {busy === 'global' ? 'Working…' : 'Sign out everywhere (including this device)'}
            </button>
          </div>
        )}

        {/* Recently revoked */}
        {revokedRows.length > 0 && (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Recently signed out
            </p>
            <div className="flex flex-col gap-2 mb-6 opacity-60">
              {revokedRows.slice(0, 10).map(row => {
                const { device, browser, emoji } = deviceLabel(row.user_agent);
                return (
                  <div key={row.session_uid} className="rounded-xl px-4 py-3 flex items-center gap-3"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <span className="text-base">{emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white">{device} · {browser}</p>
                      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        Signed out {relTime(row.revoked_at!)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <p className="text-[10px] text-center leading-relaxed" style={{ color: 'rgba(255,255,255,0.25)' }}>
          We track sessions to protect your account. Locations are approximate (based on IP).
          Browsers do not expose hardware MAC addresses, so each device is identified by a
          stable browser fingerprint (canvas + WebGL + audio + fonts + GPU + timezone).
        </p>

        {/* Toast */}
        {toast && (
          <div className="fixed left-1/2 bottom-8 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-sm font-semibold"
            style={{ background: '#141413', color: '#F3F0EE', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
