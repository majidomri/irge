'use client';

/**
 * /account/stats — a member's own numbers.
 *
 * The honest scope is set by the data, and it is worth saying plainly because
 * the obvious expectation is different: the profile catalogue is an external
 * read-only feed with no account reference on any record, so "how many people
 * viewed my profile" is not a number this platform holds. What it does hold is
 * what the member has done — interests, unlocked contacts, credits, listens,
 * comments, what they paid — and, when an admin has attributed a post or story
 * to their account, the engagement on that.
 *
 * Live in the same way /account is: useLiveRefresh re-reads on focus and on a
 * visible-tab interval. Realtime push would need the better-auth→Supabase
 * bridge (docs/AUTH_SETUP.md); until then this is the same freshness the rest
 * of the signed-in surface has, rather than a different and worse one.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import GradientText from '@/components/ui/GradientText';
import { useSession } from '@/lib/auth-client';
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh';
import { planLabel } from '@/lib/plans';

const GREEN = '#00A86B';
const PANEL = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' };

type Interest = {
  id: string;
  status: string;
  chip: string | null;
  profile_num: number | null;
  profile_title: string | null;
  revealed_at: string | null;
  responded_at: string | null;
  created_at: string;
};

type Stats = {
  days: number;
  member: {
    email: string; name: string | null; joined: string | null; plan: string;
    planExpiresAt: string | null; creditsResetAt: string | null;
    profession: string | null; professionVerified: boolean;
  };
  credits: { cycle: number; bonus: number; monthly: number; total: number };
  activity: {
    interestsSent: number;
    interestsByStatus: Record<string, number>;
    contactsUnlocked: number;
    repliesReceived: number;
    commentsPosted: number;
    storiesWatched: number;
    notifications: { total: number; unread: number };
    usageByFeature: Record<string, number>;
  };
  spend: { ordersTotal: number; paidPaise: number; lastPaymentAt: string | null };
  content: null | {
    posts: number; stories: number; views: number; likes: number;
    commentsReceived: number; storyViews: number;
  };
  recentInterests: Interest[];
  series: { date: string; interests: number; comments: number; activity: number }[];
  failed: string[];
};

const when = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function Stat({ icon, label, value, note }: {
  icon: string; label: string; value: number | string; note?: string;
}) {
  return (
    <div className="rounded-2xl p-4" style={PANEL}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-base">{icon}</span>
        <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
      </div>
      <p className="text-2xl font-bold text-white leading-none">{value}</p>
      {note && <p className="text-[11px] mt-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{note}</p>}
    </div>
  );
}

/**
 * A 30-day bar strip. Deliberately CSS rather than a chart library — the whole
 * shape is "one bar per day, relative to the busiest day", and importing a
 * charting runtime onto a signed-in page to draw thirty divs would cost more
 * than the feature.
 */
