/**
 * Checkout order model — shared by the API routes, the /pay page and the modal.
 *
 * Companion to supabase/migrations/008_orders.sql. Read the header comment there
 * first: it explains why an order's amount carries a unique paise suffix and why
 * credits are granted before a human has confirmed anything.
 *
 * Nothing here decides what a user is charged. Prices live in plans.ts for
 * display and in ir_order_price() for the actual charge; the functions below
 * only format and link to an amount the database has already fixed.
 */
import { getPlan, TOPUP, totalCredits } from '@/lib/plans';

/** The VPA money is collected into. A personal PhonePe handle — see 008 §0. */
export const UPI_VPA  = '918886667121@ybl';
export const UPI_NAME = 'InstaRishta';

/** Everything sellable through checkout: the two terms plus the top-up. */
export type OrderPlanId = 'ir6' | 'ir12' | 'topup25';

export const ORDER_PLAN_IDS: readonly OrderPlanId[] = ['ir6', 'ir12', 'topup25'];

export function isOrderPlanId(v: unknown): v is OrderPlanId {
  return typeof v === 'string' && (ORDER_PLAN_IDS as readonly string[]).includes(v);
}

export type OrderStatus =
  | 'created'               // amount reserved, waiting for the user to pay
  | 'pending_verification'  // user says they paid; credits ALREADY granted
  | 'confirmed'             // a human matched it against the ledger
  | 'rejected'              // no money found — grant revoked
  | 'expired';              // never claimed, amount released

export interface Order {
  id:           string;
  email:        string;
  plan_id:      OrderPlanId;
  amount_paise: number;
  status:       OrderStatus;
  utr:          string | null;
  granted_at:   string | null;
  resolved_at:  string | null;
  resolved_by:  string | null;
  note:         string | null;
  created_at:   string;
  expires_at:   string;
}

/** Columns safe to hand back to the buyer — prev_state stays server-side. */
export const ORDER_COLS =
  'id, email, plan_id, amount_paise, status, utr, granted_at, resolved_at, resolved_by, note, created_at, expires_at';

/** Terminal states: the order will never move again. */
export function isSettled(s: OrderStatus): boolean {
  return s === 'confirmed' || s === 'rejected' || s === 'expired';
}

// ── Money ────────────────────────────────────────────────────────────────────

/**
 * "2,199.37" — Indian digit grouping, always two decimals.
 *
 * The paise are never rounded away for display: they are the whole point, and a
 * user who pays ₹2,199 instead of ₹2,199.37 cannot be reconciled.
 */
export function formatAmount(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const pp     = String(paise % 100).padStart(2, '0');
  return `${rupees.toLocaleString('en-IN')}.${pp}`;
}

/** "2199.37" — the plain form the UPI spec's `am` parameter expects. */
export function amountParam(paise: number): string {
  return (paise / 100).toFixed(2);
}

/** The paise suffix on its own, for UI that calls attention to it. */
export function paiseSuffix(paise: number): string {
  return String(paise % 100).padStart(2, '0');
}

// ── Product copy ─────────────────────────────────────────────────────────────

export interface OrderDescription {
  label:  string;
  detail: string;
}

/** What the buyer is getting, from the same catalog every other surface uses. */
export function describeOrder(planId: string): OrderDescription {
  const plan = getPlan(planId);
  if (plan) {
    return {
      label:  plan.name,
      detail: `${plan.monthlyCredits} credits/month · ${plan.months} months · ${totalCredits(plan)} total`,
    };
  }
  if (planId === TOPUP.id) {
    return { label: TOPUP.name, detail: `${TOPUP.credits} one-time credits · never expire` };
  }
  return { label: planId || 'Unknown', detail: 'Unrecognised item — verify before confirming' };
}

// ── UPI deep links ───────────────────────────────────────────────────────────

/**
 * The UPI apps worth offering as direct buttons.
 *
 * `scheme: null` is the generic `upi://` link, which on Android raises the
 * system app chooser. The named schemes skip the chooser and land the user
 * inside one specific app — worth it because most people know which app they
 * use, and a chooser is one more screen to get lost on.
 *
 * iOS has no `upi://` handler at all, so the generic entry is useless there and
 * only the named schemes work. The checkout page shows the QR as the primary
 * path for exactly that reason.
 */
export const UPI_APPS = [
  { id: 'phonepe', name: 'PhonePe',    scheme: 'phonepe://pay',  brand: '#5F259F' },
  { id: 'gpay',    name: 'Google Pay', scheme: 'tez://upi/pay',  brand: '#1A73E8' },
  { id: 'paytm',   name: 'Paytm',      scheme: 'paytmmp://pay',  brand: '#00BAF2' },
  { id: 'any',     name: 'Other UPI app', scheme: null,          brand: '#1E3932' },
] as const;

export type UpiAppId = (typeof UPI_APPS)[number]['id'];

/**
 * Build the deep link for an order.
 *
 * `tr` (transaction reference) carries the order id. Personal-VPA payments are
 * P2P, and most PSP apps drop `tr` on a P2P transfer — it is set because it
 * costs nothing and helps on the apps that do keep it, NOT because anything
 * downstream depends on it. Reconciliation is by amount. See 008 §0.
 */
export function upiLink(
  order: Pick<Order, 'id' | 'amount_paise' | 'plan_id'>,
  app: UpiAppId = 'any',
): string {
  const entry  = UPI_APPS.find(a => a.id === app) ?? UPI_APPS[UPI_APPS.length - 1];
  const base   = entry.scheme ?? 'upi://pay';
  const params = new URLSearchParams({
    pa: UPI_VPA,
    pn: UPI_NAME,
    am: amountParam(order.amount_paise),
    cu: 'INR',
    tn: `InstaRishta ${describeOrder(order.plan_id).label}`,
    tr: order.id,
  });
  return `${base}?${params.toString()}`;
}

/** The string encoded into the QR. Always the generic form — QRs are app-agnostic. */
export function upiQrPayload(order: Pick<Order, 'id' | 'amount_paise' | 'plan_id'>): string {
  return upiLink(order, 'any');
}

// ── Timing ───────────────────────────────────────────────────────────────────

/** Whole seconds until the reserved amount is released. 0 once past. */
export function secondsLeft(expiresAt: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
}

/** "9:04" — mm:ss for the checkout countdown. */
export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
