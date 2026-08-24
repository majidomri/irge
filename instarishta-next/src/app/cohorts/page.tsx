import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getProfession, loadProfessions } from '@/lib/professions';

export const metadata: Metadata = {
  title: 'The Circles — InstaRishta',
  description:
    'InstaRishta is invitation-only by profession. Every member in these circles has had their credential checked by a person.',
};

// The counts move only when an admin approves someone, so a short revalidate
// is plenty — and it keeps the published number honest without rendering this
// page per request.
export const revalidate = 300;

interface Cohort {
  slug: string;
  name: string;
  description: string | null;
  profession_key: string | null;
  member_count: number;
}

async function loadCohorts() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data } = await db
    .from('ir_channels')
    .select('slug, name, description, profession_key, member_count')
    .eq('is_cohort', true)
    .order('member_count', { ascending: false });

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count: admitted } = await db
    .from('ir_verification_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .gte('reviewed_at', monthStart.toISOString());

  return {
    cohorts: (data ?? []) as Cohort[],
    admittedThisMonth: admitted ?? 0,
    professions: await loadProfessions(db),
  };
}

/**
 * The circles, with their real member counts.
 *
 * Publishing the numbers is the point, and publishing them *small* is not a
 * problem — "38 verified doctors" reads as a gate that is actually being
 * enforced, where "10,000+ members" reads like every other matrimony site.
 * The figures come straight from the reconciled counter (migration 016), so
 * what is on screen is what is in the database. No rounding, no "+".
 */
export default async function CohortsPage() {
  const { cohorts, admittedThisMonth, professions } = await loadCohorts();
  const total = cohorts.reduce((sum, c) => sum + (c.member_count ?? 0), 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-extrabold text-white">The Circles</h1>
      <p className="mt-2 text-sm leading-relaxed text-white/60">
        InstaRishta admits by profession. Every member below submitted a credential —
        a council registration, a membership number, a degree — and a person checked it.
        Not every application is accepted.
      </p>

      {/* Scarcity, stated plainly */}
      <div className="mt-6 flex flex-wrap gap-3">
        <div className="rounded-2xl px-4 py-3"
          style={{ background: 'rgba(0,168,107,0.10)', border: '1px solid rgba(0,168,107,0.25)' }}>
          <p className="text-2xl font-extrabold" style={{ color: '#00A86B' }}>{total}</p>
          <p className="text-[11px] uppercase tracking-wide text-white/50">Verified members</p>
        </div>
        <div className="rounded-2xl px-4 py-3"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-2xl font-extrabold text-white">{admittedThisMonth}</p>
          <p className="text-[11px] uppercase tracking-wide text-white/50">Admitted this month</p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {cohorts.map(c => {
          const profession = getProfession(professions, c.profession_key);
          return (
            <Link
              key={c.slug}
              href={`/channels/${c.slug}`}
              className="flex items-center gap-4 rounded-2xl px-4 py-4 no-underline transition-colors hover:bg-white/[0.07]"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <span className="text-2xl" aria-hidden>{profession?.icon ?? '✅'}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-white">{c.name}</span>
                {c.description && (
                  <span className="block truncate text-xs text-white/50">{c.description}</span>
                )}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-lg font-extrabold" style={{ color: '#00A86B' }}>
                  {c.member_count}
                </span>
                <span className="block text-[10px] uppercase tracking-wide text-white/40">
                  verified
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-white/40">
        {/* Listed from the live vocabulary — hardcoding it here would go stale
            the moment an admin adds a profession in /nizam. */}
        {`Are you ${professions.filter(p => p.active).map(p => p.label).join(', ')}?`}{' '}
        <Link href="/account" className="underline" style={{ color: '#00A86B' }}>
          Apply to be verified
        </Link>
        .
      </p>
    </main>
  );
}
