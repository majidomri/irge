'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  anonGetUsage, anonRecordUsage, anonRemaining, resetLabel as anonResetLabel,
  dbRecordUsage, dbGetRemaining,
  USAGE_LIMITS, type UsageFeature,
} from '@/lib/auth-client';
import { useAuth } from '@/contexts/AuthContext';

interface UsageLimitState {
  canUse: boolean;
  remaining: number;
  resetLabel: string;
  isAnon: boolean;
  /** Call before each gated action. Returns false if blocked. */
  consume: () => Promise<boolean>;
  /** Refresh the remaining count from DB (auth'd users). */
  refresh: () => Promise<void>;
}

export function useUsageLimit(feature: UsageFeature): UsageLimitState {
  const { user } = useAuth();
  const isAnon = !user;
  const limit = isAnon ? USAGE_LIMITS[feature].anon : USAGE_LIMITS[feature].free;
  const unlimited = limit < 0;

  // Auth'd users start at 0 — real value loads from DB via refresh()
  const [remaining, setRemaining] = useState<number>(unlimited ? Infinity : (isAnon ? limit : 0));
  const [resetLbl,  setResetLbl]  = useState('');
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      if (isAnon) {
        setRemaining(anonRemaining(feature));
        setResetLbl(anonResetLabel(feature));
      } else if (user) {
        if (unlimited) {
          setRemaining(Infinity);
          setResetLbl('');
        } else {
          const rem = await dbGetRemaining(feature, user.id);
          setRemaining(rem);
          setResetLbl('');
        }
      }
    } finally {
      refreshing.current = false;
    }
  }, [feature, isAnon, user, unlimited]);

  // Initial load + poll every 15s
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  const consume = useCallback(async (): Promise<boolean> => {
    if (unlimited) return true;
    if (remaining <= 0) return false;

    if (isAnon) {
      anonRecordUsage(feature);
      setRemaining(r => Math.max(0, r - 1));
      setResetLbl(anonResetLabel(feature));
    } else if (user) {
      await dbRecordUsage(feature, user.id);
      setRemaining(r => Math.max(0, r - 1));
    }
    return true;
  }, [feature, isAnon, user, unlimited, remaining]);

  return {
    canUse: unlimited || remaining > 0,
    remaining: unlimited ? 9999 : remaining,
    resetLabel: resetLbl,
    isAnon,
    consume,
    refresh,
  };
}
