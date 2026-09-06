/**
 * One PostgREST read, over plain fetch.
 *
 * supabase-js is 222 KB in the browser, because `createClient` builds the
 * realtime socket and the auth client whether or not you use them, and drags
 * in a Buffer polyfill on the way. Several client components import it for a
 * single anonymous `select` — no realtime, no session, no writes. That is a
 * lot of JavaScript for one GET.
 *
 * PostgREST is just HTTP, so those call sites can use this instead. It is
 * deliberately not a query builder: it takes the querystring PostgREST
 * already speaks, so there is no second dialect to keep in sync with the SDK,
 * and nothing here to drift.
 *
 * Anything that needs realtime, auth, or writes should keep using
 * supabase-js — see lib/hooks/useRealtimeProfile.ts, which genuinely
 * subscribes to postgres_changes.
 */
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * `params` are PostgREST's own: `select`, `order`, `limit`, and column
 * filters like `is_cohort: 'eq.false'`. Returns [] rather than throwing —
 * every current caller renders an empty section on failure anyway — but it
 * logs first, so an empty table and a rejected query stay distinguishable in
 * the console. FeaturedCarousel used to make that distinction itself.
 */
export async function restSelect<T>(
  table: string,
  params: Record<string, string | number>,
  init?: RequestInit,
): Promise<T[]> {
  if (!URL_BASE || !ANON) return [];

  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  );

  try {
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?${qs}`, {
      ...init,
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        Accept: 'application/json',
        ...init?.headers,
      },
    });
    if (!res.ok) {
      console.error(`[supabase-rest] ${table} query failed: ${res.status} ${res.statusText}`);
      return [];
    }
    return (await res.json()) as T[];
  } catch (err) {
    console.error(`[supabase-rest] ${table} request failed:`, err);
    return [];
  }
}
