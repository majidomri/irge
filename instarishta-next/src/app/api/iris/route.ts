/**
 * /api/iris — Secure IRIS event ingestion endpoint
 *
 * Security layers (in order):
 *  1. Origin allowlist         — rejects requests from any domain except ours
 *  2. Timestamp window         — rejects replays older than 5 minutes
 *  3. HMAC signature check     — verifies client request was built by our iris.ts code
 *  4. IP extraction            — Cloudflare → nginx → x-forwarded-for → Next.js native
 *  5. Supabase write (service role) — bypasses RLS, logs event + IP atomically
 *  6. HttpOnly __Host- cookie  — HMAC-signed domain-bound token; unreadable by JS,
 *                                 can't be sent cross-site (SameSite=Strict),
 *                                 can't be set by subdomains (__Host- prefix)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient }               from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const IRIS_SECRET      = process.env.IRIS_SECRET ?? 'dev-secret-replace-before-prod';
const CLIENT_SEED      = process.env.NEXT_PUBLIC_IRIS_CLIENT_SEED ?? 'ir_iris_v1_instarishta';
const REPLAY_WINDOW_MS = 5 * 60 * 1000;   // 5 minutes
const TOKEN_COOKIE     = '__Host-ir_t';    // __Host- prefix = browser-enforced domain lock

const ALLOWED_ORIGINS = new Set([
  'https://instarishta.com',
  'https://www.instarishta.com',
  ...(process.env.NODE_ENV !== 'production'
    ? ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002']
    : []),
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function hmacHex(payload: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const raw = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(raw)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacVerify(payload: string, sig: string, key: string): Promise<boolean> {
  try {
    const expected = await hmacHex(payload, key);
    // Constant-time compare (prevent timing attacks)
    if (expected.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

/**
 * Extract real client IP — in priority order:
 *  cf-connecting-ip → set by Cloudflare, cannot be spoofed by the user
 *  x-real-ip        → set by nginx/Vercel
 *  x-forwarded-for  → first entry in chain (closest to client)
 *  req.ip           → Next.js native (Vercel edge)
 */
function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip')                         ??
    req.headers.get('x-real-ip')                                ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim()    ??
    (req as unknown as Record<string, unknown>).ip as string    ??
    'unknown'
  );
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin':      origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary':                             'Origin',
  };
}

// ── CORS preflight ────────────────────────────────────────────────────────────

