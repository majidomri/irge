export class ActivityLogger {
  constructor(storage, storageKey, maxEntries = 150) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.maxEntries = maxEntries;
  }

  log(action, data = {}) {
    try {
      const logs = this.getLogs();
      logs.push({
        timestamp: new Date().toISOString(),
        action,
        data,
        url: window.location.href,
        userAgent: navigator.userAgent,
      });

      if (logs.length > this.maxEntries) {
        logs.splice(0, logs.length - this.maxEntries);
      }

      this.storage.setJson(this.storageKey, logs);
    } catch {
      // Keep logging non-blocking.
    }
  }

  getLogs() {
    return this.storage.getJson(this.storageKey, []);
  }

  clear() {
    this.storage.remove(this.storageKey);
  }

  getStats() {
    const logs = this.getLogs();
    const actionCounts = {};

    for (const log of logs) {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
    }

    return {
      totalActions: logs.length,
      uniqueUsers: new Set(logs.map((log) => log.userAgent)).size,
      actionCounts,
      lastActivity: logs.length ? logs[logs.length - 1].timestamp : null,
    };
  }
}
