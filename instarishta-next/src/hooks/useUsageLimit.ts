'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  anonGetUsage, anonRecordUsage, anonRemaining, resetLabel as anonResetLabel,
  dbRecordUsage, dbGetRemaining,
  USAGE_LIMITS, type UsageFeature,
} from '@/lib/auth-client';
import { useAuth } from '@/contexts/AuthContext';

interface UsageLimitState {
  canUse:     boolean;
  remaining:  number;
  resetLabel: string;
  isAnon:     boolean;
  consume:    () => Promise<boolean>;
  refresh:    () => Promise<void>;
}

export function useUsageLimit(feature: UsageFeature): UsageLimitState {
  const { user, profile, refreshProfile } = useAuth();
  const isAnon   = !user;
  const limit    = isAnon ? USAGE_LIMITS[feature].anon : USAGE_LIMITS[feature].free;
  const unlimited = limit < 0;

  // For 'contact': use credits from AuthContext (kept live via Realtime + ensure-profile)
  // For other features: poll DB rolling window
  const contextCredits = profile.credits;

  const [remaining, setRemaining] = useState<number>(() => {
    if (unlimited) return Infinity;
    if (isAnon)    return USAGE_LIMITS[feature].anon;
    if (feature === 'contact') return contextCredits;
    return 0;
  });
  const [resetLbl, setResetLbl] = useState('');
  const refreshing = useRef(false);

  // Sync 'contact' remaining directly from context (updated by Realtime)
  useEffect(() => {
    if (feature === 'contact' && !isAnon) {
      setRemaining(contextCredits);
    }
  }, [feature, isAnon, contextCredits]);

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
        } else if (feature === 'contact') {
          // Trigger a full profile re-fetch (ensure-profile → sets context → Realtime handles the rest)
          await refreshProfile();
        } else {
          const rem = await dbGetRemaining(feature, user.id);
          setRemaining(rem);
        }
      }
    } finally {
      refreshing.current = false;
    }
  }, [feature, isAnon, user, unlimited, refreshProfile]);

  // Initial load for non-contact features; contact is driven by context
  useEffect(() => {
    if (feature !== 'contact' || isAnon) {
      refresh();
      if (feature !== 'contact') {
        const id = setInterval(refresh, 15_000);
        return () => clearInterval(id);
      }
    }
  }, [feature, isAnon, refresh]);

  const consume = useCallback(async (): Promise<boolean> => {
    if (unlimited)    return true;
    if (remaining <= 0) return false;

    if (isAnon) {
      anonRecordUsage(feature);
      setRemaining(r => Math.max(0, r - 1));
      setResetLbl(anonResetLabel(feature));
    } else if (user) {
      // Optimistic update — context Realtime will confirm the server value
      setRemaining(r => Math.max(0, r - 1));
      await dbRecordUsage(feature, user.id);
    }
    return true;
  }, [feature, isAnon, user, unlimited, remaining]);

  return {
    canUse:     unlimited || remaining > 0,
    remaining:  unlimited ? 9999 : remaining,
    resetLabel: resetLbl,
    isAnon,
    consume,
    refresh,
  };
}
