import {
  getQueryParam,
  isArray,
  isObject,
  normalizeDate,
  pickFirst,
  toSafeString,
} from "../utils.js";
import { TEST_USERS } from "../security/test-data.js";

export class DataService {
  constructor(defaultSources, options = {}) {
    this.defaultSources = defaultSources;
    this.options = {
      allowTestData: Boolean(options.allowTestData),
      useTestData: Boolean(options.useTestData),
      secureRuntimeSource: options.secureRuntimeSource || "__secure_runtime__",
    };
    this.cachePrefix = "InstaRishtaUsersCache:v1";
    this.maxCacheAgeMs = 1000 * 60 * 60 * 24; // 24 hours
    this.localTimeoutMs = 9000;
    this.remoteTimeoutMs = 15000;
  }

  log(message, details = {}) {
    if (typeof window === "undefined") return;
    window.__INSTA_RUNTIME__?.log?.(message, details);
  }

  warn(message, details = {}) {
    if (typeof window === "undefined") return;
    window.__INSTA_RUNTIME__?.warn?.(message, details);
  }

  buildSources() {
    const querySource = toSafeString(getQueryParam("data"));
    const sources = [];

    if (querySource) sources.push(querySource);
    sources.push(...this.defaultSources);

    const seen = new Set();
    return sources.filter((source) => {
      const clean = toSafeString(source);
      if (!clean || seen.has(clean)) return false;
      seen.add(clean);
      return true;
    });
  }

  async loadUsers() {
    const testUsers = this.readInjectedUsers();
    if (testUsers) {
      const users = this.processUserData(testUsers);
      this.log("Loaded test dataset", { rows: users.length });
      return { users, source: "test:data", errors: [] };
    }

    const sources = this.buildSources();
    const errors = [];

    for (const source of sources) {
      try {
        this.log("Loading user source", { source });
        const raw = await this.fetchSource(source);
        const users = this.processUserData(raw);
        if (!users.length) {
          throw new Error("No valid user records found");
        }

        this.writeUsersToCache(source, users);
        return { users, source, errors };
      } catch (error) {
        this.warn("Source load failed", { source, message: error.message });
        errors.push(`${source}: ${error.message}`);
      }
    }

    const message = errors.length
      ? errors[errors.length - 1]
      : "Unable to load data";
    throw new Error(message);
  }

