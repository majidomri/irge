'use client';
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getAuthClient, markRegistered } from '@/lib/auth-client';
import { logIrisEvent, initIris, computeFpHash, getSessionUid } from '@/lib/iris';

interface ProfileState {
  credits:         number;
  plan:            string;
  plan_expires_at: string | null;
  is_banned:       boolean;
}

interface AuthContextValue {
  user:    User | null;
  session: Session | null;
  loading: boolean;
  profile: ProfileState;
  refreshProfile: () => Promise<void>;
  signInWithGoogleOneTap: (credential: string, nonce?: string) => Promise<{ error?: string }>;
  signInWithGoogleRedirect: (redirectTo?: string) => Promise<{ error?: string }>;
  signInWithEmail:  (email: string, redirectTo?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const DEFAULT_PROFILE: ProfileState = { credits: 0, plan: 'none', plan_expires_at: null, is_banned: false };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileState>(DEFAULT_PROFILE);

  // Log this browser as an active session for the user. Posts to our own
  // server route so the IP + Cloudflare-Geo headers are captured (the client
  // can't read its own IP reliably).
  const logSession = useCallback(async (accessToken: string): Promise<void> => {
    try {
      const fpHash = await computeFpHash();
      await fetch('/api/account/sessions/log', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          session_uid: getSessionUid(),
          fp_hash:     fpHash,
        }),
      });
    } catch { /* silent */ }
  }, []);

  // Call ensure-profile API → guarantees DB row exists → returns current state
  const ensureProfile = useCallback(async (accessToken: string): Promise<ProfileState> => {
    try {
      const res = await fetch('/api/auth/ensure-profile', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (!res.ok) return DEFAULT_PROFILE;
      const data = await res.json() as ProfileState & { credits: number };
      const state: ProfileState = {
        credits:         data.credits         ?? 20,
        plan:            data.plan            ?? 'none',
        plan_expires_at: data.plan_expires_at ?? null,
        is_banned:       data.is_banned       ?? false,
      };
      setProfile(state);
      return state;
    } catch {
      return DEFAULT_PROFILE;
    }
  }, []);

  // Manual refresh (call after consuming a credit or on tab focus)
  const refreshProfile = useCallback(async () => {
    const client = getAuthClient();
    const { data } = await client.auth.getSession();
    if (data.session?.access_token) await ensureProfile(data.session.access_token);
  }, [ensureProfile]);

  useEffect(() => {
    const client = getAuthClient();

    // Stale refresh tokens (left over from prior sessions, key rotation, or our
    // own signOut path) cause Supabase to log "Invalid Refresh Token: Refresh
    // Token Not Found" before emitting SIGNED_OUT. Catch it and wipe local
    // storage without a network round-trip so the next load is clean.
    const isRefreshTokenError = (err: unknown): boolean => {
      const msg = (err as { message?: string } | null)?.message?.toLowerCase() ?? '';
      return msg.includes('refresh token') || msg.includes('refresh_token');
    };

    client.auth.getSession()
      .then(({ data, error }) => {
        if (error && isRefreshTokenError(error)) {
          // Stale token — silently clear local storage, no server call.
          client.auth.signOut({ scope: 'local' }).catch(() => {});
          setSession(null);
          setUser(null);
          setProfile(DEFAULT_PROFILE);
          initIris().catch(() => {});
          setLoading(false);
          return;
        }

        setSession(data.session);
        setUser(data.session?.user ?? null);

        if (data.session?.user) {
          markRegistered();
          ensureProfile(data.session.access_token).catch(() => {});
          logSession(data.session.access_token);   // populate /account/devices even when no fresh sign-in
          logIrisEvent('login', { source: 'session_restore' }).catch(() => {});
        } else {
          setProfile(DEFAULT_PROFILE);
          initIris().catch(() => {});
        }
        setLoading(false);
      })
      .catch((err) => {
        if (isRefreshTokenError(err)) {
          client.auth.signOut({ scope: 'local' }).catch(() => {});
        }
        setSession(null);
        setUser(null);
        setProfile(DEFAULT_PROFILE);
        setLoading(false);
      });

    const { data: { subscription } } = client.auth.onAuthStateChange(async (event, s) => {
      // SIGNED_IN: run our auth-aware RPCs SEQUENTIALLY, not in parallel.
      // The Supabase JS client uses navigator.locks for getSession() under
      // every rpc(); two RPCs in flight cause "lock stolen" rejections that
      // cascade into unrelated calls (e.g. ir_decrement_credit for contact
      // unlocks) silently failing.
      if (event === 'SIGNED_IN' && s?.user) {
        try {
          const fpHash = await computeFpHash();

          // 1. Device-bind enforcement (may sign the user out).
          const { data: bindData } = await client.rpc('ir_check_device_binding', { p_fp_hash: fpHash });
          const bind = (bindData ?? {}) as { blocked?: boolean; reason?: string; primary_user_id?: string };
          if (bind.blocked) {
            await client.auth.signOut();
            setTimeout(() => {
              if (typeof window !== 'undefined') {
                window.alert(
                  'This device is already linked to another account. Only one Gmail per device is allowed. ' +
                  'If this is a mistake, contact support.'
                );
              }
            }, 100);
            return;
          }

          // (Session log moved to the POST below — it goes through our server
          // route which captures IP + Cloudflare geo headers.)
          void fpHash;
        } catch {
          // Network or RPC failure → don't lock the user out; the rest of the
          // handler still runs so they get a session + UI.
        }
      }

      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        markRegistered();
        // All three POSTs below hit our own API routes (not Supabase JS rpc),
        // so they don't contend for the auth lock.
        ensureProfile(s.access_token).catch(() => {});
        logSession(s.access_token);   // upsert ir_user_sessions with IP + geo
        logIrisEvent('login', {
          email:    s.user.email,
          provider: s.user.app_metadata?.provider,
          event,
        }).catch(() => {});
      } else if (event === 'SIGNED_OUT') {
        setProfile(DEFAULT_PROFILE);
        logIrisEvent('signout').catch(() => {});
      }
    });

    return () => subscription.unsubscribe();
  }, [ensureProfile, logSession]);

  // Session heartbeat: refresh last_seen_at when this tab regains focus,
  // throttled so it can't fire more than once every 5 minutes. Without the
  // throttle, rapid tab switching causes back-to-back ir_log_session RPCs
  // that steal the auth lock from concurrent contact-unlock RPCs.
  useEffect(() => {
    if (!user) return;
    const client = getAuthClient();
    let lastBeatAt = 0;
    const HEARTBEAT_MS = 5 * 60 * 1000;

    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastBeatAt < HEARTBEAT_MS) return;
      lastBeatAt = now;
      try {
        const { data } = await client.auth.getSession();
        if (data.session?.access_token) await logSession(data.session.access_token);
      } catch { /* silent */ }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, logSession]);

  // Supabase Realtime: subscribe to ir_user_profiles changes for this user
  // Fires instantly when admin edits credits/plan — no polling needed
  useEffect(() => {
    if (!user) return;

    const client = getAuthClient();
    const channel = client
      .channel(`profile:${user.id}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'ir_user_profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as Partial<ProfileState & { contact_credits: number }>;
          setProfile(prev => ({
            credits:         row.contact_credits   ?? prev.credits,
            plan:            row.plan              ?? prev.plan,
            plan_expires_at: row.plan_expires_at   ?? prev.plan_expires_at,
            is_banned:       row.is_banned         ?? prev.is_banned,
          }));
        },
      )
      .subscribe();

    return () => { client.removeChannel(channel); };
  }, [user]);

  const signInWithGoogleOneTap = useCallback(async (credential: string, nonce?: string): Promise<{ error?: string }> => {
    const client = getAuthClient();
    const { error } = await client.auth.signInWithIdToken({ provider: 'google', token: credential, nonce });
    return error ? { error: error.message } : {};
  }, []);

  // Reliable fallback when GIS is blocked (Brave, Safari ITP, ad-blockers, CSP, slow network).
  // Uses Supabase's OAuth redirect flow → returns to /auth/callback → exchanges code for session.
  const signInWithGoogleRedirect = useCallback(async (redirectTo?: string): Promise<{ error?: string }> => {
    const client = getAuthClient();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const next   = redirectTo ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { access_type: 'offline', prompt: 'select_account' },
      },
    });
    return error ? { error: error.message } : {};
  }, []);

  const signInWithEmail = useCallback(async (email: string, redirectTo = '/'): Promise<{ error?: string }> => {
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirectTo }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) return { error: json.error ?? 'Failed to send link' };
      return {};
    } catch {
      return { error: 'Network error. Please try again.' };
    }
  }, []);

  const signOut = useCallback(async () => {
    await getAuthClient().auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{
      user, session, loading, profile, refreshProfile,
      signInWithGoogleOneTap, signInWithGoogleRedirect, signInWithEmail, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