function Sparks({ series }: { series: Stats['series'] }) {
  const peak = Math.max(1, ...series.map((d) => d.interests + d.comments + d.activity));
  return (
    <div className="rounded-2xl p-4 mb-4" style={PANEL}>
      <p className="text-[11px] font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
        LAST 30 DAYS
      </p>
      <div className="flex items-end gap-[3px] h-16">
        {series.map((d) => {
          const total = d.interests + d.comments + d.activity;
          return (
            <div key={d.date} className="flex-1 rounded-sm transition-all"
              title={`${d.date} — ${total} action${total === 1 ? '' : 's'}`}
              style={{
                height: `${Math.max(3, (total / peak) * 100)}%`,
                background: total === 0 ? 'rgba(255,255,255,0.07)' : GREEN,
                opacity: total === 0 ? 1 : 0.55 + 0.45 * (total / peak),
              }} />
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
        <span>{series[0]?.date.slice(5)}</span>
        <span>today</span>
      </div>
    </div>
  );
}

export default function StatsPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  /**
   * Fetches without touching state, so the caller decides whether the answer
   * is still wanted — a refresh that lands after the member has navigated away
   * must not write into an unmounted tree.
   */
  const fetchStats = useCallback(async (): Promise<Stats | null> => {
    try {
      const res = await fetch('/api/account/stats');
      if (!res.ok) return null;
      return (await res.json()) as Stats;
    } catch {
      return null;
    }
  }, []);

  const signedIn = !!session?.user;

  useEffect(() => {
    if (!isPending && !signedIn) { router.replace('/login?next=/account/stats'); return; }
    if (!signedIn) return;
    let cancelled = false;
    void (async () => {
      const next = await fetchStats();
      if (cancelled) return;
      if (next) setStats(next);
      else setError(true);
    })();
    return () => { cancelled = true; };
  }, [isPending, signedIn, router, fetchStats]);

  // Focus and interval refreshes, the same freshness /account has.
  const refresh = useCallback(() => {
    void (async () => {
      const next = await fetchStats();
      if (next) { setStats(next); setError(false); }
    })();
  }, [fetchStats]);

  useLiveRefresh(refresh, signedIn);

  if (isPending || (!stats && !error)) {
    return (
      <div className="min-h-screen px-5 py-8" style={{ background: '#0a1a14' }}>
        <div className="max-w-md mx-auto">
          <div className="h-8 w-40 rounded-lg mb-6 animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[92px] rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen px-5 py-8" style={{ background: '#0a1a14' }}>
        <div className="max-w-md mx-auto">
          <p className="text-sm text-white mb-4">Could not load your stats just now.</p>
          <button onClick={refresh} className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={{ background: GREEN, color: '#fff' }}>Try again</button>
        </div>
      </div>
    );
  }

  const { activity: a, credits: c, content, member } = stats;
  const rupees = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN');
  const listens = a.usageByFeature.audio ?? 0;
  const views = a.usageByFeature.view ?? 0;

  return (
    <div className="min-h-screen px-5 py-8" style={{ background: '#0a1a14' }}>
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">
            <GradientText colors={['#00C87A', '#ffffff', '#00A86B', '#ffffff']} animationSpeed={5}>
              Your activity
            </GradientText>
          </h1>
          <Link href="/account" className="text-xs px-3 py-1.5 rounded-full no-underline"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
            ← Account
          </Link>
        </div>

        {stats.failed.length > 0 && (
          <div className="rounded-2xl p-3 mb-4" style={{ background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)' }}>
            <p className="text-[11px]" style={{ color: '#FF9B9B' }}>
              Some sections could not be loaded ({stats.failed.join(', ')}). Those numbers are
              missing, not zero.
            </p>
          </div>
        )}

        <Sparks series={stats.series} />

        <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Your search
        </p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Stat icon="💚" label="INTERESTS SENT" value={a.interestsSent}
            note={a.repliesReceived > 0 ? `${a.repliesReceived} replied` : 'No replies yet'} />
          <Stat icon="🔓" label="CONTACTS UNLOCKED" value={a.contactsUnlocked}
            note={`${c.total} credit${c.total === 1 ? '' : 's'} left`} />
          <Stat icon="🎧" label="VOICE NOTES HEARD" value={listens} />
          <Stat icon="👁️" label="PROFILES OPENED" value={views} />
          <Stat icon="💬" label="COMMENTS POSTED" value={a.commentsPosted} />
          <Stat icon="⭕" label="STORIES WATCHED" value={a.storiesWatched} />
        </div>

        <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Your plan
        </p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Stat icon="✨" label="PLAN" value={planLabel(member.plan)}
            note={member.planExpiresAt ? `until ${when(member.planExpiresAt)}` : 'no active term'} />
          <Stat icon="🎟️" label="CREDITS" value={c.total}
            note={c.bonus > 0 ? `${c.cycle} cycle + ${c.bonus} bonus` : undefined} />
          <Stat icon="💳" label="PAID SO FAR" value={rupees(stats.spend.paidPaise)}
            note={`${stats.spend.ordersTotal} order${stats.spend.ordersTotal === 1 ? '' : 's'}`} />
          <Stat icon="📅" label="MEMBER SINCE" value={when(member.joined)} />
        </div>

        {content && (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Your posts
            </p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <Stat icon="📝" label="POSTS" value={content.posts} />
              <Stat icon="👀" label="VIEWS" value={content.views} />
              <Stat icon="❤️" label="LIKES" value={content.likes} />
              <Stat icon="💬" label="COMMENTS" value={content.commentsReceived} />
              {content.stories > 0 && <Stat icon="⭕" label="STORIES" value={content.stories} />}
              {content.stories > 0 && <Stat icon="👁️" label="STORY VIEWS" value={content.storyViews} />}
            </div>
          </>
        )}

        {stats.recentInterests.length > 0 && (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.08em] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Recent interests
            </p>
            <div className="rounded-2xl overflow-hidden mb-6" style={PANEL}>
              {stats.recentInterests.slice(0, 8).map((i, n) => (
                <div key={i.id} className="flex items-center justify-between px-4 py-3"
                  style={{ borderTop: n === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-white truncate">
                      {i.profile_title || `Profile #${i.profile_num ?? '—'}`}
                    </p>
                    <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {when(i.created_at)}{i.revealed_at ? ' · contact unlocked' : ''}
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full shrink-0 ml-2"
                    style={{
                      background: i.responded_at ? 'rgba(0,168,107,0.2)' : 'rgba(255,255,255,0.08)',
                      color: i.responded_at ? '#00C87A' : 'rgba(255,255,255,0.5)',
                    }}>
                    {i.responded_at ? 'replied' : i.status}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="text-[11px] text-center leading-relaxed" style={{ color: 'rgba(255,255,255,0.25)' }}>
          These are your own numbers, visible only to you. Profile listings come from our
          partner feed and do not carry view counts.
        </p>
      </div>
    </div>
  );
}
