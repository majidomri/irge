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
    maxAttempts: Number(runtimeConfig.maxContactAttempts) || 10,
    timeWindowMs: Number(runtimeConfig.contactWindowMs) || 60 * 60 * 1000,
    businessWhatsApp: runtimeConfig.businessWhatsApp || "+923001234567",
    businessPhone: runtimeConfig.businessPhone || "+923001234567",
    storageKey: runtimeConfig.contactStorageKey || "InstaRishtaContactUsage",
  },
  themeStorageKey: runtimeConfig.themeStorageKey || "theme",
  adminCode: runtimeConfig.adminCode || "admin123",
  activityLogKey: runtimeConfig.activityLogKey || "InstaRishtaActivityLog",
};