  async fetchSource(source) {
    if (source === this.options.secureRuntimeSource) {
      return this.readSecureRuntimeSource();
    }

    const prefetched = this.readPrefetchedSource(source);
    if (prefetched) {
      try {
        const preloadedData = await prefetched;
        if (preloadedData) return preloadedData;
      } catch {
        // fall through to regular network fetch
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.getRequestTimeout(source)
    );

    try {
      const response = await fetch(source, {
        method: "GET",
        cache: "default",
        credentials: "same-origin",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Request timeout");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  readInjectedUsers() {
    if (!this.options.allowTestData || typeof window === "undefined") return null;

    if (Array.isArray(window.__INSTA_TEST_DATA__) && window.__INSTA_TEST_DATA__.length) {
      return window.__INSTA_TEST_DATA__;
    }

    if (this.options.useTestData) {
      return TEST_USERS;
    }

    return null;
  }

  async readSecureRuntimeSource() {
    if (typeof window === "undefined") {
      throw new Error("Secure runtime data unavailable");
    }

    const payload = window.__INSTA_SECURE_DATA__;

    if (payload && typeof payload.then === "function") {
      return payload;
    }

    if (Array.isArray(payload)) {
      return payload;
    }

    throw new Error("Secure runtime data missing");
  }

  resolveSourceUrl(source) {
    if (typeof window === "undefined") return toSafeString(source);

    try {
      return new URL(source, window.location.href).href;
    } catch {
      return toSafeString(source);
    }
  }

  isRemoteSource(source) {
    const resolved = this.resolveSourceUrl(source);
    if (!resolved) return false;

    if (typeof window === "undefined") {
      return /^https?:\/\//i.test(resolved);
    }

    try {
      return new URL(resolved).origin !== window.location.origin;
    } catch {
      return /^https?:\/\//i.test(resolved);
    }
  }

  getRequestTimeout(source) {
    return this.isRemoteSource(source) ? this.remoteTimeoutMs : this.localTimeoutMs;
  }

  readPrefetchedSource(source) {
    if (typeof window === "undefined") return null;

    const store = window.__INSTA_DATA_PREFETCH;
    if (!(store instanceof Map)) return null;

    const key = this.resolveSourceUrl(source);
    if (!key) return null;
    return store.get(key) || null;
  }

  loadCachedUsers() {
    const sources = this.buildSources();
    for (const source of sources) {
      const cached = this.readUsersFromCache(source);
      if (!cached || !cached.users || !cached.users.length) continue;
      return {
        users: cached.users,
        source,
        cachedAt: cached.cachedAt || 0,
        expired: (Date.now() - (cached.cachedAt || 0)) > this.maxCacheAgeMs,
        signature: cached.signature || this.getUsersSignature(cached.users),
      };
    }
    return null;
  }

  getUsersSignature(users) {
    if (!users || !users.length) return "0";

    let firstId = "";
    let lastId = "";
    let newestDate = 0;

    firstId = String(users[0]?.id ?? "");
    lastId = String(users[users.length - 1]?.id ?? "");

    for (let i = 0; i < users.length; i += 1) {
      const date = Date.parse(users[i]?.date || "");
      if (!Number.isNaN(date) && date > newestDate) newestDate = date;
    }

    return `${users.length}|${firstId}|${lastId}|${newestDate}`;
  }

  getCacheKey(source) {
    return `${this.cachePrefix}:${encodeURIComponent(source)}`;
  }

  readUsersFromCache(source) {
    if (typeof localStorage === "undefined") return null;

    try {
      const raw = localStorage.getItem(this.getCacheKey(source));
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (!cached || !isArray(cached.users)) return null;
      return cached;
    } catch {
      return null;
    }
  }

  writeUsersToCache(source, users) {
    if (typeof localStorage === "undefined") return;

    try {
      const payload = {
        cachedAt: Date.now(),
        signature: this.getUsersSignature(users),
        users,
      };
      localStorage.setItem(this.getCacheKey(source), JSON.stringify(payload));
    } catch {
      // Cache is best-effort only.
    }
  }

  processUserData(rawData) {
    const list = this.extractUserArray(rawData);
    const users = [];

    list.forEach((item, index) => {
      const normalized = this.normalizeUserRecord(item, index);
      if (normalized) users.push(normalized);
    });

    return users;
  }

  extractUserArray(rawData) {
    if (!rawData) return [];
    if (isArray(rawData)) return rawData;
    if (!isObject(rawData)) return [];

    const containers = ["data", "users", "results", "items", "records", "profiles"];
    for (const key of containers) {
      if (isArray(rawData[key])) return rawData[key];
    }

    return Object.values(rawData).filter((value) => isObject(value));
  }

  normalizeUserRecord(user, index) {
    if (!isObject(user)) return null;

    const id = pickFirst(user, ["id", "ID", "lr_id", "user_id", "profile_id"]) || 2000 + index;
    const title = toSafeString(pickFirst(user, ["title", "heading", "name", "profile_title"]));
    const body = toSafeString(pickFirst(user, ["body", "description", "text", "details", "about"]));
    const education = toSafeString(pickFirst(user, ["education", "qualification", "edu"]));
    const priority = toSafeString(pickFirst(user, ["priority", "status", "tag"]))
      .toLowerCase();
    const urgentRaw = toSafeString(pickFirst(user, ["urgent", "isUrgent", "is_urgent"]))
      .toLowerCase();
    const urgent =
      urgentRaw === "true" ||
      urgentRaw === "1" ||
      urgentRaw === "urgent" ||
      priority === "urgent";

    const phone = toSafeString(
      pickFirst(user, ["phone", "phone_number", "mobile", "contact"])
    ).replace(/[^\d+]/g, "");

    const whatsapp = toSafeString(
      pickFirst(user, ["whatsapp", "wa", "whatsapp_number", "mobile"])
    ).replace(/[^\d+]/g, "");
    const contactMode = this.normalizeContactMode(
      pickFirst(user, ["contactMode", "contact_mode", "contactFlow", "contact_flow"])
    );
    const familyApproval = this.normalizeBoolean(
      pickFirst(user, ["familyApproval", "family_approval", "guardianApproval", "waliApproval"])
    );
    const verified = this.normalizeBoolean(
      pickFirst(user, ["verified", "isVerified", "verifiedBadge", "trusted"])
    );

    return {
      id,
      title: title || "ضرورت رشتہ",
      body,
      education: education || this.extractEducation(body),
      phone,
      whatsapp,
      age: toSafeString(pickFirst(user, ["age"])),
      gender: this.detectGender({
        explicit: toSafeString(pickFirst(user, ["gender", "sex"])),
        text: `${body} ${title}`,
      }),
      priority: priority || (urgent ? "urgent" : "normal"),
      urgent,
      date: normalizeDate(pickFirst(user, ["date", "created_at", "createdAt", "timestamp"])),
      instagramPostId: toSafeString(
        pickFirst(user, [
          "instagramPostId",
          "instagram_post_id",
          "instagramUrl",
          "instagram_url",
          "postId",
          "post_id",
        ])
      ),
      location: toSafeString(pickFirst(user, ["location", "city", "area"])),
      notes: toSafeString(pickFirst(user, ["notes", "note"])),
      values: toSafeString(
        pickFirst(user, ["values", "valueTags", "matchValues", "preferences"])
      ),
      verified,
      familyApproval: familyApproval || contactMode === "family",
      contactMode: familyApproval ? "family" : (contactMode || "direct"),
      guardianName: toSafeString(
        pickFirst(user, ["guardianName", "waliName", "familyContactName"])
      ),
      guardianPhone: toSafeString(
        pickFirst(user, ["guardianPhone", "waliPhone", "familyContactPhone"])
      ).replace(/[^\d+]/g, ""),
      contactNotes: toSafeString(
        pickFirst(user, ["contactNotes", "contact_note", "privateContactNote"])
      ),
      expiresAt: this.normalizeOptionalDate(
        pickFirst(user, ["expiresAt", "expiryAt", "expireAt", "expires_at"])
      ),
      updatedAt: this.normalizeOptionalDate(
        pickFirst(user, ["updatedAt", "modifiedAt", "updated_at"])
      ),
    };
  }

  normalizeOptionalDate(value) {
    const dateText = toSafeString(value);
    if (!dateText) return "";

    const parsed = new Date(dateText);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }

    const numeric = Number(dateText);
    if (!Number.isNaN(numeric)) {
      const timestamp = numeric < 1e12 ? numeric * 1000 : numeric;
      const fromNumber = new Date(timestamp);
      if (!Number.isNaN(fromNumber.getTime())) {
        return fromNumber.toISOString();
      }
    }

    return dateText;
  }

  normalizeBoolean(value) {
    const text = toSafeString(value).toLowerCase();
    return (
      text === "true" ||
      text === "1" ||
      text === "yes" ||
      text === "on" ||
      text === "verified" ||
      text === "family"
    );
  }

  normalizeContactMode(value) {
    const text = toSafeString(value).toLowerCase();
    if (!text) return "";
    if (text.includes("family") || text.includes("wali") || text.includes("guardian")) return "family";
    if (text.includes("private") || text.includes("hidden") || text.includes("exclusive")) return "private";
    if (text.includes("direct") || text.includes("open")) return "direct";
    return "";
  }

  detectGender({ explicit, text }) {
    const gender = toSafeString(explicit).toLowerCase();
    if (gender.includes("female") || gender.includes("girl") || gender.includes("خاتون")) {
      return "female";
    }
    if (gender.includes("male") || gender.includes("boy") || gender.includes("مرد")) {
      return "male";
    }

    const haystack = toSafeString(text).toLowerCase();
    if (
      haystack.includes("لڑکی") ||
      haystack.includes("girl") ||
      haystack.includes("female") ||
      haystack.includes("daughter") ||
      haystack.includes("بیٹی")
    ) {
      return "female";
    }

    if (
      haystack.includes("لڑکا") ||
      haystack.includes("boy") ||
      haystack.includes("male") ||
      haystack.includes("son") ||
      haystack.includes("بیٹا")
    ) {
      return "male";
    }

    return "unknown";
  }

  extractEducation(text) {
    const educationKeywords = [
      "PhD",
      "Doctor",
      "MBBS",
      "MD",
      "MS",
      "Engineer",
      "B.Tech",
      "M.Tech",
      "Post Graduate",
      "Graduate",
      "Masters",
      "Bachelor",
      "Degree",
      "Intermediate",
      "Inter",
      "Secondary",
      "Matric",
      "Primary",
      "B.Sc",
      "M.Sc",
      "BA",
      "MA",
      "B.Com",
      "M.Com",
      "BBA",
      "MBA",
      "Diploma",
      "Hafiz",
      "Aalim",
      "Qari",
    ];

    const haystack = toSafeString(text).toUpperCase();
    for (const keyword of educationKeywords) {
      if (haystack.includes(keyword.toUpperCase())) {
        return keyword;
      }
    }

    return "";
  }
}

