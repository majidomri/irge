export class ContactService {
  constructor(storage, config) {
    this.storage = storage;
    this.maxAttempts = config.maxAttempts;
    this.timeWindowMs = config.timeWindowMs;
    this.storageKey = config.storageKey;
  }

  getUsage() {
    const usage = this.storage.getJson(this.storageKey, {
      attempts: [],
      createdAt: Date.now(),
    });

    if (!Array.isArray(usage.attempts)) usage.attempts = [];
    return usage;
  }

  saveUsage(usage) {
    this.storage.setJson(this.storageKey, usage);
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