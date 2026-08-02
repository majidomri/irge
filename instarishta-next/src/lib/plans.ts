/**
 * Plan catalog — the single source of truth for pricing.
 *
 * Before this file the same product was priced in three places that disagreed:
 * /pricing sold ₹499–₹11,000 packages, PaymentModal sold ₹99–₹349 packs, and
 * payment-notify had a third copy. Every surface now imports from here.
 *
 * Mirrors ir_activate_plan() in supabase/migrations/005_subscription_plans.sql —
 * `months` and `monthlyCredits` MUST match the CASE arms in that function, which
 * is what actually funds an account. Change both together.
 */

export type PlanId = 'ir6' | 'ir12';

/** Plans no longer sold. Existing holders are grandfathered until expiry. */
export const LEGACY_PLAN_IDS = ['silver', 'gold', 'diamond', 'platinum'] as const;

/** Welcome credits for a new free account. One time — never resets. */
export const FREE_CREDITS = 10;

/**
 * Interests — a private "we're interested" signal that costs no contact credit.
 *
 * Metered on a ROLLING 30-DAY window (see migration 006), not the cycle/reset
 * machinery used for contact credits: no anchor bookkeeping and no
 * month-boundary cliff. The daily cap is anti-spray and is deliberately NOT
 * advertised on /pricing — it lives here and in the T&C as fair use, exactly
 * like the 30/hour audio rule.
 */
export const FREE_INTERESTS       = 5;
export const FREE_INTERESTS_DAILY = 3;

export interface Plan {
  id:              PlanId;
  name:            string;
  badge:           string;
  months:          number;
  price:           number;   // ₹, inclusive of GST
  monthlyCredits:  number;   // contact credits granted at the start of each cycle
  monthlyInterests: number;  // rolling 30-day interest allowance
  dailyInterests:  number;   // unadvertised fair-use burst cap
  popular:         boolean;
  features:        string[];
}

export const PLANS: readonly Plan[] = [
  {
    id:               'ir6',
    name:             'Rishta 6',
    badge:            'Starter',
    months:           6,
    price:            2199,
    monthlyCredits:   30,
    monthlyInterests: 40,
    dailyInterests:   6,
    popular:          false,
    features: [
      '30 contact unlocks every month',
      'Credits refill on your date each month',
      '40 interests a month',
      'Verified profile badge',
      'Unlimited profile views',
      'Unlimited audio biodata',
      'WhatsApp support',
    ],
  },
  {
    id:               'ir12',
    name:             'Rishta 12',
    badge:            'Best Value',
    months:           12,
    price:            4499,
    monthlyCredits:   40,
    monthlyInterests: 60,
    dailyInterests:   8,
    popular:          true,
    features: [
      '40 contact unlocks every month',
      '480 unlocks across the year',
      '60 interests a month',
      'Verified badge + priority listing',
      'Unlimited profile views',
      'Unlimited audio biodata',
      'Priority WhatsApp support',
    ],
  },
] as const;

/** Persistent credits for subscribers who burn a month early. */
export const TOPUP = { id: 'topup25', name: 'Top-up 25', credits: 25, price: 349 } as const;

export function getPlan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

/** Total credits over the full term — the number worth advertising. */
export function totalCredits(p: Plan): number {
  return p.monthlyCredits * p.months;
}

/**
 * Cost per contact credit. This is the axis on which Rishta 12 beats Rishta 6
 * (₹9.37 vs ₹12.22) — unlike cost-per-month, where the 6-month plan is cheaper
 * (₹366 vs ₹375). Show per-credit and total credits on the cards; do NOT show
 * an effective-monthly figure, it argues against the annual plan.
 */
export function pricePerCredit(p: Plan): number {
  return p.price / totalCredits(p);
}

/**
 * Interest allowance for a plan id. Free (and grandfathered legacy) accounts
 * fall back to the free tier — legacy plans were sold before interests existed,
 * so they carry no interest entitlement.
 */
export function interestAllowance(planId: string | null | undefined): { monthly: number; daily: number } {
  const plan = planId ? getPlan(planId) : undefined;
  return plan
    ? { monthly: plan.monthlyInterests, daily: plan.dailyInterests }
    : { monthly: FREE_INTERESTS, daily: FREE_INTERESTS_DAILY };
}

