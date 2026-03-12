const runtimeConfig = window.INSTA_RISHTA_CONFIG || {};

const DEFAULT_DATA_SOURCES = [
  "jsdata.json",
  "data/jsdata.json",
  "js/jsdata.json",
  "https://raw.githubusercontent.com/majidomri/liverishtey/main/jsdata.json",
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

export const config = {
  usersPerPage: Number(runtimeConfig.usersPerPage) || 12,
  dataSources: normalizeSources([
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
