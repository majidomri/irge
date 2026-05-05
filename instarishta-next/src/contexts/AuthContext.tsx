'use client';
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getAuthClient } from '@/lib/auth-client';

interface AuthContextValue {
  user:    User | null;
  session: Session | null;
  loading: boolean;
  signInWithGoogleOneTap: (credential: string, nonce?: string) => Promise<{ error?: string }>;
  signInWithEmail:  (email: string, redirectTo?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = getAuthClient();
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Google One Tap — exchanges the GSI credential JWT for a Supabase session.
  // Requires Google provider enabled in Supabase Dashboard (Auth → Providers → Google).
  const signInWithGoogleOneTap = useCallback(async (credential: string, nonce?: string): Promise<{ error?: string }> => {
    const client = getAuthClient();
    const { error } = await client.auth.signInWithIdToken({
      provider: 'google',
      token: credential,
      nonce,
    });
    return error ? { error: error.message } : {};
  }, []);

  // Magic link — routes through /api/auth/magic-link which uses Resend + Supabase Admin
  // when those keys are configured, falls back to Supabase OTP otherwise.
  const signInWithEmail = useCallback(async (email: string, redirectTo = '/'): Promise<{ error?: string }> => {
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirectTo }),
      });
      const json = await res.json() as { error?: string; success?: boolean };
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
    <AuthContext.Provider value={{ user, session, loading, signInWithGoogleOneTap, signInWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
