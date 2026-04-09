const runtimeConfig = window.INSTA_RISHTA_CONFIG || {};

const DEFAULT_DATA_SOURCES = [
  "jsdata.json",
  "data/jsdata.json",
  "js/jsdata.json",
];

const DEFAULT_ALLOWED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "instarishta.me",
  "www.instarishta.me",
];

function normalizeSources(sources) {
  const seen = new Set();
  const clean = [];

  for (const source of sources || []) {
    const url = typeof source === "string" ? source.trim() : "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    clean.push(url);
  }

  return clean;
}

function normalizeHosts(hosts) {
  const seen = new Set();
  const clean = [];

  for (const host of hosts || []) {
    const value = typeof host === "string" ? host.trim().toLowerCase() : "";
    if (!value || seen.has(value)) continue;
    seen.add(value);
    clean.push(value);
  }

  return clean;
}

function deriveWorkerEndpoint(value, fallbackSuffix) {
  const explicit = typeof value === "string" ? value.trim() : "";
  if (explicit) return explicit;

  const candidates = [
    ...(Array.isArray(runtimeConfig.dataSources) ? runtimeConfig.dataSources : []),
    runtimeConfig.dataUrl || "",
  ];

  for (const source of candidates) {
    const text = typeof source === "string" ? source.trim() : "";
    if (!text || !text.includes("/api/profiles")) continue;
    return text.replace(/\/api\/profiles(?:\?.*)?$/, fallbackSuffix);
  }

  return "";
}

const mode = runtimeConfig.mode === "protected" ? "protected" : "dev";
const debug = runtimeConfig.debug !== false && mode !== "protected";
const allowTestData = runtimeConfig.allowTestData !== false && mode !== "protected";
const useTestData = Boolean(runtimeConfig.useTestData);
const secureRuntimeSource = runtimeConfig.secureRuntimeSource || "__secure_runtime__";
const secureMode = Boolean(runtimeConfig.secureMode);

export const config = {
  mode,
  debug,
  allowTestData,
  useTestData,
  secureMode,
  secureRuntimeSource,
  allowedHosts: normalizeHosts([
    ...(Array.isArray(runtimeConfig.allowedHosts) ? runtimeConfig.allowedHosts : []),
    ...DEFAULT_ALLOWED_HOSTS,
  ]),
  usersPerPage: Number(runtimeConfig.usersPerPage) || 12,
  dataSources: secureMode
    ? [secureRuntimeSource]
    : normalizeSources([
        ...(Array.isArray(runtimeConfig.dataSources) ? runtimeConfig.dataSources : []),
        runtimeConfig.dataUrl || "",
        ...DEFAULT_DATA_SOURCES,
      ]),
  contactLimit: {
    maxAttempts: Number(runtimeConfig.maxContactAttempts) || 7,
    timeWindowMs: Number(runtimeConfig.contactWindowMs) || 60 * 60 * 1000,
    businessWhatsApp: runtimeConfig.businessWhatsApp || "+923001234567",
    businessPhone: runtimeConfig.businessPhone || "+923001234567",
    storageKey: runtimeConfig.contactStorageKey || "InstaRishtaContactUsage",
    sessionStorageKey:
      runtimeConfig.contactSessionStorageKey || "InstaRishtaContactUsage:session",
  },
  audioPreviewLimit: {
    maxAttempts: Number(runtimeConfig.maxAudioPreviewAttempts) || 30,
    timeWindowMs: Number(runtimeConfig.audioPreviewWindowMs) || 60 * 60 * 1000,
    storageKey:
      runtimeConfig.audioPreviewStorageKey || "InstaRishtaAudioPreviewUsage",
    sessionStorageKey:
      runtimeConfig.audioPreviewSessionStorageKey ||
      "InstaRishtaAudioPreviewUsage:session",
  },
  themeStorageKey: runtimeConfig.themeStorageKey || "theme",
  adminCode: runtimeConfig.adminCode || "admin123",
  activityLogKey: runtimeConfig.activityLogKey || "InstaRishtaActivityLog",
  instagramProfileUrl:
    runtimeConfig.instagramProfileUrl || "https://www.instagram.com/instarishta/",
  platformMetricsEndpoint: deriveWorkerEndpoint(
    runtimeConfig.platformMetricsEndpoint,
    "/api/platform-metrics",
  ),
};
