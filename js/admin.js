// LiveRishtey Admin - Analytics and Administration Functions
(function () {
  "use strict";

  // Wait for core to be ready
  if (!window.LiveRishteyCore || !window.app) {
    setTimeout(arguments.callee, 100);
    return;
  }

  var $ = window.LiveRishteyCore.$;
  var addClass = window.LiveRishteyCore.addClass;
  var removeClass = window.LiveRishteyCore.removeClass;
  var addEvent = window.LiveRishteyCore.addEvent;
  var showToast = window.LiveRishteyCore.showToast;

  // Admin analytics system
  var AdminAnalytics = {
    secretCode: "admin123", // 🔧 CHANGE THIS to your preferred admin code
    isAuthenticated: false,
    logs: [],
    maxLogs: 100,

    // Check URL parameter for admin access
    checkAdminAccess: function () {
      var urlParams = new URLSearchParams(window.location.search);
      var adminParam = urlParams.get("admin");

      if (adminParam === this.secretCode) {
        this.isAuthenticated = true;
        this.showAdminPanel();
        return true;
      }

      // Check localStorage for persistent auth
      var storedAuth = localStorage.getItem("liverishtey_admin_auth");
      if (storedAuth === this.secretCode) {
        this.isAuthenticated = true;
        this.showAdminPanel();
        return true;
      }

      return false;
    },

    // Show admin panel
    showAdminPanel: function () {
      var panel = $("adminPanel");
      if (panel) {
        removeClass(panel, "hidden");
        this.updateAnalytics();
        this.setupAdminEventListeners();
      }
    },

    // Hide admin panel
    hideAdminPanel: function () {
      var panel = $("adminPanel");
      if (panel) {
        addClass(panel, "hidden");
      }
      this.isAuthenticated = false;
      localStorage.removeItem("liverishtey_admin_auth");
    },

    // Log activity
    logActivity: function (action, details) {
      var timestamp = new Date().toISOString();
      var fingerprint = window.LiveRishteyContacts
        ? window.LiveRishteyContacts.generateAdvancedFingerprint()
        : "unknown";

      var logEntry = {
        timestamp: timestamp,
        action: action,
        details: details || {},
        fingerprint: fingerprint.substring(0, 8), // Truncated for privacy
        userAgent: navigator.userAgent.substring(0, 100),
      };

      this.logs.unshift(logEntry);

      // Keep only last maxLogs entries
      if (this.logs.length > this.maxLogs) {
        this.logs = this.logs.slice(0, this.maxLogs);
      }

      // Store in localStorage
      try {
        localStorage.setItem(
          "liverishtey_admin_logs",
          JSON.stringify(this.logs)
        );
      } catch (e) {
        // Storage full, remove old entries
        this.logs = this.logs.slice(0, 50);
        localStorage.setItem(
          "liverishtey_admin_logs",
          JSON.stringify(this.logs)
        );
      }

      // Update admin panel if visible
      if (this.isAuthenticated) {
        this.updateRecentActivity();
      }
    },

    // Load stored logs
    loadStoredLogs: function () {
      try {
        var stored = localStorage.getItem("liverishtey_admin_logs");
        if (stored) {
          this.logs = JSON.parse(stored);
        }
      } catch (e) {
        this.logs = [];
      }
    },

    // Update analytics display
    updateAnalytics: function () {
      var totalActions = this.logs.length;
      var uniqueUsers = {};
      var contactAttempts = 0;
      var suspiciousActivity = 0;

      for (var i = 0; i < this.logs.length; i++) {
        var log = this.logs[i];
        uniqueUsers[log.fingerprint] = true;

        if (log.action === "contact_attempt" || log.action === "call_attempt") {
          contactAttempts++;
        }

        if (log.action === "suspicious_activity") {
          suspiciousActivity++;
        }
      }

      var uniqueUserCount = Object.keys(uniqueUsers).length;

      // Update display
      var totalEl = $("adminTotalActions");
      var usersEl = $("adminUniqueUsers");
      var contactsEl = $("adminContactAttempts");
      var suspiciousEl = $("adminSuspiciousActivity");

      if (totalEl) totalEl.textContent = totalActions;
      if (usersEl) usersEl.textContent = uniqueUserCount;
      if (contactsEl) contactsEl.textContent = contactAttempts;
      if (suspiciousEl) suspiciousEl.textContent = suspiciousActivity;

      this.updateRecentActivity();
    },

    // Update recent activity feed
    updateRecentActivity: function () {
      var container = $("adminRecentActivity");
      if (!container) return;

      var recentLogs = this.logs.slice(0, 10);
      var html = "";

      for (var i = 0; i < recentLogs.length; i++) {
        var log = recentLogs[i];
        var time = new Date(log.timestamp).toLocaleString();
        var actionText = this.formatActionText(log);

        html +=
          '<div class="admin-activity-item">' +
          '<div class="admin-activity-time">' +
          time +
          "</div>" +
          '<div class="admin-activity-text">' +
          actionText +
          "</div>" +
          '<div class="admin-activity-user">User: ' +
          log.fingerprint +
          "</div>" +
          "</div>";
      }

      container.innerHTML = html || "<p>No recent activity</p>";
    },

    // Format action text for display
    formatActionText: function (log) {
      switch (log.action) {
        case "page_load":
          return "Page loaded";
        case "search":
          return 'Searched: "' + (log.details.term || "") + '"';
        case "filter_applied":
          return "Applied filter: " + (log.details.filter || "");
        case "contact_attempt":
          return "Contacted user ID: " + (log.details.userId || "");
        case "call_attempt":
          return "Called user ID: " + (log.details.userId || "");
        case "contact_limit_reached":
          return "Contact limit reached";
        case "suspicious_activity":
          return "Suspicious activity detected";
        default:
          return log.action;
      }
    },

    // Export analytics data
    exportAnalytics: function () {
      var data = {
        exportDate: new Date().toISOString(),
        totalLogs: this.logs.length,
        logs: this.logs,
        systemInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          cookieEnabled: navigator.cookieEnabled,
        },
      };

      var blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download =
        "liverishtey-analytics-" +
        new Date().toISOString().split("T")[0] +
        ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast("Analytics data exported");
    },

    // Clear analytics data
    clearAnalytics: function () {
      if (
        confirm(
          "Are you sure you want to clear all analytics data? This cannot be undone."
        )
      ) {
        this.logs = [];
        localStorage.removeItem("liverishtey_admin_logs");
        this.updateAnalytics();
        showToast("Analytics data cleared");
      }
    },

    // Generate email report
    generateEmailReport: function () {
      var totalActions = this.logs.length;
      var uniqueUsers = {};
      var contactAttempts = 0;
      var recentActivity = this.logs.slice(0, 5);

      for (var i = 0; i < this.logs.length; i++) {
        var log = this.logs[i];
        uniqueUsers[log.fingerprint] = true;
        if (log.action === "contact_attempt" || log.action === "call_attempt") {
          contactAttempts++;
        }
      }

      var report =
        "LiveRishtey Analytics Report\n" +
        "================================\n\n" +
        "Generated: " +
        new Date().toLocaleString() +
        "\n\n" +
        "Summary:\n" +
        "- Total Actions: " +
        totalActions +
        "\n" +
        "- Unique Users: " +
        Object.keys(uniqueUsers).length +
        "\n" +
        "- Contact Attempts: " +
        contactAttempts +
        "\n\n" +
        "Recent Activity:\n";

      for (var j = 0; j < recentActivity.length; j++) {
        var activity = recentActivity[j];
        report +=
          "- " +
          new Date(activity.timestamp).toLocaleString() +
          ": " +
          this.formatActionText(activity) +
          "\n";
      }

      var subject = encodeURIComponent(
        "LiveRishtey Analytics Report - " + new Date().toLocaleDateString()
      );
      var body = encodeURIComponent(report);
      var mailtoUrl = "mailto:?subject=" + subject + "&body=" + body;

      window.location.href = mailtoUrl;
      showToast("Email report generated");
    },

    // Setup admin event listeners
    setupAdminEventListeners: function () {
      var exportBtn = $("adminExportBtn");
      var clearBtn = $("adminClearBtn");
      var refreshBtn = $("adminRefreshBtn");
      var emailBtn = $("adminEmailBtn");
      var logoutBtn = $("adminLogoutBtn");

      if (exportBtn) {
        addEvent(exportBtn, "click", this.exportAnalytics.bind(this));
      }

      if (clearBtn) {
        addEvent(clearBtn, "click", this.clearAnalytics.bind(this));
      }

      if (refreshBtn) {
        addEvent(refreshBtn, "click", this.updateAnalytics.bind(this));
      }

      if (emailBtn) {
        addEvent(emailBtn, "click", this.generateEmailReport.bind(this));
      }

      if (logoutBtn) {
        addEvent(logoutBtn, "click", this.hideAdminPanel.bind(this));
      }
    },
  };

  // Activity logging functions
  function logPageLoad() {
    AdminAnalytics.logActivity("page_load", {
      url: window.location.href,
      referrer: document.referrer,
    });
  }

  function logSearch(term) {
    AdminAnalytics.logActivity("search", { term: term });
  }

  function logFilterApplied(filter, value) {
    AdminAnalytics.logActivity("filter_applied", {
      filter: filter,
      value: value,
    });
  }

  function logContactAttempt(userId) {
    AdminAnalytics.logActivity("contact_attempt", { userId: userId });
  }

  function logCallAttempt(userId) {
    AdminAnalytics.logActivity("call_attempt", { userId: userId });
  }

  function logContactLimitReached() {
    AdminAnalytics.logActivity("contact_limit_reached", {});
  }

  function logSuspiciousActivity(reason) {
    AdminAnalytics.logActivity("suspicious_activity", { reason: reason });
  }

  // Export admin functions
  window.LiveRishteyAdmin = {
    AdminAnalytics: AdminAnalytics,
    logPageLoad: logPageLoad,
    logSearch: logSearch,
    logFilterApplied: logFilterApplied,
    logContactAttempt: logContactAttempt,
    logCallAttempt: logCallAttempt,
    logContactLimitReached: logContactLimitReached,
    logSuspiciousActivity: logSuspiciousActivity,
  };

  // Make admin functions globally accessible
  window.showAdminPanel = function (code) {
    if (code === AdminAnalytics.secretCode) {
      AdminAnalytics.isAuthenticated = true;
      localStorage.setItem("liverishtey_admin_auth", code);
      AdminAnalytics.showAdminPanel();
    } else {
      alert("Invalid admin code");
    }
  };

  window.getAnalytics = function () {
    return {
      totalActions: AdminAnalytics.logs.length,
      recentLogs: AdminAnalytics.logs.slice(0, 10),
      uniqueUsers: AdminAnalytics.logs.reduce(function (acc, log) {
        acc[log.fingerprint] = true;
        return acc;
      }, {}),
    };
  };

  window.getLogs = function () {
    return AdminAnalytics.logs;
  };

  window.exportAnalytics = function () {
    AdminAnalytics.exportAnalytics();
  };

  // Initialize admin system
  function initAdmin() {
    AdminAnalytics.loadStoredLogs();
    AdminAnalytics.checkAdminAccess();
    logPageLoad();
  }

  // Start admin initialization
  if (document.readyState === "loading") {
    addEvent(document, "DOMContentLoaded", initAdmin);
  } else {
    initAdmin();
  }
})();
