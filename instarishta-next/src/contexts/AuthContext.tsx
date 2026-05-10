'use client';
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getAuthClient, markRegistered } from '@/lib/auth-client';
import { logIrisEvent, initIris } from '@/lib/iris';

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

    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);

      if (data.session?.user) {
        markRegistered();
        ensureProfile(data.session.access_token).catch(() => {});
        logIrisEvent('login', { source: 'session_restore' }).catch(() => {});
      } else {
        setProfile(DEFAULT_PROFILE);
        initIris().catch(() => {});
      }
      setLoading(false);
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        markRegistered();
        ensureProfile(s.access_token).catch(() => {});
        const irisEvent = event === 'SIGNED_IN' ? 'login' : 'login';
        logIrisEvent(irisEvent, {
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
  }, [ensureProfile]);

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
