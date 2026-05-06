'use client';
/**
 * IRIS — Identity, Recognition & Integrity System
 *
 * Three patterns unified:
 *  1. Supercookie fingerprinting (supercookie sample-data.txt)
 *     Canvas + WebGL + AudioContext + Font + Navigator → stable SHA-256 device hash
 *     Persisted across cookie-clears via localStorage + IndexedDB + Cache API + OPFS
 *
 *  2. Structured audit logging (logger.class.php)
 *     Timestamped, tab-delimited entries; enable/disable toggle; append-only audit trail
 *
 *  3. HMAC-signed event payloads (XmlSigner.cs)
 *     Every audit entry is signed with HMAC-SHA256 so the server can verify it was not tampered
 *
 * Use cases in InstaRishta:
 *  - Persistent device identity (survives incognito + cookie clears)
 *  - Multi-Gmail abuse detection (same device → multiple accounts → credits zeroed)
 *  - Referral tracking (ref= / utm_campaign= / r= URL params)
 *  - Admin audit log (signups, logins, contact unlocks, plan purchases)
 */

import { markRegistered, isRegistered } from './auth-client';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type IrisEvent =
  | 'anon_visit'       // page load without session
  | 'signup'           // first-ever login (new account)
  | 'login'            // subsequent login
  | 'signout'
  | 'contact_unlock'   // WhatsApp/Call tap
  | 'plan_purchase'    // plan activated by admin
  | 'referral_click'   // landed via ref= link
  | 'page_view';       // generic navigation

/** Structured log entry — mirrors logger.class.php field layout */
export interface IrisAuditEntry {
  ts:       string;          // ISO-8601
  event:    IrisEvent;
  fpHash:   string;
  userId?:  string;
  metadata?: Record<string, unknown>;
  sig:      string;          // HMAC-SHA256(ts\tevent\tfpHash\tuserId) — XmlSigner.cs pattern
}

