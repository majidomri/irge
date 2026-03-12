import { $, getQueryParam } from "../utils.js";

export class AdminController {
  constructor({ storage, logger, contactService, adminCode, showToast }) {
    this.storage = storage;
    this.logger = logger;
    this.contactService = contactService;
    this.adminCode = adminCode;
    this.showToast = showToast;
    this.authKey = "adminAuth";
  }

  init() {
    this.bindEvents();
    this.checkAccess();
  }

  bindEvents() {
    $("closeAdminPanel")?.addEventListener("click", () => this.hidePanel());
    $("exportAnalytics")?.addEventListener("click", () => this.exportData());
    $("clearAnalytics")?.addEventListener("click", () => this.clearData());
    $("refreshAnalytics")?.addEventListener("click", () => {
      this.updateStats();
      this.showToast("Analytics refreshed!");
    });
    $("emailAnalytics")?.addEventListener("click", () => this.emailReport());

    const logo = document.querySelector(".site-logo");
    if (logo) {
      let clicks = 0;
      let timer = null;
      logo.addEventListener("click", () => {
        clicks += 1;
        if (clicks === 1) {
          timer = setTimeout(() => {
            clicks = 0;
          }, 900);
        } else if (clicks === 3) {
          clearTimeout(timer);
          clicks = 0;
          const code = prompt("Enter admin code:");
          if (code) this.authorize(code);
        }
      });
    }
  }

  checkAccess() {
    const param = getQueryParam("admin");
    const saved = this.storage.get(this.authKey, "");
    if (param === this.adminCode || saved === this.adminCode) {
      this.authorize(this.adminCode);
    }
  }

  authorize(code) {
    if (code !== this.adminCode) {
      this.showToast("Invalid admin code");
      return false;
    }

    this.storage.set(this.authKey, this.adminCode);
    this.showPanel();
    return true;
  }

  showPanel() {
    const panel = $("adminPanel");
    if (!panel) return;
    panel.style.display = "block";
    this.updateStats();
    this.logger.log("admin_panel_accessed", {});
  }

  hidePanel() {
    const panel = $("adminPanel");
    if (!panel) return;
    panel.style.display = "none";
    this.storage.remove(this.authKey);
  }

  updateStats() {
    const stats = this.logger.getStats();
    const logs = this.logger.getLogs();

    const contactAttempts = logs.filter(
      (log) => log.action === "contact_attempt" || log.action === "call_attempt"
    ).length;

    if ($("adminTotalActions")) $("adminTotalActions").textContent = String(stats.totalActions);
    if ($("adminUniqueUsers")) $("adminUniqueUsers").textContent = String(stats.uniqueUsers);
    if ($("adminContactAttempts")) $("adminContactAttempts").textContent = String(contactAttempts);

    this.updateRecentActivity(logs);
  }

  updateRecentActivity(logs) {
    const target = $("adminRecentActivity");
    if (!target) return;

    const recent = logs.slice(-10).reverse();
    if (!recent.length) {
      target.textContent = "No recent activity";
      return;
    }

    target.innerHTML = recent
      .map((log) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const extra = log.data?.userId ? ` (User: ${log.data.userId})` : "";
        return `<div class="mb-1 pb-1 border-b"><strong>${time}</strong> - ${log.action}${extra}</div>`;
      })
      .join("");
  }

  exportData() {
    const payload = {
      stats: this.logger.getStats(),
      logs: this.logger.getLogs(),
      contact: this.contactService.getUsage(),
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `InstaRishta-analytics-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.showToast("Analytics data exported successfully!");
  }

  clearData() {
    if (!confirm("Clear analytics and contact usage data?")) return;
    this.logger.clear();
    this.contactService.clear();
    this.updateStats();
    this.showToast("Analytics data cleared successfully!");
  }

  emailReport() {
    const stats = this.logger.getStats();
    const subject = encodeURIComponent(`InstaRishta Analytics Report - ${new Date().toLocaleDateString()}`);
    const body = encodeURIComponent(
      [
        "InstaRishta Analytics Report",
        "",
        `Total Actions: ${stats.totalActions}`,
        `Unique Users: ${stats.uniqueUsers}`,
        `Last Activity: ${stats.lastActivity || "None"}`,
      ].join("\n")
    );

    window.open(`mailto:?subject=${subject}&body=${body}`);
  }
}