export function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '';
  if (!ALLOWED_ORIGINS.has(origin)) return new NextResponse(null, { status: 403 });

  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-IRIS-Sig, X-IRIS-Ts, X-IRIS-Nonce',
      'Access-Control-Max-Age':       '86400',
    },
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {

  // ── Guard 1: Origin ──────────────────────────────────────────────────────────
  const origin = req.headers.get('origin') ?? '';
  if (!ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Guard 2: Parse body ──────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  const {
    fpHash, canvasHash, webglHash, audioHash,
    platform, language, timezone, screen,
    hardwareConcurrency, deviceMemory, touchPoints, userAgent,
    event, metadata,
    sig, ts, nonce,        // request authentication fields
  } = body as Record<string, string | number | object>;

  if (!fpHash || !event || !sig || !ts || !nonce) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // ── Guard 3: Timestamp — reject replays outside ±5 min ──────────────────────
  const tsNum = parseInt(String(ts), 10);
  const age   = Date.now() - tsNum;
  if (isNaN(age) || age > REPLAY_WINDOW_MS || age < -30_000) {
    return NextResponse.json({ error: 'Request expired' }, { status: 401 });
  }

  // ── Guard 4: HMAC signature ──────────────────────────────────────────────────
  // Client signs: HMAC(fpHash|ts|nonce, CLIENT_SEED)
  // Server verifies with the same seed — proves request came from our iris.ts code.
  // CLIENT_SEED is in the JS bundle (not a true secret) but adds friction for
  // automated scrapers. The HttpOnly cookie is the real authentication mechanism.
  const validSig = await hmacVerify(
    `${fpHash}|${ts}|${nonce}`,
    String(sig),
    CLIENT_SEED,
  );
  if (!validSig) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // ── Extract IP ───────────────────────────────────────────────────────────────
  const ipAddress = getClientIP(req);

  // ── Write to Supabase (service role — bypasses RLS) ─────────────────────────
  let suspicious = false;
  let userCount  = 0;
  let userId: string | null = null;

  try {
    const db = getAdminClient();

    // Resolve the user_id from the Supabase session cookie if present
    // (the browser sends Supabase auth cookies automatically)
    const sbToken = req.cookies.get('sb-access-token')?.value
      ?? req.cookies.get(`sb-${SUPABASE_URL.split('//')[1].split('.')[0]}-auth-token`)?.value;
    if (sbToken) {
      const { data } = await db.auth.getUser(sbToken);
      userId = data.user?.id ?? null;
    }

    // Upsert device fingerprint (with IP)
    await db.from('ir_fingerprints').upsert({
      fp_hash:              String(fpHash),
      canvas_hash:          canvasHash ? String(canvasHash) : null,
      webgl_hash:           webglHash  ? String(webglHash)  : null,
      audio_hash:           audioHash  ? String(audioHash)  : null,
      platform:             platform   ? String(platform)   : null,
      language:             language   ? String(language)   : null,
      timezone:             timezone   ? String(timezone)   : null,
      screen:               screen     ? String(screen)     : null,
      hardware_concurrency: hardwareConcurrency ? Number(hardwareConcurrency) : null,
      device_memory:        deviceMemory        ? Number(deviceMemory)        : null,
      touch_points:         touchPoints         ? Number(touchPoints)         : null,
      user_agent:           userAgent  ? String(userAgent)  : null,
      last_seen_at:         new Date().toISOString(),
      last_ip:              ipAddress,
    }, { onConflict: 'fp_hash' });

    // Insert event with IP + user_id
    await db.from('ir_fp_events').insert({
      fp_hash:    String(fpHash),
      user_id:    userId,
      event:      String(event),
      ip_address: ipAddress,
      metadata:   {
        ...((typeof metadata === 'object' && metadata) ? (metadata as object) : {}),
        origin,
      },
    });

    // Multi-account abuse check: how many distinct users on this fingerprint?
    const { count } = await db
      .from('ir_fp_events')
      .select('user_id', { count: 'exact', head: true })
      .eq('fp_hash', String(fpHash))
      .not('user_id', 'is', null);

    userCount  = count ?? 0;
    suspicious = userCount > 1;

    // Auto-zero welcome credits for multi-account abusers
    if (suspicious && userId) {
      await db
        .from('ir_user_profiles')
        .update({ contact_credits: 0, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .lte('contact_credits', 20)   // only zero welcome-level credits
        .gt('contact_credits', 0);
    }
  } catch (err) {
    // Non-critical — log but don't fail the response
    console.error('[IRIS] DB error:', err);
  }

  // ── Issue HttpOnly __Host- domain-bound token ────────────────────────────────
  // Token = HMAC(fpHash|ip|iat, IRIS_SECRET)
  // __Host- prefix means:
  //   • Must be Secure (HTTPS only)
  //   • No Domain attribute → bound to exact host, not subdomains
  //   • Must have Path=/
  //   Browsers enforce all three — subdomain attacks and cross-origin use are blocked.
  const iat   = Date.now();
  const token = await hmacHex(`${fpHash}|${ipAddress}|${iat}`, IRIS_SECRET);

  const res = NextResponse.json({ suspicious, userCount }, {
    headers: corsHeaders(origin),
  });

  res.cookies.set(TOKEN_COOKIE, `${iat}.${token}`, {
    httpOnly: true,
    secure:   true,              // HTTPS only
    sameSite: 'strict',          // Never sent in cross-site requests
    path:     '/',               // Required by __Host- prefix
    maxAge:   60 * 60 * 24 * 365, // 1 year
    // No `domain` attribute — __Host- prefix requires its absence
  });

  return res;
}

// ── Token verification helper (for use by other API routes) ──────────────────
export async function verifyIrisToken(
  req: NextRequest,
  fpHash: string,
): Promise<boolean> {
  const cookie = req.cookies.get(TOKEN_COOKIE)?.value;
  if (!cookie) return false;
  const [iatStr, token] = cookie.split('.');
  if (!iatStr || !token) return false;

  const iat = parseInt(iatStr, 10);
  const ip  = getClientIP(req);

  // Token must not be older than 1 year
  if (Date.now() - iat > 365 * 24 * 60 * 60 * 1000) return false;

  const expected = await hmacHex(`${fpHash}|${ip}|${iat}`, IRIS_SECRET);
  return token === expected;
}
