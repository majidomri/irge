const DEFAULT_ALLOWED_ORIGINS = [
  "https://www.instarishta.me",
  "https://instarishta.me",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5500",
];

const MIN_FORM_AGE_MS = 3500;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 3;
const MAX_BIO_LENGTH = 3000;
const MAX_FIELD_LENGTH = 220;
const rateLimitStore = globalThis.__instarishtaLeadRateLimitStore || new Map();
globalThis.__instarishtaLeadRateLimitStore = rateLimitStore;

function getLeadStore(env) {
  return env.insta || env.INSTA || null;
}

function parseCsvList(value, fallback = []) {
  const source = String(value || "").trim();
  if (!source) return [...fallback];
  return source
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function normalizeBoolean(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function normalizeGuardianConnect(value) {
  const allowed = new Set(["none", "wali", "parent", "guardian", "family"]);
  const normalized = String(value ?? "").trim().toLowerCase();
  return allowed.has(normalized) ? normalized : "none";
}

function fnv1aHash(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createSubmissionFingerprint(submission) {
  const source = [
    submission.name,
    submission.phone,
    submission.whatsapp,
    submission.bioData.slice(0, 180),
    submission.urgent ? "1" : "0",
    submission.directContact ? "1" : "0",
    submission.guardianConnect,
    submission.pageUrl,
    submission.referrer,
  ]
    .join("|")
    .toLowerCase();

  return fnv1aHash(source);
}

function getRequestOrigin(request) {
  return request.headers.get("Origin") || request.headers.get("Referer") || "";
}

function isAllowedOrigin(origin, env) {
  if (!origin) return false;

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  const allowed = parseCsvList(env.ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS);
  return allowed.includes(parsed.origin);
}

function buildCorsHeaders(origin, env) {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  });

  if (isAllowedOrigin(origin, env)) {
    headers.set("Access-Control-Allow-Origin", new URL(origin).origin);
  }

  return headers;
}

function jsonResponse(body, status = 200, origin = "", env = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: env ? buildCorsHeaders(origin, env) : { "Content-Type": "application/json; charset=utf-8" },
  });
}

function getClientIp(request) {
  return (
    request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown"
  );
}

function rateLimit(ip, now = Date.now()) {
  const record = rateLimitStore.get(ip);
  if (!record || record.resetAt <= now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS, lastAt: now });
    return { ok: true };
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((record.resetAt - now) / 1000)) };
  }

  record.count += 1;
  record.lastAt = now;
  rateLimitStore.set(ip, record);
  return { ok: true };
}

async function readPayload(request) {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    return request.json();
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return Object.fromEntries(formData.entries());
  }

  throw new Error("Unsupported content type");
}