export interface IrisSuspicion {
  suspicious: boolean;
  userCount:  number;        // distinct user IDs seen with this fingerprint
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage channel keys
// ─────────────────────────────────────────────────────────────────────────────

const LS_KEY    = 'ir_fp';
const IDB_DB    = 'ir_iris';
const IDB_STORE = 'fp';
const CACHE_NS  = 'ir-iris-v1';
const OPFS_FILE = 'ir_fp.txt';
const HMAC_SEED = 'ir_iris_v1';   // audit signing seed (not secret — integrity only)

// Client-side request signing seed (also in NEXT_PUBLIC_IRIS_CLIENT_SEED env var)
// Embedded in the JS bundle — not a real secret, but adds friction for scrapers.
// The HttpOnly __Host- cookie (issued by /api/iris) is the real authentication layer.
const CLIENT_SEED = process.env.NEXT_PUBLIC_IRIS_CLIENT_SEED ?? 'ir_iris_v1_instarishta';

// In-memory singleton — computed once per page load
let _fpHash: string | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// 1a. Canvas fingerprint — GPU + font + anti-aliasing differences
//     Technique from supercookie sample-data.txt client signals
// ─────────────────────────────────────────────────────────────────────────────

function canvasSignal(): string {
  try {
    const c = document.createElement('canvas');
    c.width = 280; c.height = 60;
    const x = c.getContext('2d')!;

    // Dark fill
    x.fillStyle = '#0a120f';
    x.fillRect(0, 0, 280, 60);

    // Mixed-script text — maximises rendering divergence across OS/GPU
    x.textBaseline = 'alphabetic';
    x.font = '14px Arial, "Noto Sans", sans-serif';
    x.fillStyle = '#00C87A';
    x.fillText('InstaRishta ❤ نکاح مبارک', 2, 20);

    x.font = '11px "Courier New", monospace';
    x.fillStyle = 'rgba(255,200,0,0.85)';
    x.fillText('0123456789 !@#$%^&*()', 4, 40);

    // Gradient bar + arc
    const g = x.createLinearGradient(0, 48, 280, 60);
    g.addColorStop(0, 'rgba(0,168,107,0.55)');
    g.addColorStop(1, 'rgba(37,99,235,0.55)');
    x.fillStyle = g;
    x.fillRect(0, 50, 280, 10);

    x.strokeStyle = 'rgba(255,255,255,0.25)';
    x.lineWidth = 1.5;
    x.beginPath();
    x.arc(30, 30, 18, 0, Math.PI * 2);
    x.stroke();

    // Return only the tail — most unique part, avoids PNG header noise
    return c.toDataURL('image/png').slice(-100);
  } catch {
    return 'canvas_err';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1b. WebGL fingerprint — GPU renderer / vendor / capabilities
// ─────────────────────────────────────────────────────────────────────────────

function webglSignal(): string {
  try {
    const c  = document.createElement('canvas');
    const gl = (c.getContext('webgl') ?? c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'no_webgl';

    const ext      = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor   = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)   : gl.getParameter(gl.VENDOR);
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const ver      = gl.getParameter(gl.VERSION);
    const glsl     = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
    const maxTex   = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxVA    = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    const maxVU    = gl.getParameter(gl.MAX_VARYING_VECTORS);

    return [vendor, renderer, ver, glsl, maxTex, maxVA, maxVU].join('§');
  } catch {
    return 'webgl_err';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1c. AudioContext DynamicsCompressor fingerprint — DSP hardware differences
//     Standard technique; DynamicsCompressor output varies per audio subsystem
// ─────────────────────────────────────────────────────────────────────────────

async function audioSignal(): Promise<string> {
  return new Promise(resolve => {
    const bail = setTimeout(() => resolve('audio_timeout'), 2500);

    try {
      const win = window as unknown as Record<string, unknown>;
      const Ctx = (win.AudioContext ?? win.webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctx) { clearTimeout(bail); return resolve('no_audio'); }

      const ctx  = new Ctx({ sampleRate: 44100 });
      const osc  = ctx.createOscillator();
      const cmp  = ctx.createDynamicsCompressor();
      const sp   = ctx.createScriptProcessor(4096, 1, 1);
      const gain = ctx.createGain();

      // DynamicsCompressor params interact differently with each browser/OS DSP engine
      cmp.threshold.setValueAtTime(-50, ctx.currentTime);
      cmp.knee.setValueAtTime(40, ctx.currentTime);
      cmp.ratio.setValueAtTime(12, ctx.currentTime);
      cmp.attack.setValueAtTime(0, ctx.currentTime);
      cmp.release.setValueAtTime(0.25, ctx.currentTime);

      gain.gain.value = 0;  // silent — we only sample the signal, not play it
      osc.type = 'triangle';
      osc.connect(cmp);
      cmp.connect(sp);
      sp.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);

      sp.onaudioprocess = (e: AudioProcessingEvent) => {
        clearTimeout(bail);
        const buf = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += Math.abs(buf[i]);

        sp.disconnect(); cmp.disconnect(); osc.disconnect(); gain.disconnect();
        try { ctx.close(); } catch { /* ignore */ }

        resolve(sum.toFixed(8));
      };
    } catch {
      clearTimeout(bail);
      resolve('audio_err');
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1d. Font detection — installed system font enumeration via canvas
// ─────────────────────────────────────────────────────────────────────────────

function fontSignal(): string {
  try {
    const PROBE = [
      'Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New',
      'Impact', 'Tahoma', 'Trebuchet MS', 'Palatino', 'Calibri',
      'Segoe UI', 'Roboto', 'Helvetica Neue', 'Noto Sans Arabic',
      'Noto Nastaliq Urdu', 'Comic Sans MS', 'Lucida Console',
    ];
    const c = document.createElement('canvas');
    const x = c.getContext('2d')!;
    const TEXT = 'mmmmmmmmmmlli';
    x.font = '72px monospace';
    const base = x.measureText(TEXT).width;
    const found: string[] = [];
    for (const font of PROBE) {
      x.font = `72px "${font}", monospace`;
      if (x.measureText(TEXT).width !== base) found.push(font);
    }
    return found.join(',') || 'none';
  } catch {
    return 'font_err';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1e. Navigator / screen / environment signals
//     Mirrors the $args['client'] collection in supercookie sample-data.txt
// ─────────────────────────────────────────────────────────────────────────────

interface EnvSignals {
  platform:  string;
  lang:      string;
  tz:        string;
  screen:    string;
  depth:     number;
  dpr:       number;
  cores:     number;
  mem:       number;
  touch:     number;
  cookieOk:  boolean;
  dnt:       string;
  vendor:    string;
  ua:        string;
  pdfViewer: boolean;
  ls:        boolean;
  idb:       boolean;
  cache:     boolean;
  opfs:      boolean;
}

function envSignals(): EnvSignals {
  const n = navigator as unknown as Record<string, unknown>;
  const s = screen;
  const lsOk = (() => { try { localStorage.setItem('_t', '1'); localStorage.removeItem('_t'); return true; } catch { return false; } })();
  return {
    platform:  (n.platform  as string)  ?? '',
    lang:      ((n.languages as string[] | undefined) ?? [(n.language as string) ?? '']).slice(0, 3).join(','),
    tz:        (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })(),
    screen:    `${s.width}x${s.height}|${s.availWidth}x${s.availHeight}`,
    depth:     s.colorDepth             ?? 0,
    dpr:       window.devicePixelRatio  ?? 1,
    cores:     (n.hardwareConcurrency as number) ?? 0,
    mem:       (n.deviceMemory      as number) ?? 0,
    touch:     (n.maxTouchPoints    as number) ?? 0,
    cookieOk:  (n.cookieEnabled     as boolean) ?? false,
    dnt:       (n.doNotTrack        as string) ?? '',
    vendor:    (n.vendor            as string) ?? '',
    ua:        (n.userAgent         as string) ?? '',
    pdfViewer: (n.pdfViewerEnabled  as boolean) ?? false,
    ls:        lsOk,
    idb:       !!window.indexedDB,
    cache:     typeof caches !== 'undefined',
    opfs:      typeof navigator !== 'undefined' && 'getDirectory' in (navigator.storage ?? {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Cryptography — Web Crypto API (XmlSigner.cs pattern adapted for browser)
//    RSA signing from the C# original → HMAC-SHA256 via SubtleCrypto here
// ─────────────────────────────────────────────────────────────────────────────

async function sha256(str: string): Promise<string> {
  const buf  = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * HMAC-SHA256 — signs the log entry payload.
 * Server can verify with the same seed to detect tampering.
 * Analogous to XmlSigner.CheckSignXml() verifying the stored signature.
 */
async function hmacSign(payload: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Supercookie — multi-channel persistence (survives clearing cookies)
//    Storage channels in order of persistence:
//      localStorage    — wiped by "clear cookies"
//      IndexedDB       — survives in Firefox/Safari "clear cookies", Chrome "last hour"
//      Cache API       — survives Firefox cookie clears + some browser extensions
//      OPFS            — Origin Private File System: Chrome 86+, most persistent
// ─────────────────────────────────────────────────────────────────────────────

const lsRead  = (): string | null => { try { return localStorage.getItem(LS_KEY); } catch { return null; } };
const lsWrite = (v: string) => { try { localStorage.setItem(LS_KEY, v); } catch { /* ignore */ } };

const idbRead = (): Promise<string | null> => new Promise(resolve => {
  try {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => {
      const r2 = req.result.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get('fp');
      r2.onsuccess = () => resolve((r2.result as string | undefined) ?? null);
      r2.onerror   = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  } catch { resolve(null); }
});

const idbWrite = (v: string): Promise<void> => new Promise(resolve => {
  try {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => {
      const tx = req.result.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(v, 'fp');
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    };
    req.onerror = () => resolve();
  } catch { resolve(); }
});

const cacheRead = async (): Promise<string | null> => {
  try {
    const cache = await caches.open(CACHE_NS);
    const res   = await cache.match('fp');
    return res ? res.text() : null;
  } catch { return null; }
};
const cacheWrite = async (v: string) => {
  try { await (await caches.open(CACHE_NS)).put('fp', new Response(v)); } catch { /* ignore */ }
};

type StorageWithOPFS = StorageManager & { getDirectory: () => Promise<FileSystemDirectoryHandle> };
type WritableFileHandle = FileSystemFileHandle & { createWritable: () => Promise<FileSystemWritableFileStream> };

const opfsRead = async (): Promise<string | null> => {
  try {
    const root = await (navigator.storage as unknown as StorageWithOPFS).getDirectory();
    const fh   = await root.getFileHandle(OPFS_FILE);
    return (await (fh as FileSystemFileHandle).getFile()).text();
  } catch { return null; }
};
const opfsWrite = async (v: string) => {
  try {
    const root = await (navigator.storage as unknown as StorageWithOPFS).getDirectory();
    const fh   = await root.getFileHandle(OPFS_FILE, { create: true });
    const w    = await (fh as WritableFileHandle).createWritable();
    await w.write(v);
    await w.close();
  } catch { /* ignore */ }
};

/** Read stored fingerprint hash — first non-null value across all four channels */
async function readPersisted(): Promise<string | null> {
  return lsRead()
    ?? await idbRead()
    ?? await cacheRead()
    ?? await opfsRead();
}

/** Write fingerprint hash to all four channels in parallel */
async function writePersisted(v: string): Promise<void> {
  lsWrite(v);
  await Promise.all([idbWrite(v), cacheWrite(v), opfsWrite(v)]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Core fingerprint computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the stable device fingerprint hash.
 * Excludes user-agent (changes with browser updates) from the stable hash.
 * UA is still logged as metadata.
 */
export async function computeFpHash(): Promise<string> {
  if (_fpHash) return _fpHash;

  const [audio] = await Promise.all([audioSignal()]);
  const env = envSignals();

  const stableStr = [
    canvasSignal(),
    webglSignal(),
    audio,
    fontSignal(),
    env.platform,
    env.screen,
    env.depth,
    env.dpr,
    env.cores,
    env.mem,
    env.tz,
    env.touch,
    env.vendor,
  ].join('|||');

  const hash = await sha256(stableStr);
  _fpHash = hash;
  await writePersisted(hash);
  return hash;
}

/** Return stored hash from any persistence channel without recomputing */
export const getStoredFpHash = (): Promise<string | null> => readPersisted();

// ─────────────────────────────────────────────────────────────────────────────
// 5. Audit log entry builder — logger.class.php pattern
//    Field separator: \t (tab), same as logger.class.php $this->separator = chr(9)
//    Each entry: timestamp \t event \t fp_hash \t user_id → signed with HMAC
// ─────────────────────────────────────────────────────────────────────────────

export async function buildAuditEntry(
  event:     IrisEvent,
  fpHash:    string,
  userId?:   string,
  metadata?: Record<string, unknown>,
): Promise<IrisAuditEntry> {
  const ts      = new Date().toISOString();
  // Tab-delimited payload mirrors logger.class.php entry format:
  // datetimeFormat . separator . msg
  const payload = [ts, event, fpHash, userId ?? ''].join('\t');
  const sig     = await hmacSign(payload, HMAC_SEED);
  return { ts, event, fpHash, userId, metadata, sig };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Referral capture
// ─────────────────────────────────────────────────────────────────────────────

export function captureReferral(): string | null {
  if (typeof window === 'undefined') return null;
  const p    = new URLSearchParams(window.location.search);
  const code = p.get('ref') ?? p.get('utm_campaign') ?? p.get('r');
  if (code) { try { localStorage.setItem('ir_ref', code); } catch { /* ignore */ } }
  return code ?? ((() => { try { return localStorage.getItem('ir_ref'); } catch { return null; } })());
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Server sync — POST to /api/iris (secure, signed, domain-bound)
//
//    Security layers applied per request:
//      a. credentials:'include'  — browser sends __Host-ir_t HttpOnly cookie
//      b. ts + nonce             — unique per request; server rejects replays > 5 min
//      c. HMAC sig               — HMAC(fpHash|ts|nonce, CLIENT_SEED); server verifies
//      d. Origin header          — browser sets automatically; server checks allowlist
//    Server responds by issuing / refreshing __Host-ir_t (HttpOnly, Secure, SameSite=Strict)
// ─────────────────────────────────────────────────────────────────────────────

export async function logIrisEvent(
  event:     IrisEvent,
  metadata?: Record<string, unknown>,
): Promise<IrisSuspicion> {
  try {
    const fpHash = await computeFpHash();
    const env    = envSignals();
    const audio  = await audioSignal();
    const entry  = await buildAuditEntry(event, fpHash, undefined, metadata);
    const ref    = captureReferral();

    // Per-request authentication fields ─────────────────────────────────────
    const ts    = Date.now().toString();
    const nonce = (typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    // Client signs: HMAC(fpHash|ts|nonce, CLIENT_SEED)
    // Server verifies the same; proves request built by our iris.ts, not a foreign script.
    const sig = await hmacSign(`${fpHash}|${ts}|${nonce}`, CLIENT_SEED);
    // ────────────────────────────────────────────────────────────────────────

    const res = await fetch('/api/iris', {
      method:      'POST',
      credentials: 'include',   // send __Host-ir_t cookie + receive refreshed token
      headers:     { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fpHash,
        canvasHash:          canvasSignal().slice(0, 120),
        webglHash:           webglSignal().slice(0, 300),
        audioHash:           audio,
        platform:            env.platform,
        language:            env.lang,
        timezone:            env.tz,
        screen:              env.screen,
        hardwareConcurrency: env.cores,
        deviceMemory:        env.mem,
        touchPoints:         env.touch,
        userAgent:           env.ua.slice(0, 300),
        event,
        metadata: {
          ...metadata,
          ...(ref ? { ref } : {}),
          auditSig: entry.sig,   // HMAC audit trail — server can verify tamper-evidence
          auditTs:  entry.ts,
        },
        sig,
        ts,
        nonce,
      }),
    });

    if (!res.ok) return { suspicious: false, userCount: 0 };

    const data    = await res.json() as { suspicious?: boolean; userCount?: number };
    const result: IrisSuspicion = {
      suspicious: data.suspicious ?? false,
      userCount:  data.userCount  ?? 0,
    };

    // If server found this device is associated with accounts → stamp flag.
    // Covers cleared-localStorage scenario where OPFS/IDB still had the FP.
    if (result.userCount > 0) markRegistered();

    return result;
  } catch {
    return { suspicious: false, userCount: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Anti-abuse: init on page load for anonymous visitors
//    Logs the visit → server checks if device has an account → marks registered
//    if so (blocking the 3 anon credits for returning users who cleared storage)
// ─────────────────────────────────────────────────────────────────────────────

export async function initIris(): Promise<void> {
  // Fire-and-forget: log the visit. The API route:
  //  • Writes FP + IP to DB
  //  • Checks if this device has existing accounts (userCount)
  //  • Issues __Host-ir_t HttpOnly cookie
  // logIrisEvent calls markRegistered() if userCount > 0
  logIrisEvent('anon_visit').catch(() => { /* ignore */ });
}