/** "Rishta 12" for a live plan id, "Free account" otherwise. */
export function planLabel(id: string | null | undefined): string {
  const plan = id ? getPlan(id) : undefined;
  if (plan) return plan.name;
  if (id && (LEGACY_PLAN_IDS as readonly string[]).includes(id)) {
    return id.charAt(0).toUpperCase() + id.slice(1);   // grandfathered tier
  }
  return 'Free account';
}

// ── Entitlements ─────────────────────────────────────────────────────────────
/**
 * THE map from a plan id to everything it grants. One definition, consumed by
 * /pricing, /account, /nizam, and the server-side limiters — so a number can
 * never again be advertised in one place and enforced differently in another.
 *
 * `-1` means unlimited.
 *
 * `enforcement` is deliberately explicit:
 *   'code'   — the server actually blocks on this
 *   'manual' — an operational promise the team keeps by hand; NOTHING in the
 *              codebase enforces it. Profiles come from an external feed with
 *              no badge or ranking field, so verified badges and priority
 *              listing cannot be enforced in software today. Marked so nobody
 *              mistakes marketing copy for a working gate.
 */
export interface Entitlements {
  planId:            string;
  name:              string;
  price:             number;   // ₹ (0 = free tier)
  termMonths:        number;   // 0 = not a term plan
  /** Contact credits granted at each monthly refill. 0 for free/legacy. */
  contactPerCycle:   number;
  /** One-time welcome credits. Free tier only. */
  welcomeCredits:    number;
  refillsMonthly:    boolean;
  interestsPerMonth: number;
  interestsPerDay:   number;   // fair-use burst cap, unadvertised
  audioPerDay:       number;   // -1 unlimited
  profileViews:      number;   // -1 unlimited
  support:           string;
  verifiedBadge:     boolean;  // manual
  priorityListing:   boolean;  // manual
}

/** Audio plays per day for a free account — tight enough to actually be felt. */
export const FREE_AUDIO_PER_DAY = 10;

export const FREE_ENTITLEMENTS: Entitlements = {
  planId:            'none',
  name:              'Free account',
  price:             0,
  termMonths:        0,
  contactPerCycle:   0,
  welcomeCredits:    FREE_CREDITS,
  refillsMonthly:    false,
  interestsPerMonth: FREE_INTERESTS,
  interestsPerDay:   FREE_INTERESTS_DAILY,
  audioPerDay:       FREE_AUDIO_PER_DAY,
  profileViews:      -1,
  support:           'Email',
  verifiedBadge:     false,
  priorityListing:   false,
};

/**
 * Entitlements for any plan id, including 'none' and grandfathered legacy tiers.
 *
 * Legacy holders resolve to the FREE entitlements plus whatever credit balance
 * they still hold: those plans were sold before interests existed and they get
 * no monthly refill (migration 005 §7 zeroes monthly_credits for them).
 */
export function entitlementsFor(planId: string | null | undefined): Entitlements {
  const plan = planId ? getPlan(planId) : undefined;
  if (!plan) {
    if (planId && (LEGACY_PLAN_IDS as readonly string[]).includes(planId)) {
      return { ...FREE_ENTITLEMENTS, planId, name: planLabel(planId) };
    }
    return FREE_ENTITLEMENTS;
  }
  return {
    planId:            plan.id,
    name:              plan.name,
    price:             plan.price,
    termMonths:        plan.months,
    contactPerCycle:   plan.monthlyCredits,
    welcomeCredits:    0,
    refillsMonthly:    true,
    interestsPerMonth: plan.monthlyInterests,
    interestsPerDay:   plan.dailyInterests,
    audioPerDay:       -1,
    profileViews:      -1,
    support:           plan.id === 'ir12' ? 'Priority WhatsApp' : 'WhatsApp',
    verifiedBadge:     true,
    priorityListing:   plan.id === 'ir12',
  };
}

/** "40 / month", "Unlimited", "—" — one formatter so every surface agrees. */
export function fmtAllowance(n: number, suffix = ''): string {
  if (n < 0) return 'Unlimited';
  if (n === 0) return '—';
  return suffix ? `${n} ${suffix}` : String(n);
}