function clipText(value, max = 3000) {
  const text = cleanText(value);
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

function normalizeSubmission(payload = {}) {
  const openedAt = Number(payload.formOpenedAt || payload.startedAt || payload.clientStartedAt || 0);

  return {
    name: cleanText(payload.name).slice(0, MAX_FIELD_LENGTH),
    phone: cleanText(payload.phone).slice(0, MAX_FIELD_LENGTH),
    whatsapp: cleanText(payload.whatsapp).slice(0, MAX_FIELD_LENGTH),
    bioData: cleanText(payload.bioData).slice(0, MAX_BIO_LENGTH),
    urgent: normalizeBoolean(payload.urgent),
    directContact: normalizeBoolean(payload.directContact),
    guardianConnect: normalizeGuardianConnect(payload.guardianConnect),
    honeypot: cleanText(payload.honeypot || payload.company || payload.website),
    formOpenedAt: Number.isFinite(openedAt) ? openedAt : 0,
    submittedAt: cleanText(payload.submittedAt) || new Date().toISOString(),
    pageUrl: cleanText(payload.pageUrl),
    referrer: cleanText(payload.referrer),
    source: cleanText(payload.source) || "post-your-ad",
  };
}

function buildTelegramMessage(submission, request) {
  const submittedAt = new Date().toISOString();
  const origin = request.headers.get("Origin") || request.headers.get("Referer") || "unknown";

  return [
    "<b>InstaRishta profile submission</b>",
    "",
    `<b>Name:</b> ${escapeHtml(submission.name || "N/A")}`,
    `<b>Phone:</b> ${escapeHtml(submission.phone || "N/A")}`,
    `<b>WhatsApp:</b> ${escapeHtml(submission.whatsapp || "N/A")}`,
    `<b>Urgent:</b> ${submission.urgent ? "Yes" : "No"}`,
    `<b>Direct contact:</b> ${submission.directContact ? "Yes" : "No"}`,
    `<b>Guardian connect:</b> ${escapeHtml(submission.guardianConnect)}`,
    "",
    "<b>Bio data:</b>",
    `<pre>${escapeHtml(clipText(submission.bioData || "N/A", MAX_BIO_LENGTH))}</pre>`,
    "",
    `<b>Submitted:</b> ${escapeHtml(submission.submittedAt || submittedAt)}`,
    `<b>Origin:</b> ${escapeHtml(origin)}`,
    `<b>Source:</b> ${escapeHtml(submission.source)}`,
  ].join("\n");
}

async function sendToTelegram(submission, env, request) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  const target = String(env.TELEGRAM_TARGET || "").trim();

  if (!token || !target) {
    const error = new Error("Telegram delivery is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const payload = {
    chat_id: target,
    text: buildTelegramMessage(submission, request),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (String(env.TELEGRAM_MESSAGE_THREAD_ID || "").trim()) {
    payload.message_thread_id = String(env.TELEGRAM_MESSAGE_THREAD_ID).trim();
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.ok) {
    const error = new Error(result?.description || `Telegram HTTP ${response.status}`);
    error.statusCode = response.status || 502;
    error.details = result;
    throw error;
  }

  return result.result || null;
}

function validateSubmission(submission) {
  if (!submission.name || !submission.phone || !submission.whatsapp || !submission.bioData) {
    return "Missing required fields";
  }

  if (submission.bioData.length < 10) {
    return "Bio data is too short";
  }

  if (submission.honeypot) {
    return "Spam detected";
  }

  if (submission.formOpenedAt && Date.now() - submission.formOpenedAt < MIN_FORM_AGE_MS) {
    return "Please spend a little more time filling the form";
  }

  return "";
}

async function reserveSubmissionFingerprint(store, fingerprint) {
  if (!store || !fingerprint) return { reserved: true, key: "" };

  const key = `lead:fp:${fingerprint}`;
  const existing = await store.get(key);
  if (existing) {
    return { reserved: false, key };
  }

  await store.put(key, JSON.stringify({
    status: "pending",
    reservedAt: new Date().toISOString(),
  }), {
    expirationTtl: 300,
  });

  return { reserved: true, key };
}

async function finalizeSubmissionRecord(store, submission, request, telegramResult, fingerprintKey) {
  if (!store) return null;

  const submissionId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const record = {
    id: submissionId,
    submittedAt: submission.submittedAt,
    storedAt: new Date().toISOString(),
    source: submission.source,
    pageUrl: submission.pageUrl,
    referrer: submission.referrer,
    origin: request.headers.get("Origin") || request.headers.get("Referer") || "",
    userAgent: request.headers.get("User-Agent") || "",
    submission: {
      name: submission.name,
      phone: submission.phone,
      whatsapp: submission.whatsapp,
      bioData: submission.bioData,
      urgent: submission.urgent,
      directContact: submission.directContact,
      guardianConnect: submission.guardianConnect,
    },
    telegram: telegramResult ? {
      messageId: telegramResult.message_id ?? null,
      chatId: telegramResult.chat?.id ?? null,
      chatTitle: telegramResult.chat?.title ?? null,
      date: telegramResult.date ?? null,
    } : null,
  };

  const recordKey = `lead:${new Date().toISOString().replace(/[:.]/g, "-")}:${submissionId}`;
  await store.put(recordKey, JSON.stringify(record), {
    expirationTtl: 60 * 60 * 24 * 90,
  });
  await store.put("lead:last", JSON.stringify(record));

  if (fingerprintKey) {
    await store.put(fingerprintKey, JSON.stringify({
      status: "sent",
      storedAt: record.storedAt,
      id: record.id,
    }), {
      expirationTtl: 60 * 60 * 24,
    });
  }

  return record;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = getRequestOrigin(request);

    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(origin, env)) {
        return new Response(null, { status: 403 });
      }

      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(origin, env),
      });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return jsonResponse({ ok: true, time: Date.now() }, 200, origin, env);
    }

    if (url.pathname !== "/api/submit-profile-ad") {
      return new Response("Not found", { status: 404 });
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed" }, 405, origin, env);
    }

    if (!isAllowedOrigin(origin, env)) {
      return jsonResponse({ ok: false, error: "Origin not allowed" }, 403, origin, env);
    }

    const leadStore = getLeadStore(env);
    const ip = getClientIp(request);
    const limit = rateLimit(ip);
    if (!limit.ok) {
      return jsonResponse(
        { ok: false, error: "Too many submissions. Please try again later.", retryAfter: limit.retryAfter },
        429,
        origin,
        env,
      );
    }

    let payload;
    try {
      payload = await readPayload(request);
    } catch {
      return jsonResponse({ ok: false, error: "Unsupported or missing request body" }, 400, origin, env);
    }

    const submission = normalizeSubmission(payload);
    const validationError = validateSubmission(submission);
    if (validationError) {
      return jsonResponse({ ok: false, error: validationError }, 400, origin, env);
    }

    const fingerprint = createSubmissionFingerprint(submission);
    const fingerprintReservation = await reserveSubmissionFingerprint(leadStore, fingerprint);
    if (!fingerprintReservation.reserved) {
      return jsonResponse(
        { ok: false, error: "This submission was already received. Please edit the details and try again." },
        429,
        origin,
        env,
      );
    }

    try {
      const result = await sendToTelegram(submission, env, request);
      try {
        await finalizeSubmissionRecord(leadStore, submission, request, result, fingerprintReservation.key);
      } catch (storageError) {
        console.warn("Lead storage failed:", storageError?.message || storageError);
      }
      return jsonResponse({ ok: true, message: "Submission forwarded to Telegram", result }, 200, origin, env);
    } catch (error) {
      if (leadStore && fingerprintReservation.key) {
        await leadStore.delete(fingerprintReservation.key).catch(() => {});
      }
      return jsonResponse(
        { ok: false, error: error?.message || "Telegram delivery failed" },
        error?.statusCode || 502,
        origin,
        env,
      );
    }
  },
};
