'use client';
/**
 * Interest state for the profiles grid and /account.
 *
 * Keyed on the upstream feed id (Profile.id), which is unique and stable —
 * unlike `_num`, which is only the position in the filtered array. The sha256
 * content hash used before 007 is gone: an integer id also survives the
 * advertiser editing their profile text, which a hash does not.
 */
import { useState, useEffect, useCallback } from 'react';

export type InterestStatus =
  | 'new' | 'seen' | 'forwarded' | 'rejected' | 'accepted' | 'declined' | 'connected';

export interface MyInterest {
  id:             string;
  profile_id:     number | null;
  profile_num:    number | null;
  profile_title:  string | null;
  profile_gender: string | null;
  chip:           string | null;
  status:         InterestStatus;
  revealed_at:    string | null;
  revealed_phone: string | null;
  created_at:     string;
}

export interface InterestState {
  usedMonth: number;
  monthly:   number;
  ready:     boolean;
  interests: MyInterest[];
  /** Accepted but not yet revealed — the ones worth chasing. */
  pendingReveals: MyInterest[];
  statusFor: (profileId: number | undefined) => InterestStatus | null;
  markSent:  (profileId: number | undefined, usedMonth: number) => void;
  refresh:   () => void;
}

export function useInterests(enabled: boolean): InterestState {
  const [usedMonth, setUsedMonth] = useState(0);
  const [monthly, setMonthly]     = useState(0);
  const [ready, setReady]         = useState(false);
  const [interests, setInterests] = useState<MyInterest[]>([]);

  const refresh = useCallback(() => {
    if (!enabled) return;
    fetch('/api/interests')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d) {
          setUsedMonth(d.usedMonth ?? 0);
          setMonthly(d.monthly ?? 0);
          setInterests(d.interests ?? []);
        }
        setReady(true);
      })
      .catch(() => setReady(true));
  }, [enabled]);

  useEffect(() => { refresh(); }, [refresh]);

  const statusFor = useCallback((profileId: number | undefined): InterestStatus | null => {
    if (profileId == null) return null;
    return interests.find(i => i.profile_id === profileId)?.status ?? null;
  }, [interests]);

  // Optimistic: show the card as sent immediately, then reconcile from the server.
  const markSent = useCallback((profileId: number | undefined, used: number) => {
    setUsedMonth(used);
    if (profileId != null) {
      setInterests(prev => prev.some(i => i.profile_id === profileId) ? prev : [
        {
          id: `pending-${profileId}`, profile_id: profileId, profile_num: null,
          profile_title: null, profile_gender: null, chip: null,
          status: 'new' as const, revealed_at: null, revealed_phone: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
    refresh();
  }, [refresh]);

  const pendingReveals = interests.filter(i => i.status === 'accepted' && !i.revealed_at);

  return { usedMonth, monthly, ready, interests, pendingReveals, statusFor, markSent, refresh };
}
