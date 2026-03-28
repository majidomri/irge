export class ContactService {
  constructor(storage, config) {
    this.storage = storage;
    this.maxAttempts = config.maxAttempts;
    this.timeWindowMs = config.timeWindowMs;
    this.storageKey = config.storageKey;
    this.sessionStorageKey = config.sessionStorageKey || "";
  }

  createEmptyUsage() {
    return {
      attempts: [],
      createdAt: Date.now(),
    };
  }

  readSessionUsage() {
    if (
      typeof window === "undefined" ||
      !this.sessionStorageKey ||
      typeof window.sessionStorage === "undefined"
    ) {
      return this.createEmptyUsage();
    }

    try {
      const raw = window.sessionStorage.getItem(this.sessionStorageKey);
      if (!raw) return this.createEmptyUsage();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.attempts)) return this.createEmptyUsage();
      return parsed;
    } catch {
      return this.createEmptyUsage();
    }
  }

  normalizeUsage(usage) {
    const normalized = usage && typeof usage === "object"
      ? usage
      : this.createEmptyUsage();
    if (!Array.isArray(normalized.attempts)) normalized.attempts = [];
    normalized.createdAt = Number(normalized.createdAt) || Date.now();
    return normalized;
  }

  mergeUsages(localUsage, sessionUsage) {
    const attempts = [...localUsage.attempts, ...sessionUsage.attempts]
      .map((time) => Number(time))
      .filter((time) => Number.isFinite(time) && time > 0);
    const uniqueAttempts = [...new Set(attempts)].sort((a, b) => a - b);

    return {
      attempts: uniqueAttempts,
      createdAt: Math.min(
        Number(localUsage.createdAt) || Date.now(),
        Number(sessionUsage.createdAt) || Date.now(),
      ),
    };
  }

  getUsage() {
    const localUsage = this.normalizeUsage(
      this.storage.getJson(this.storageKey, this.createEmptyUsage()),
    );
    const sessionUsage = this.normalizeUsage(this.readSessionUsage());
    const merged = this.mergeUsages(localUsage, sessionUsage);
    return this.normalizeUsage(merged);
  }

  saveUsage(usage) {
    const normalized = this.normalizeUsage(usage);
    this.storage.setJson(this.storageKey, normalized);

    if (
      typeof window === "undefined" ||
      !this.sessionStorageKey ||
      typeof window.sessionStorage === "undefined"
    ) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        this.sessionStorageKey,
        JSON.stringify(normalized),
      );
    } catch {
      // ignore storage quota/session issues
    }
  }

  getCleanAttempts(attempts) {
    const cutoff = Date.now() - this.timeWindowMs;
    return attempts.filter((time) => Number(time) > cutoff);
  }

  getRemainingAttempts() {
    const usage = this.getUsage();
    usage.attempts = this.getCleanAttempts(usage.attempts);
    this.saveUsage(usage);
    return Math.max(0, this.maxAttempts - usage.attempts.length);
  }

  recordAttempt() {
    const usage = this.getUsage();
    usage.attempts = this.getCleanAttempts(usage.attempts);
    usage.attempts.push(Date.now());
    this.saveUsage(usage);
  }

  getTimeUntilReset() {
    const usage = this.getUsage();
    const attempts = this.getCleanAttempts(usage.attempts);
    if (!attempts.length) return 0;

    const oldest = Math.min(...attempts);
    return Math.max(0, oldest + this.timeWindowMs - Date.now());
  }

  clear() {
    this.storage.remove(this.storageKey);
    if (
      typeof window !== "undefined" &&
      this.sessionStorageKey &&
      typeof window.sessionStorage !== "undefined"
    ) {
      try {
        window.sessionStorage.removeItem(this.sessionStorageKey);
      } catch {
        // ignore
      }
    }
  }

  formatTimeRemaining(milliseconds) {
    if (milliseconds <= 0) return "now";
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);

    if (minutes > 0) {
      return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
    }

    return `${seconds} second${seconds !== 1 ? "s" : ""}`;
  }
}
