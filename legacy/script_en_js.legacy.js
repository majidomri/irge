// InstaRishta - Enhanced ES5 Compatible Implementation
(function () {
  "use strict";

  // Application state
  var app = {
    allUsers: [],
    filteredUsers: [],
    displayedUsers: [],
    currentPage: 1,
    usersPerPage: 12,
    loading: false,

    // Filter states
    searchTerm: "",
    idFilter: "",
    genderFilter: "all",
    educationFilter: "",
    sortOrder: "dateDesc",
    appliedFilters: [],

    // Mobile drawer state
    drawerOpen: false,

    // Theme state
    currentTheme: "system",
    themeDropdownOpen: false,

    // Contact limiting system
    contactLimit: {
      maxAttempts: 10, // ðŸ”§ CHANGE THIS: Number of contacts allowed per time window
      timeWindow: 60 * 60 * 1000, // ðŸ”§ CHANGE THIS: Time window in milliseconds
      //     Current: 1 hour (60 * 60 * 1000)
      //     Examples:
      //     - 30 minutes: 30 * 60 * 1000
      //     - 2 hours: 2 * 60 * 60 * 1000
      //     - 24 hours: 24 * 60 * 60 * 1000
      //     - 1 week: 7 * 24 * 60 * 60 * 1000
      businessWhatsApp: "+923001234567", // ðŸ”§ CHANGE THIS: Your business WhatsApp number
      businessPhone: "+923001234567", // ðŸ”§ CHANGE THIS: Your business phone number
      storageKey: "InstaRishtaContactUsage",
    },

    // Typing animation
    typingTexts: ["Search & Filter Ads", "Try InstaRishta", "Daily 1000 Ads"],
    currentTextIndex: 0,
    currentCharIndex: 0,
    typingDirection: "forward",
    typingSpeed: 150,
    pauseDuration: 1500,

    // Data source state
    dataSources: [],
    activeDataSource: "",
  };

  // Utility functions
  function $(id) {
    return document.getElementById(id);
  }

  function addClass(element, className) {
    if (element) {
      if (element.classList) {
        element.classList.add(className);
      } else {
        element.className += " " + className;
      }
    }
  }

  function removeClass(element, className) {
    if (element) {
      if (element.classList) {
        element.classList.remove(className);
      } else {
        element.className = element.className.replace(
          new RegExp("\\b" + className + "\\b", "g"),
          ""
        );
      }
    }
  }

  function hasClass(element, className) {
    if (element) {
      if (element.classList) {
        return element.classList.contains(className);
      } else {
        return element.className.indexOf(className) !== -1;
      }
    }
    return false;
  }

  function isArray(value) {
    return Object.prototype.toString.call(value) === "[object Array]";
  }

  function isObject(value) {
    return value && Object.prototype.toString.call(value) === "[object Object]";
  }

  function toSafeString(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return "";
  }

  function pickFirst(obj, keys) {
    if (!obj || !keys) return "";
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (
        Object.prototype.hasOwnProperty.call(obj, key) &&
        obj[key] !== null &&
        obj[key] !== undefined &&
        obj[key] !== ""
      ) {
        return obj[key];
      }
    }
    return "";
  }

  function getQueryParam(name) {
    try {
      if (window.URLSearchParams) {
        var params = new URLSearchParams(window.location.search);
        return params.get(name) || "";
      }
    } catch (e) {}

    var query = window.location.search || "";
    if (!query || query.length < 2) return "";

    var pairs = query.substring(1).split("&");
    for (var i = 0; i < pairs.length; i++) {
      var parts = pairs[i].split("=");
      if (decodeURIComponent(parts[0]) === name) {
        return decodeURIComponent((parts[1] || "").replace(/\+/g, " "));
      }
    }
    return "";
  }

  function escapeHtml(value) {
    var text = toSafeString(value);
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatUserText(value) {
    return escapeHtml(value).replace(/\r?\n/g, "<br>");
  }

  // Cross-browser event handling
  function addEvent(element, event, handler) {
    if (element) {
      if (element.addEventListener) {
        element.addEventListener(event, handler, false);
      } else if (element.attachEvent) {
        element.attachEvent("on" + event, handler);
      }
    }
  }

  // Advanced Browser Fingerprinting System (Supercookie-style)
  function generateAdvancedFingerprint() {
    var fingerprint = "";
    try {
      var data = {
        // Basic browser info
        userAgent: navigator.userAgent || "",
        language: navigator.language || "",
        languages: (navigator.languages || []).join(","),
        platform: navigator.platform || "",
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack || "",
        onLine: navigator.onLine,

        // Screen and display
        screen: {
          width: screen.width || 0,
          height: screen.height || 0,
          colorDepth: screen.colorDepth || 0,
          pixelDepth: screen.pixelDepth || 0,
          availWidth: screen.availWidth || 0,
          availHeight: screen.availHeight || 0,
        },

        // Timezone and locale
        timezone: new Date().getTimezoneOffset(),
        timezoneString: Intl.DateTimeFormat().resolvedOptions().timeZone || "",

        // Plugins fingerprint
        plugins: getPluginFingerprint(),

        // MIME types fingerprint
        mimeTypes: getMimeTypeFingerprint(),

        // Canvas fingerprint
        canvas: getCanvasFingerprint(),

        // WebGL fingerprint
        webgl: getWebGLFingerprint(),

        // Audio fingerprint
        audio: getAudioFingerprint(),

        // Storage capabilities
        storage: getStorageCapabilities(),

        // Hardware concurrency
        hardwareConcurrency: navigator.hardwareConcurrency || 0,

        // Device memory (if available)
        deviceMemory: navigator.deviceMemory || 0,

        // Connection info (if available)
        connection: getConnectionInfo(),
      };

      fingerprint = btoa(JSON.stringify(data))
        .replace(/[^a-zA-Z0-9]/g, "")
        .substr(0, 64);
    } catch (e) {
      fingerprint = "fallback_" + Math.random().toString(36).substr(2, 16);
    }
    return fingerprint;
  }

  function getPluginFingerprint() {
    try {
      var plugins = [];
      for (var i = 0; i < navigator.plugins.length; i++) {
        var plugin = navigator.plugins[i];
        plugins.push({
          name: plugin.name,
          description: plugin.description,
          filename: plugin.filename,
          length: plugin.length,
        });
      }
      return plugins.slice(0, 10); // Limit to first 10 plugins
    } catch (e) {
      return [];
    }
  }

  function getMimeTypeFingerprint() {
    try {
      var mimeTypes = [];
      for (var i = 0; i < navigator.mimeTypes.length; i++) {
        var mimeType = navigator.mimeTypes[i];
        mimeTypes.push({
          type: mimeType.type,
          description: mimeType.description,
          suffixes: mimeType.suffixes,
        });
      }
      return mimeTypes.slice(0, 20); // Limit to first 20 MIME types
    } catch (e) {
      return [];
    }
  }

  function getCanvasFingerprint() {
    try {
      var canvas = document.createElement("canvas");
      var ctx = canvas.getContext("2d");

      // Draw some text and shapes
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillText("InstaRishta fingerprint", 2, 2);

      // Draw some shapes
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillRect(100, 5, 80, 20);

      return canvas.toDataURL().substr(0, 100); // First 100 chars
    } catch (e) {
      return "canvas_error";
    }
  }

  function getWebGLFingerprint() {
    try {
      var canvas = document.createElement("canvas");
      var gl =
        canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

      if (!gl) return "no_webgl";

      var info = {
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      };

      return JSON.stringify(info).substr(0, 200);
    } catch (e) {
      return "webgl_error";
    }
  }

  function getAudioFingerprint() {
    try {
      var audioContext = window.AudioContext || window.webkitAudioContext;
      if (!audioContext) return "no_audio";

      var context = new audioContext();
      var info = {
        sampleRate: context.sampleRate,
        state: context.state,
        maxChannelCount: context.destination.maxChannelCount,
      };

      context.close();
      return JSON.stringify(info);
    } catch (e) {
      return "audio_error";
    }
  }

  function getStorageCapabilities() {
    var storage = {};

    try {
      storage.localStorage = !!window.localStorage;
    } catch (e) {
      storage.localStorage = false;
    }

    try {
      storage.sessionStorage = !!window.sessionStorage;
    } catch (e) {
      storage.sessionStorage = false;
    }

    try {
      storage.indexedDB = !!window.indexedDB;
    } catch (e) {
      storage.indexedDB = false;
    }

    return storage;
  }

  function getConnectionInfo() {
    try {
      var connection =
        navigator.connection ||
        navigator.mozConnection ||
        navigator.webkitConnection;
      if (!connection) return "no_connection_info";

      return {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
      };
    } catch (e) {
      return "connection_error";
    }
  }

  function getContactUsage() {
    try {
      var stored = localStorage.getItem(app.contactLimit.storageKey);
      if (!stored)
        return {
          fingerprint: generateAdvancedFingerprint(),
          attempts: [],
          lastReset: Date.now(),
        };

      var usage = JSON.parse(stored);
      if (!usage.fingerprint) usage.fingerprint = generateAdvancedFingerprint();
      if (!usage.attempts) usage.attempts = [];
      if (!usage.lastReset) usage.lastReset = Date.now();

      return usage;
    } catch (e) {
      return {
        fingerprint: generateAdvancedFingerprint(),
        attempts: [],
        lastReset: Date.now(),
      };
    }
  }

  function saveContactUsage(usage) {
    try {
      localStorage.setItem(app.contactLimit.storageKey, JSON.stringify(usage));
    } catch (e) {
      console.warn("Could not save contact usage data");
    }
  }

  function cleanOldAttempts(attempts) {
    var now = Date.now();
    var cutoff = now - app.contactLimit.timeWindow;
    return attempts.filter(function (timestamp) {
      return timestamp > cutoff;
    });
  }

  function getRemainingAttempts() {
    var usage = getContactUsage();
    var cleanAttempts = cleanOldAttempts(usage.attempts);

    // Update storage with cleaned attempts
    usage.attempts = cleanAttempts;
    saveContactUsage(usage);

    return Math.max(0, app.contactLimit.maxAttempts - cleanAttempts.length);
  }

  function recordContactAttempt() {
    var usage = getContactUsage();
    usage.attempts = cleanOldAttempts(usage.attempts);
    usage.attempts.push(Date.now());
    saveContactUsage(usage);
  }

  function getTimeUntilReset() {
    var usage = getContactUsage();
    if (usage.attempts.length === 0) return 0;

    var oldestAttempt = Math.min.apply(Math, usage.attempts);
    var resetTime = oldestAttempt + app.contactLimit.timeWindow;
    var now = Date.now();

    return Math.max(0, resetTime - now);
  }

  function formatTimeRemaining(milliseconds) {
    if (milliseconds <= 0) return "now";

    var minutes = Math.floor(milliseconds / (1000 * 60));
    var seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);

    if (minutes > 0) {
      return minutes + " minute" + (minutes !== 1 ? "s" : "");
    } else {
      return seconds + " second" + (seconds !== 1 ? "s" : "");
    }
  }

  // Client-Side Activity Logger (inspired by PHP logger)
  var ActivityLogger = {
    storageKey: "InstaRishtaActivityLog",
    maxLogEntries: 100,

    log: function (action, data) {
      try {
        var entry = {
          timestamp: new Date().toISOString(),
          action: action,
          data: data || {},
          fingerprint: generateAdvancedFingerprint(),
          url: window.location.href,
          userAgent: navigator.userAgent,
        };

        this.saveLog(entry);
      } catch (e) {
        console.warn("Failed to log activity:", e);
      }
    },

    saveLog: function (entry) {
      try {
        var logs = this.getLogs();
        logs.push(entry);

        // Keep only the last maxLogEntries
        if (logs.length > this.maxLogEntries) {
          logs = logs.slice(-this.maxLogEntries);
        }

        localStorage.setItem(this.storageKey, JSON.stringify(logs));
      } catch (e) {
        console.warn("Failed to save log:", e);
      }
    },

    getLogs: function () {
      try {
        var stored = localStorage.getItem(this.storageKey);
        return stored ? JSON.parse(stored) : [];
      } catch (e) {
        return [];
      }
    },

    clearLogs: function () {
      try {
        localStorage.removeItem(this.storageKey);
      } catch (e) {
        console.warn("Failed to clear logs:", e);
      }
    },

    getStats: function () {
      var logs = this.getLogs();
      var stats = {
        totalActions: logs.length,
        uniqueFingerprints: {},
        actionCounts: {},
        lastActivity: null,
      };

      for (var i = 0; i < logs.length; i++) {
        var log = logs[i];
        stats.uniqueFingerprints[log.fingerprint] = true;
        stats.actionCounts[log.action] =
          (stats.actionCounts[log.action] || 0) + 1;
        if (!stats.lastActivity || log.timestamp > stats.lastActivity) {
          stats.lastActivity = log.timestamp;
        }
      }

      stats.uniqueUsers = Object.keys(stats.uniqueFingerprints).length;
      return stats;
    },
  };

  // Admin Analytics System
  var AdminAnalytics = {
    isVisible: false,
    adminCode: "INSTARISHTAADMIN2024", // ðŸ”§ CHANGE THIS: Admin access code

    // Show admin panel with code verification
    showPanel: function (inputCode) {
      if (inputCode !== this.adminCode) {
        alert("âŒ Invalid admin code!");
        return false;
      }

      var panel = $("adminPanel");
      if (panel) {
        panel.style.display = "block";
        this.isVisible = true;
        this.refreshData();
        ActivityLogger.log("admin_panel_accessed", { timestamp: Date.now() });
        return true;
      }
      return false;
    },

    // Hide admin panel
    hidePanel: function () {
      var panel = $("adminPanel");
      if (panel) {
        panel.style.display = "none";
        this.isVisible = false;
      }
    },

    // Refresh analytics data
    refreshData: function () {
      var stats = ActivityLogger.getStats();
      var logs = ActivityLogger.getLogs();

      // Update statistics
      var totalElement = $("adminTotalActions");
      var uniqueElement = $("adminUniqueUsers");
      var contactElement = $("adminContactAttempts");
      var suspiciousElement = $("adminSuspiciousActivity");

      if (totalElement) totalElement.textContent = stats.totalActions;
      if (uniqueElement) uniqueElement.textContent = stats.uniqueUsers;
      if (contactElement)
        contactElement.textContent =
          (stats.actionCounts.contact_attempt || 0) +
          (stats.actionCounts.call_attempt || 0);
      if (suspiciousElement)
        suspiciousElement.textContent =
          stats.actionCounts.suspicious_activity_detected || 0;

      // Update recent activity
      this.updateRecentActivity(logs);
    },

    // Update recent activity display
    updateRecentActivity: function (logs) {
      var container = $("adminRecentActivity");
      if (!container) return;

      var recentLogs = logs.slice(-10).reverse(); // Last 10 activities
      var html = "";

      for (var i = 0; i < recentLogs.length; i++) {
        var log = recentLogs[i];
        var time = new Date(log.timestamp).toLocaleTimeString();
        var action = this.formatActionName(log.action);
        var details = this.formatActionDetails(log);

        html += '<div class="mb-1 pb-1 border-b border-gray-200">';
        html += '<span class="font-medium">' + time + "</span> - ";
        html += '<span class="text-blue-600">' + action + "</span>";
        if (details)
          html +=
            '<br><span class="text-gray-500 text-xs">' + details + "</span>";
        html += "</div>";
      }

      container.innerHTML = html || "No recent activity";
    },

    // Format action names for display
    formatActionName: function (action) {
      var actionMap = {
        page_load: "ðŸŒ Page Load",
        contact_attempt: "ðŸ“ž Contact Attempt",
        call_attempt: "â˜Žï¸ Call Attempt",
        contact_success: "âœ… Contact Success",
        call_success: "âœ… Call Success",
        contact_limit_reached: "ðŸš« Limit Reached",
        call_limit_reached: "ðŸš« Call Limit",
        business_contact_redirect: "ðŸ¢ Business Redirect",
        suspicious_activity_detected: "âš ï¸ Suspicious Activity",
        filters_applied: "ðŸ” Filters Applied",
        heartbeat: "ðŸ’“ Heartbeat",
        admin_panel_accessed: "ðŸ‘¨â€ðŸ’¼ Admin Access",
      };

      return actionMap[action] || action;
    },

    // Format action details
    formatActionDetails: function (log) {
      if (log.action === "filters_applied" && log.data.activeFilters) {
        return (
          "Filters: " +
          log.data.activeFilters.length +
          ", Results: " +
          log.data.resultCount
        );
      }
      if (log.action === "contact_success" || log.action === "call_success") {
        return (
          "User ID: " + log.data.userId + ", Remaining: " + log.data.remaining
        );
      }
      if (log.action === "suspicious_activity_detected" && log.data.flags) {
        return "Flags: " + log.data.flags.join(", ");
      }
      if (log.action === "page_load" && log.data.referrer) {
        return (
          "Referrer: " +
          (log.data.referrer === "direct" ? "Direct" : log.data.referrer)
        );
      }
      return "";
    },

    // Export analytics data
    exportData: function () {
      var stats = ActivityLogger.getStats();
      var logs = ActivityLogger.getLogs();
      var usage = getContactUsage();

      var exportData = {
        timestamp: new Date().toISOString(),
        statistics: stats,
        recentLogs: logs.slice(-50), // Last 50 logs
        contactUsage: {
          fingerprint: usage.fingerprint.substr(0, 16) + "...", // Truncated for privacy
          totalAttempts: usage.attempts.length,
          remainingAttempts: getRemainingAttempts(),
        },
        systemInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
        },
      };

      // Create downloadable file
      var dataStr = JSON.stringify(exportData, null, 2);
      var dataBlob = new Blob([dataStr], { type: "application/json" });
      var url = URL.createObjectURL(dataBlob);

      var link = document.createElement("a");
      link.href = url;
      link.download =
        "InstaRishta-analytics-" +
        new Date().toISOString().split("T")[0] +
        ".json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      ActivityLogger.log("analytics_exported", { recordCount: logs.length });
      showToast("ðŸ“¥ Analytics data exported successfully!");
    },

    // Clear analytics data
    clearData: function () {
      if (
        confirm(
          "âš ï¸ Are you sure you want to clear all analytics data? This cannot be undone!"
        )
      ) {
        ActivityLogger.clearLogs();
        this.refreshData();
        showToast("ðŸ—‘ï¸ Analytics data cleared!");
        ActivityLogger.log("analytics_cleared", { timestamp: Date.now() });
      }
    },

    // Generate email report
    generateEmailReport: function () {
      var stats = ActivityLogger.getStats();
      var logs = ActivityLogger.getLogs();

      var subject =
        "InstaRishta Analytics Report - " + new Date().toLocaleDateString();
      var body = "InstaRishta Analytics Report\\n\\n";
      body += "ðŸ“Š STATISTICS:\\n";
      body += "â€¢ Total Actions: " + stats.totalActions + "\\n";
      body += "â€¢ Unique Users: " + stats.uniqueUsers + "\\n";
      body +=
        "â€¢ Contact Attempts: " +
        ((stats.actionCounts.contact_attempt || 0) +
          (stats.actionCounts.call_attempt || 0)) +
        "\\n";
      body +=
        "â€¢ Suspicious Activity: " +
        (stats.actionCounts.suspicious_activity_detected || 0) +
        "\\n";
      body +=
        "â€¢ Last Activity: " +
        (stats.lastActivity
          ? new Date(stats.lastActivity).toLocaleString()
          : "None") +
        "\\n\\n";

      body += "ðŸ” TOP ACTIONS:\\n";
      var sortedActions = Object.keys(stats.actionCounts).sort(function (a, b) {
        return stats.actionCounts[b] - stats.actionCounts[a];
      });

      for (var i = 0; i < Math.min(5, sortedActions.length); i++) {
        body +=
          "â€¢ " +
          sortedActions[i] +
          ": " +
          stats.actionCounts[sortedActions[i]] +
          "\\n";
      }

      body += "\\nðŸ“ˆ RECENT ACTIVITY:\\n";
      var recentLogs = logs.slice(-5);
      for (var j = 0; j < recentLogs.length; j++) {
        var log = recentLogs[j];
        body +=
          "â€¢ " +
          new Date(log.timestamp).toLocaleString() +
          " - " +
          log.action +
          "\\n";
      }

      body += "\\n---\\nGenerated by InstaRishta Analytics System";

      var mailtoLink =
        "mailto:?subject=" +
        encodeURIComponent(subject) +
        "&body=" +
        encodeURIComponent(body);
      window.open(mailtoLink);

      ActivityLogger.log("email_report_generated", { timestamp: Date.now() });
      showToast("ðŸ“§ Email report generated!");
    },
  };

  // Global admin access functions
  window.showAdminPanel = function (code) {
    return AdminAnalytics.showPanel(code || prompt("ðŸ” Enter admin code:"));
  };

  window.getAnalytics = function () {
    return ActivityLogger.getStats();
  };

  window.getLogs = function () {
    return ActivityLogger.getLogs();
  };

  window.exportAnalytics = function () {
    AdminAnalytics.exportData();
  };

  // Enhanced Security Functions
  function detectSuspiciousActivity() {
    var usage = getContactUsage();
    var logs = ActivityLogger.getLogs();
    var suspiciousFlags = [];

    // Check for rapid attempts
    var recentAttempts = usage.attempts.filter(function (timestamp) {
      return Date.now() - timestamp < 60000; // Last minute
    });

    if (recentAttempts.length > 5) {
      suspiciousFlags.push("rapid_attempts");
    }

    // Check for multiple fingerprints from same session
    var sessionFingerprints = logs
      .filter(function (log) {
        return Date.now() - new Date(log.timestamp).getTime() < 3600000; // Last hour
      })
      .map(function (log) {
        return log.fingerprint;
      });

    var uniqueFingerprints = {};
    for (var i = 0; i < sessionFingerprints.length; i++) {
      uniqueFingerprints[sessionFingerprints[i]] = true;
    }

    if (Object.keys(uniqueFingerprints).length > 3) {
      suspiciousFlags.push("multiple_fingerprints");
    }

    return suspiciousFlags;
  }

  function enhancedSecurityCheck() {
    var suspicious = detectSuspiciousActivity();

    if (suspicious.length > 0) {
      ActivityLogger.log("suspicious_activity_detected", { flags: suspicious });

      // Increase penalty for suspicious users
      if (suspicious.indexOf("rapid_attempts") !== -1) {
        // Reduce remaining attempts for rapid users
        var usage = getContactUsage();
        usage.attempts.push(Date.now()); // Add penalty attempt
        saveContactUsage(usage);
      }
    }

    return suspicious.length === 0;
  }

  // Admin Analytics System
  var AdminAnalytics = {
    secretCode: "admin123", // ðŸ”§ CHANGE THIS: Secret code to access admin panel
    isAuthenticated: false,

    // Backward-compatible aliases used elsewhere in this file
    showPanel: function (inputCode) {
      if (toSafeString(inputCode) !== this.secretCode) {
        alert("Invalid admin code");
        return false;
      }
      this.isAuthenticated = true;
      localStorage.setItem("adminAuth", this.secretCode);
      this.showAdminPanel();
      return true;
    },

    hidePanel: function () {
      this.hideAdminPanel();
    },

    refreshData: function () {
      this.updateAdminStats();
    },
    // Check for admin access via URL parameter or localStorage
    checkAdminAccess: function () {
      var adminParam = getQueryParam("admin");
      var storedAuth = localStorage.getItem("adminAuth");

      if (adminParam === this.secretCode || storedAuth === this.secretCode) {
        this.isAuthenticated = true;
        localStorage.setItem("adminAuth", this.secretCode);
        this.showAdminPanel();
        return true;
      }
      return false;
    },

    // Show admin panel
    showAdminPanel: function () {
      var panel = $("adminPanel");
      if (panel) {
        panel.style.display = "block";
        this.updateAdminStats();
        this.setupAdminEventListeners();
      }
    },

    // Hide admin panel
    hideAdminPanel: function () {
      var panel = $("adminPanel");
      if (panel) {
        panel.style.display = "none";
      }
      localStorage.removeItem("adminAuth");
      this.isAuthenticated = false;
    },

    // Update admin statistics
    updateAdminStats: function () {
      var stats = ActivityLogger.getStats();
      var logs = ActivityLogger.getLogs();

      // Count specific action types
      var contactAttempts = logs.filter(function (log) {
        return (
          log.action === "contact_attempt" || log.action === "call_attempt"
        );
      }).length;

      var suspiciousActivity = logs.filter(function (log) {
        return log.action === "suspicious_activity_detected";
      }).length;

      // Update UI
      var totalElement = $("adminTotalActions");
      var uniqueElement = $("adminUniqueUsers");
      var contactElement = $("adminContactAttempts");
      var suspiciousElement = $("adminSuspiciousActivity");

      if (totalElement) totalElement.textContent = stats.totalActions;
      if (uniqueElement) uniqueElement.textContent = stats.uniqueUsers;
      if (contactElement) contactElement.textContent = contactAttempts;
      if (suspiciousElement) suspiciousElement.textContent = suspiciousActivity;

      // Update recent activity
      this.updateRecentActivity();
    },

    // Update recent activity list
    updateRecentActivity: function () {
      var container = $("adminRecentActivity");
      if (!container) return;

      var logs = ActivityLogger.getLogs().slice(-10).reverse(); // Last 10 activities
      var html = "";

      for (var i = 0; i < logs.length; i++) {
        var log = logs[i];
        var time = new Date(log.timestamp).toLocaleTimeString();
        html += "<div class='mb-1 pb-1 border-b'>";
        html += "<strong>" + time + "</strong> - " + log.action;
        if (log.data && log.data.userId) {
          html += " (User: " + log.data.userId + ")";
        }
        html += "</div>";
      }

      container.innerHTML = html || "No recent activity";
    },

    // Export analytics data
    exportData: function () {
      var data = {
        stats: ActivityLogger.getStats(),
        logs: ActivityLogger.getLogs(),
        contactUsage: getContactUsage(),
        exportTime: new Date().toISOString(),
      };

      var blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download =
        "InstaRishta-analytics-" +
        new Date().toISOString().split("T")[0] +
        ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast("Analytics data exported successfully!");
    },

    // Clear analytics data
    clearData: function () {
      if (
        confirm(
          "Are you sure you want to clear all analytics data? This cannot be undone."
        )
      ) {
        ActivityLogger.clearLogs();
        localStorage.removeItem(app.contactLimit.storageKey);
        this.updateAdminStats();
        showToast("Analytics data cleared successfully!");
      }
    },

    // Generate email report
    generateEmailReport: function () {
      var stats = ActivityLogger.getStats();
      var logs = ActivityLogger.getLogs();

      var report = "InstaRishta Analytics Report\n";
      report += "Generated: " + new Date().toLocaleString() + "\n\n";
      report += "SUMMARY:\n";
      report += "- Total Actions: " + stats.totalActions + "\n";
      report += "- Unique Users: " + stats.uniqueUsers + "\n";
      report +=
        "- Contact Attempts: " +
        logs.filter(function (l) {
          return l.action.indexOf("contact") !== -1;
        }).length +
        "\n";
      report +=
        "- Suspicious Activity: " +
        logs.filter(function (l) {
          return l.action === "suspicious_activity_detected";
        }).length +
        "\n\n";

      report += "TOP ACTIONS:\n";
      for (var action in stats.actionCounts) {
        report += "- " + action + ": " + stats.actionCounts[action] + "\n";
      }

      // Create mailto link
      var subject = encodeURIComponent(
        "InstaRishta Analytics Report - " + new Date().toLocaleDateString()
      );
      var body = encodeURIComponent(report);
      var mailtoLink = "mailto:?subject=" + subject + "&body=" + body;

      window.open(mailtoLink);
    },

    // Setup admin event listeners
    setupAdminEventListeners: function () {
      var self = this;

      var closeBtn = $("closeAdminPanel");
      if (closeBtn) {
        addEvent(closeBtn, "click", function () {
          self.hideAdminPanel();
        });
      }

      var exportBtn = $("exportAnalytics");
      if (exportBtn) {
        addEvent(exportBtn, "click", function () {
          self.exportData();
        });
      }

      var clearBtn = $("clearAnalytics");
      if (clearBtn) {
        addEvent(clearBtn, "click", function () {
          self.clearData();
        });
      }

      var refreshBtn = $("refreshAnalytics");
      if (refreshBtn) {
        addEvent(refreshBtn, "click", function () {
          self.updateAdminStats();
          showToast("Analytics refreshed!");
        });
      }

      var emailBtn = $("emailAnalytics");
      if (emailBtn) {
        addEvent(emailBtn, "click", function () {
          self.generateEmailReport();
        });
      }
    },
  };

  // Debounce function
  function debounce(func, wait) {
    var timeout;
    return function () {
      var context = this;
      var args = arguments;
      var later = function () {
        timeout = null;
        func.apply(context, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // AJAX function for cross-browser compatibility
  function makeRequest(url, callback, errorCallback) {
    var xhr;

    if (window.XMLHttpRequest) {
      xhr = new XMLHttpRequest();
    } else if (window.ActiveXObject) {
      try {
        xhr = new ActiveXObject("Msxml2.XMLHTTP");
      } catch (e) {
        try {
          xhr = new ActiveXObject("Microsoft.XMLHTTP");
        } catch (e2) {
          if (errorCallback) errorCallback("Browser not supported");
          return;
        }
      }
    }

    if (!xhr) {
      if (errorCallback) errorCallback("Cannot create XMLHttpRequest");
      return;
    }

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        var successStatus =
          (xhr.status >= 200 && xhr.status < 300) ||
          xhr.status === 304 ||
          (xhr.status === 0 && !!xhr.responseText);

        if (successStatus) {
          try {
            var data = JSON.parse(xhr.responseText);
            callback(data);
          } catch (e) {
            if (errorCallback) {
              errorCallback("Invalid JSON response from " + url);
            }
          }
        } else {
          if (errorCallback) {
            errorCallback("HTTP Error " + xhr.status + " from " + url);
          }
        }
      }
    };

    xhr.onerror = function () {
      if (errorCallback) errorCallback("Network error while loading " + url);
    };

    xhr.ontimeout = function () {
      if (errorCallback) errorCallback("Request timeout while loading " + url);
    };

    try {
      xhr.open("GET", url, true);
      xhr.timeout = 20000;
      xhr.send();
    } catch (e) {
      if (errorCallback) {
        errorCallback("Request failed for " + url + ": " + e.message);
      }
    }
  }

  // Initialize application
  function init() {
    // Log page load
    ActivityLogger.log("page_load", {
      timestamp: Date.now(),
      referrer: document.referrer || "direct",
    });

    // Check for admin access
    AdminAnalytics.checkAdminAccess();

    setupEventListeners();
    setupThemeSystem();
    startTypingAnimation();
    loadUsers();
    setupOverlayAndFab();
    updateContactLimitIndicator();

    // Update contact limit indicator every 30 seconds
    setInterval(updateContactLimitIndicator, 30000);

    // Update admin stats every 30 seconds if authenticated
    setInterval(function () {
      if (AdminAnalytics.isAuthenticated) {
        AdminAnalytics.updateAdminStats();
      }
    }, 30000);

    // Log user activity periodically
    setInterval(function () {
      ActivityLogger.log("heartbeat", {
        scrollPosition: window.pageYOffset,
        activeFilters: app.appliedFilters.length,
      });
    }, 300000); // Every 5 minutes
  }

  function updateContactLimitIndicator() {
    var indicator = $("contactLimitIndicator");
    var remainingElement = $("remainingContacts");
    var timerElement = $("resetTimer");

    if (!indicator || !remainingElement || !timerElement) return;

    var remaining = getRemainingAttempts();
    var timeUntilReset = getTimeUntilReset();

    remainingElement.textContent = remaining;

    if (remaining === 0) {
      timerElement.textContent =
        "Resets in " + formatTimeRemaining(timeUntilReset);
      indicator.style.background = "linear-gradient(135deg, #fef2f2, #fee2e2)";
      indicator.style.borderColor = "#ef4444";
      remainingElement.style.color = "#dc2626";
    } else if (remaining <= 3) {
      timerElement.textContent =
        "Resets in " + formatTimeRemaining(timeUntilReset);
      indicator.style.background = "linear-gradient(135deg, #fffbeb, #fef3c7)";
      indicator.style.borderColor = "#f59e0b";
      remainingElement.style.color = "#d97706";
    } else {
      timerElement.textContent = "Resets every hour";
      indicator.style.background = "linear-gradient(135deg, #f0f9ff, #e0f2fe)";
      indicator.style.borderColor = "#0ea5e9";
      remainingElement.style.color = "#0284c7";
    }
  }

  // Theme system
  function setupThemeSystem() {
    // Load saved theme
    var savedTheme = localStorage.getItem("theme") || "system";
    app.currentTheme = savedTheme;
    applyTheme(savedTheme);
    updateThemeUI();

    // Theme toggle button
    var themeToggle = $("themeToggle");
    if (themeToggle) {
      addEvent(themeToggle, "click", function (e) {
        e.stopPropagation();
        toggleThemeDropdown();
      });
    }

    // Theme options
    var themeOptions = document.querySelectorAll(".theme-option");
    for (var i = 0; i < themeOptions.length; i++) {
      (function (option) {
        addEvent(option, "click", function () {
          var theme = option.getAttribute("data-theme");
          setTheme(theme);
          closeThemeDropdown();
        });
      })(themeOptions[i]);
    }

    // Close dropdown when clicking outside
    addEvent(document, "click", function (e) {
      var dropdown = $("themeDropdown");
      var toggle = $("themeToggle");
      if (
        dropdown &&
        toggle &&
        !dropdown.contains(e.target) &&
        !toggle.contains(e.target)
      ) {
        closeThemeDropdown();
      }
    });

    // System theme detection
    if (window.matchMedia) {
      var mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      addEvent(mediaQuery, "change", function () {
        if (app.currentTheme === "system") {
          applySystemTheme();
        }
      });
    }
  }

  function toggleThemeDropdown() {
    var dropdown = $("themeDropdown");
    if (dropdown) {
      app.themeDropdownOpen = !app.themeDropdownOpen;
      if (app.themeDropdownOpen) {
        addClass(dropdown, "show");
      } else {
        removeClass(dropdown, "show");
      }
    }
  }

  function closeThemeDropdown() {
    var dropdown = $("themeDropdown");
    if (dropdown) {
      app.themeDropdownOpen = false;
      removeClass(dropdown, "show");
    }
  }

  function setTheme(theme) {
    app.currentTheme = theme;
    localStorage.setItem("theme", theme);
    applyTheme(theme);
    updateThemeUI();
  }

  function applyTheme(theme) {
    var body = document.body;

    // Remove all theme classes
    removeClass(body, "data-theme");
    body.removeAttribute("data-theme");

    if (theme === "system") {
      applySystemTheme();
    } else {
      body.setAttribute("data-theme", theme);
    }
  }

  function applySystemTheme() {
    var body = document.body;
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      body.setAttribute("data-theme", "dark");
    } else {
      body.removeAttribute("data-theme");
    }
  }

  function updateThemeUI() {
    // Update active theme option
    var themeOptions = document.querySelectorAll(".theme-option");
    for (var i = 0; i < themeOptions.length; i++) {
      removeClass(themeOptions[i], "active");
      if (themeOptions[i].getAttribute("data-theme") === app.currentTheme) {
        addClass(themeOptions[i], "active");
      }
    }

    // Update theme icon
    var themeIcon = $("themeIcon");
    if (themeIcon) {
      var iconSvg = getThemeIcon(app.currentTheme);
      themeIcon.innerHTML = iconSvg;
    }
  }

  function getThemeIcon(theme) {
    switch (theme) {
      case "system":
        return '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>';
      case "for-you":
        return '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>';
      case "dark":
        return '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
      case "light":
        return '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
      default:
        return '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>';
    }
  }

  // Setup all event listeners
  function setupEventListeners() {
    // Desktop filters
    var desktopSearch = $("searchInput");
    if (desktopSearch) {
      addEvent(
        desktopSearch,
        "input",
        debounce(function () {
          app.searchTerm = desktopSearch.value.trim();
          syncMobileInput("mobileSearchInput", app.searchTerm);
          resetPagination();
          applyFilters();
        }, 300)
      );
    }

    var desktopIdFilter = $("idFilter");
    if (desktopIdFilter) {
      addEvent(
        desktopIdFilter,
        "input",
        debounce(function () {
          app.idFilter = desktopIdFilter.value.trim();
          syncMobileInput("mobileIdFilter", app.idFilter);
          resetPagination();
          applyFilters();
        }, 300)
      );
    }

    var desktopSort = $("sortOrder");
    if (desktopSort) {
      addEvent(desktopSort, "change", function () {
        app.sortOrder = desktopSort.value;
        syncMobileSelect("mobileSortOrder", app.sortOrder);
        resetPagination();
        applyFilters();
      });
    }

    var desktopEducation = $("educationFilter");
    if (desktopEducation) {
      addEvent(desktopEducation, "change", function () {
        app.educationFilter = desktopEducation.value;
        syncMobileSelect("mobileEducationFilter", app.educationFilter);
        resetPagination();
        applyFilters();
      });
    }

    // Mobile filters
    var mobileSearch = $("mobileSearchInput");
    if (mobileSearch) {
      addEvent(
        mobileSearch,
        "input",
        debounce(function () {
          app.searchTerm = mobileSearch.value.trim();
          syncDesktopInput("searchInput", app.searchTerm);
          resetPagination();
          applyFilters();
        }, 300)
      );
    }

    var mobileIdFilter = $("mobileIdFilter");
    if (mobileIdFilter) {
      addEvent(
        mobileIdFilter,
        "input",
        debounce(function () {
          app.idFilter = mobileIdFilter.value.trim();
          syncDesktopInput("idFilter", app.idFilter);
          resetPagination();
          applyFilters();
        }, 300)
      );
    }

    var mobileSort = $("mobileSortOrder");
    if (mobileSort) {
      addEvent(mobileSort, "change", function () {
        app.sortOrder = mobileSort.value;
        syncDesktopSelect("sortOrder", app.sortOrder);
        resetPagination();
        applyFilters();
      });
    }

    var mobileEducation = $("mobileEducationFilter");
    if (mobileEducation) {
      addEvent(mobileEducation, "change", function () {
        app.educationFilter = mobileEducation.value;
        syncDesktopSelect("educationFilter", app.educationFilter);
        resetPagination();
        applyFilters();
      });
    }

    // Gender tabs (both desktop and mobile)
    var genderTabs = document.querySelectorAll(".gender-tab, .gender-grid a");
    for (var i = 0; i < genderTabs.length; i++) {
      (function (tab) {
        var gender = tab.getAttribute("data-gender");
        addEvent(tab, "click", function (e) {
          e.preventDefault();
          handleGenderFilter(gender);
        });

        // Touch events for mobile
        addEvent(tab, "touchend", function (e) {
          e.preventDefault();
          handleGenderFilter(gender);
        });
      })(genderTabs[i]);
    }

    // Mobile drawer controls
    var openDrawer = $("openDrawer");
    if (openDrawer) {
      addEvent(openDrawer, "click", function () {
        toggleDrawer(true);
      });
      addEvent(openDrawer, "touchend", function (e) {
        e.preventDefault();
        toggleDrawer(true);
      });
    }

    var closeDrawer = $("closeDrawer");
    if (closeDrawer) {
      addEvent(closeDrawer, "click", function () {
        toggleDrawer(false);
      });
      addEvent(closeDrawer, "touchend", function (e) {
        e.preventDefault();
        toggleDrawer(false);
      });
    }

    // Clear all filters buttons
    var clearAllBtn = $("clearAllFilters");
    if (clearAllBtn) {
      addEvent(clearAllBtn, "click", clearAllFilters);
      addEvent(clearAllBtn, "touchend", function (e) {
        e.preventDefault();
        clearAllFilters();
      });
    }

    var clearAllMobileBtn = $("clearAllFiltersMobile");
    if (clearAllMobileBtn) {
      addEvent(clearAllMobileBtn, "click", clearAllFilters);
      addEvent(clearAllMobileBtn, "touchend", function (e) {
        e.preventDefault();
        clearAllFilters();
      });
    }

    // Drawer overlay
    var drawerOverlay = $("drawerOverlay");
    if (drawerOverlay) {
      addEvent(drawerOverlay, "click", function () {
        toggleDrawer(false);
      });
    }

    // Infinite scroll
    addEvent(window, "scroll", debounce(handleScroll, 100));

    // Admin panel event listeners
    setupAdminEventListeners();
  }

  function setupAdminEventListeners() {
    var closeBtn = $("closeAdminPanel");
    if (closeBtn) {
      addEvent(closeBtn, "click", function () {
        AdminAnalytics.hidePanel();
      });
    }

    var exportBtn = $("exportAnalytics");
    if (exportBtn) {
      addEvent(exportBtn, "click", function () {
        AdminAnalytics.exportData();
      });
    }

    var clearBtn = $("clearAnalytics");
    if (clearBtn) {
      addEvent(clearBtn, "click", function () {
        AdminAnalytics.clearData();
      });
    }

    var refreshBtn = $("refreshAnalytics");
    if (refreshBtn) {
      addEvent(refreshBtn, "click", function () {
        AdminAnalytics.refreshData();
        showToast("ðŸ”„ Analytics refreshed!");
      });
    }

    var emailBtn = $("emailAnalytics");
    if (emailBtn) {
      addEvent(emailBtn, "click", function () {
        AdminAnalytics.generateEmailReport();
      });
    }

    // Secret admin access: Triple-click on logo
    var logo = document.querySelector("h1");
    if (logo) {
      var clickCount = 0;
      var clickTimer = null;

      addEvent(logo, "click", function () {
        clickCount++;

        if (clickCount === 1) {
          clickTimer = setTimeout(function () {
            clickCount = 0;
          }, 1000);
        } else if (clickCount === 3) {
          clearTimeout(clickTimer);
          clickCount = 0;
          showAdminPanel();
        }
      });
    }
  }

  function setupOverlayAndFab() {
    // This function is called from init to set up overlay and FAB
    // Implementation is already handled in setupEventListeners
  }

  // Sync input values between desktop and mobile
  function syncMobileInput(mobileId, value) {
    var mobileInput = $(mobileId);
    if (mobileInput) {
      mobileInput.value = value;
    }
  }

  function syncDesktopInput(desktopId, value) {
    var desktopInput = $(desktopId);
    if (desktopInput) {
      desktopInput.value = value;
    }
  }

  function syncMobileSelect(mobileId, value) {
    var mobileSelect = $(mobileId);
    if (mobileSelect) {
      mobileSelect.value = value;
    }
  }

  function syncDesktopSelect(desktopId, value) {
    var desktopSelect = $(desktopId);
    if (desktopSelect) {
      desktopSelect.value = value;
    }
  }

  // Toggle mobile drawer
  function toggleDrawer(open) {
    var drawer = $("mobileDrawer");
    var overlay = $("drawerOverlay");
    if (!drawer || !overlay) return;

    app.drawerOpen = open;

    if (open) {
      removeClass(drawer, "closed");
      addClass(drawer, "open");
      addClass(overlay, "show");
    } else {
      removeClass(drawer, "open");
      addClass(drawer, "closed");
      removeClass(overlay, "show");
    }
  }

  // Load users data
  function loadUsers() {
    app.loading = true;
    showLoading();
    app.allUsers = [];
    app.filteredUsers = [];
    app.displayedUsers = [];

    var sources = getDataSources();
    app.dataSources = sources.slice(0);

    loadUsersFromSourceIndex(0, []);
  }

  function getDataSources() {
    var sources = [];
    var config = window.INSTA_RISHTA_CONFIG || {};
    var querySource = getQueryParam("data");
    var remoteDefault =
      "https://raw.githubusercontent.com/majidomri/liverishtey/main/jsdata.json";
    var defaultSources = [
      "jsdata.json",
      "data/jsdata.json",
      "js/jsdata.json",
      remoteDefault,
    ];

    if (querySource) {
      sources.push(querySource);
    }

    if (isArray(config.dataSources)) {
      for (var i = 0; i < config.dataSources.length; i++) {
        sources.push(config.dataSources[i]);
      }
    } else if (config.dataUrl) {
      sources.push(config.dataUrl);
    }

    var metaDataUrl = document.querySelector('meta[name="instarishta-data-url"]');
    if (metaDataUrl && metaDataUrl.getAttribute("content")) {
      sources.push(metaDataUrl.getAttribute("content"));
    }

    for (var j = 0; j < defaultSources.length; j++) {
      sources.push(defaultSources[j]);
    }

    // Remove empty and duplicate entries while preserving order
    var cleanSources = [];
    var seen = {};
    for (var k = 0; k < sources.length; k++) {
      var source = toSafeString(sources[k]);
      if (!source) continue;
      if (!seen[source]) {
        seen[source] = true;
        cleanSources.push(source);
      }
    }

    return cleanSources;
  }

  function loadUsersFromSourceIndex(index, errors) {
    if (index >= app.dataSources.length) {
      app.loading = false;
      updateStatistics();
      var detail = errors.length ? " Details: " + errors[errors.length - 1] : "";
      showError("Failed to load user data." + detail);
      return;
    }

    var source = app.dataSources[index];

    makeRequest(
      source,
      function (data) {
        try {
          var users = processUserData(data);
          if (!users.length) {
            throw new Error("No valid user records found");
          }
          app.allUsers = users;
          app.activeDataSource = source;
          app.loading = false;
          console.info("InstaRishta data loaded from:", source, "records:", users.length);
          hideLoading();
          applyFilters();
        } catch (error) {
          console.warn("Data source parse failed:", source, error);
          errors.push(source + ": " + error.message);
          loadUsersFromSourceIndex(index + 1, errors);
        }
      },
      function (error) {
        console.warn("Data source request failed:", source, error);
        errors.push(source + ": " + error);
        loadUsersFromSourceIndex(index + 1, errors);
      }
    );
  }

  // Process raw JSON data into structured format
  function processUserData(rawData) {
    var users = extractUserArray(rawData);
    var processedUsers = [];

    for (var i = 0; i < users.length; i++) {
      var processedUser = normalizeUserRecord(users[i], i);
      if (processedUser) {
        processedUsers.push(processedUser);
      }
    }

    return processedUsers;
  }

  function extractUserArray(rawData) {
    if (!rawData) return [];

    if (typeof rawData === "string") {
      try {
        rawData = JSON.parse(rawData);
      } catch (e) {
        return [];
      }
    }

    if (isArray(rawData)) {
      return rawData;
    }

    if (!isObject(rawData)) {
      return [];
    }

    var containerKeys = ["data", "users", "results", "items", "records", "profiles"];
    for (var i = 0; i < containerKeys.length; i++) {
      var list = rawData[containerKeys[i]];
      if (isArray(list)) {
        return list;
      }
    }

    // Handle object maps keyed by id
    var mapped = [];
    for (var key in rawData) {
      if (!Object.prototype.hasOwnProperty.call(rawData, key)) continue;
      if (isObject(rawData[key])) {
        mapped.push(rawData[key]);
      }
    }

    return mapped;
  }

  function normalizeUserRecord(user, index) {
    if (!isObject(user)) return null;

    var id = pickFirst(user, ["id", "ID", "lr_id", "user_id", "profile_id"]);
    if (id === "" || id === null || id === undefined) {
      id = 2000 + index;
    }

    var title = toSafeString(
      pickFirst(user, ["title", "heading", "name", "profile_title"])
    );
    var body = toSafeString(
      pickFirst(user, ["body", "description", "text", "details", "about"])
    );
    var education = toSafeString(
      pickFirst(user, ["education", "qualification", "edu"])
    );
    var priority = toSafeString(
      pickFirst(user, ["priority", "status", "tag"])
    ).toLowerCase();
    var dateValue = pickFirst(user, ["date", "created_at", "createdAt", "timestamp"]);
    var phone = toSafeString(
      pickFirst(user, ["phone", "phone_number", "mobile", "contact"])
    );
    var whatsapp = toSafeString(
      pickFirst(user, ["whatsapp", "wa", "whatsApp", "whatsapp_number", "mobile"])
    );
    var age = toSafeString(pickFirst(user, ["age"]));
    var urgentValue = toSafeString(
      pickFirst(user, ["urgent", "isUrgent", "is_urgent"])
    ).toLowerCase();
    var urgentFlag =
      urgentValue === "true" ||
      urgentValue === "1" ||
      urgentValue === "urgent" ||
      pickFirst(user, ["urgent", "isUrgent", "is_urgent"]) === true;

    var normalized = {
      id: id,
      title: title || "\u0636\u0631\u0648\u0631\u062A \u0631\u0634\u062A\u06C1",
      phone: phone.replace(/[^\d+]/g, ""),
      whatsapp: whatsapp.replace(/[^\d+]/g, ""),
      age: age,
      body: body,
      gender: detectGender({
        gender: pickFirst(user, ["gender", "sex"]),
        body: body,
        title: title,
      }),
      priority: priority || (urgentFlag ? "urgent" : "normal"),
      date: normalizeDate(dateValue),
      education: education || extractEducation(body),
      urgent: urgentFlag || priority === "urgent",
    };

    return normalized;
  }

  function normalizeDate(value) {
    var fallback = new Date().toISOString();
    var dateText = toSafeString(value);
    if (!dateText) return fallback;

    var parsed = new Date(dateText);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }

    var numeric = parseInt(dateText, 10);
    if (!isNaN(numeric)) {
      if (numeric < 1000000000000) {
        numeric = numeric * 1000; // seconds -> milliseconds
      }
      var fromNumber = new Date(numeric);
      if (!isNaN(fromNumber.getTime())) {
        return fromNumber.toISOString();
      }
    }

    return fallback;
  }

  // Detect gender from user data
  function detectGender(user) {
    var explicit = toSafeString(user.gender).toLowerCase();
    if (explicit) {
      if (
        explicit.indexOf("female") !== -1 ||
        explicit.indexOf("girl") !== -1 ||
        explicit.indexOf("\u062E\u0627\u062A\u0648\u0646") !== -1
      ) {
        return "female";
      }
      if (
        explicit.indexOf("male") !== -1 ||
        explicit.indexOf("boy") !== -1 ||
        explicit.indexOf("\u0645\u0631\u062F") !== -1
      ) {
        return "male";
      }
    }

    var text =
      (user.body || "").toLowerCase() + " " + (user.title || "").toLowerCase();

    if (
      text.indexOf("\u0644\u0691\u06A9\u06CC") !== -1 ||
      text.indexOf("girl") !== -1 ||
      text.indexOf("female") !== -1 ||
      text.indexOf("daughter") !== -1 ||
      text.indexOf("\u0628\u06CC\u0679\u06CC") !== -1
    ) {
      return "female";
    } else if (
      text.indexOf("\u0644\u0691\u06A9\u0627") !== -1 ||
      text.indexOf("boy") !== -1 ||
      text.indexOf("male") !== -1 ||
      text.indexOf("son") !== -1 ||
      text.indexOf("\u0628\u06CC\u0679\u0627") !== -1
    ) {
      return "male";
    }

    return "unknown";
  }

  // Extract education from description
  function extractEducation(text) {
    if (!text) return "";

    var educationKeywords = [
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

    var upperText = text.toUpperCase();
    for (var i = 0; i < educationKeywords.length; i++) {
      if (upperText.indexOf(educationKeywords[i].toUpperCase()) !== -1) {
        return educationKeywords[i];
      }
    }

    return "";
  }

  // Event handlers
  function handleGenderFilter(gender) {
    app.genderFilter = gender;

    // Update all gender tabs (both desktop and mobile)
    var allTabs = document.querySelectorAll(".gender-tab, .gender-grid a");
    for (var i = 0; i < allTabs.length; i++) {
      removeClass(allTabs[i], "active");

      if (allTabs[i].getAttribute("data-gender") === gender) {
        addClass(allTabs[i], "active");
      }
    }

    resetPagination();
    applyFilters();
  }

  function handleScroll() {
    if (app.loading) return;

    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var windowHeight =
      window.innerHeight || document.documentElement.clientHeight;
    var documentHeight = document.documentElement.scrollHeight;

    if (scrollTop + windowHeight >= documentHeight - 500) {
      if (app.displayedUsers.length < app.filteredUsers.length) {
        loadMore();
      }
    }
  }

  // Apply all filters
  function applyFilters() {
    var filtered = app.allUsers.slice();
    var previousFiltersCount = app.appliedFilters.length;
    app.appliedFilters = [];

    // Search filter
    if (app.searchTerm) {
      filtered = filtered.filter(function (user) {
        var searchText = (user.body + " " + user.title).toLowerCase();
        return searchText.indexOf(app.searchTerm.toLowerCase()) !== -1;
      });
      app.appliedFilters.push({ name: "Search", value: app.searchTerm });
    }

    // ID filter
    if (app.idFilter) {
      filtered = filtered.filter(function (user) {
        return user.id.toString().indexOf(app.idFilter) !== -1;
      });
      app.appliedFilters.push({ name: "ID", value: app.idFilter });
    }

    // Gender filter
    if (app.genderFilter !== "all") {
      filtered = filtered.filter(function (user) {
        return user.gender === app.genderFilter;
      });
      app.appliedFilters.push({
        name: "Gender",
        value:
          app.genderFilter.charAt(0).toUpperCase() + app.genderFilter.slice(1),
      });
    }

    // Education filter
    if (app.educationFilter) {
      filtered = filtered.filter(function (user) {
        return (
          user.education
            .toLowerCase()
            .indexOf(app.educationFilter.toLowerCase()) !== -1
        );
      });
      app.appliedFilters.push({
        name: "Education",
        value: app.educationFilter,
      });
    }

    // Log filter changes
    if (app.appliedFilters.length !== previousFiltersCount) {
      ActivityLogger.log("filters_applied", {
        activeFilters: app.appliedFilters,
        resultCount: filtered.length,
        totalUsers: app.allUsers.length,
      });
    }

    // Sort
    filtered.sort(function (a, b) {
      var aTime = Date.parse(a.date);
      var bTime = Date.parse(b.date);
      if (isNaN(aTime)) aTime = 0;
      if (isNaN(bTime)) bTime = 0;

      switch (app.sortOrder) {
        case "dateAsc":
          return aTime - bTime;
        case "dateDesc":
          return bTime - aTime;
        case "userUrgent":
          if (a.urgent && !b.urgent) return -1;
          if (!a.urgent && b.urgent) return 1;
          return bTime - aTime;
        default:
          return bTime - aTime;
      }
    });

    app.filteredUsers = filtered;
    updateDisplayedUsers();
    updateStatistics();
    updateFilterChips();
  }

  function updateDisplayedUsers() {
    var endIndex = app.currentPage * app.usersPerPage;
    app.displayedUsers = app.filteredUsers.slice(0, endIndex);

    renderUsers();
  }

  function renderUsers() {
    var container = $("userList");
    var noResults = $("noResults");

    if (!container || !noResults) return;

    if (app.displayedUsers.length === 0) {
      addClass(container, "hidden");
      removeClass(noResults, "hidden");
      return;
    }

    removeClass(container, "hidden");
    addClass(noResults, "hidden");

    container.innerHTML = "";

    for (var i = 0; i < app.displayedUsers.length; i++) {
      var userCard = createUserCard(app.displayedUsers[i]);
      container.appendChild(userCard);
    }
  }

  function createUserCard(user) {
    var card = document.createElement("div");
    card.className =
      "card card-hover fade-in relative" + (user.urgent ? " urgent" : "");

    var urgentBadge = user.urgent
      ? '<div class="urgent-badge">URGENT</div>'
      : "";

    var genderText =
      user.gender === "female"
        ? "\u0644\u0691\u06A9\u06CC"
        : user.gender === "male"
        ? "\u0644\u0691\u06A9\u0627"
        : "";
    var displayTitle =
      toSafeString(user.title) ||
      "\u0636\u0631\u0648\u0631\u062A \u0631\u0634\u062A\u06C1 " + genderText;
    var safeTitle = formatUserText(displayTitle);
    var safeBody = formatUserText(user.body || "");
    var safeId = escapeHtml(String(user.id));

    card.innerHTML =
      urgentBadge +
      '<h2 class="font-urdu text-lg font-semibold mb-3">' +
      safeTitle +
      "</h2>" +
      '<p class="font-urdu text-gray-700 mb-4 leading-relaxed">' +
      safeBody +
      "</p>" +
      '<div class="card-meta">' +
      "<small>Date: " +
      formatDate(user.date) +
      "</small>" +
      "</div>" +
      '<div class="card-actions">' +
      '<button class="action-btn contact-btn" data-id="' +
      user.id +
      '">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>' +
      "</svg>" +
      "</button>" +
      '<button class="action-btn call-btn" data-id="' +
      user.id +
      '">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>' +
      "</svg>" +
      "</button>" +
      '<button class="action-btn biodata-btn" data-id="' +
      user.id +
      '">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>' +
      '<polyline points="14,2 14,8 20,8"></polyline>' +
      '<line x1="16" y1="13" x2="8" y2="13"></line>' +
      '<line x1="16" y1="17" x2="8" y2="17"></line>' +
      '<polyline points="10,9 9,9 8,9"></polyline>' +
      "</svg>" +
      "</button>" +
      '<button class="action-btn id-btn" data-id="' +
      user.id +
      '">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>' +
      '<line x1="16" y1="2" x2="16" y2="6"></line>' +
      '<line x1="8" y1="2" x2="8" y2="6"></line>' +
      '<line x1="3" y1="10" x2="21" y2="10"></line>' +
      "</svg>" +
      '<div class="tooltip">LR ID: ' +
      safeId +
      "</div>" +
      "</button>" +
      "</div>";

    // Add event listeners
    var contactBtn = card.querySelector(".contact-btn");
    var callBtn = card.querySelector(".call-btn");
    var biodataBtn = card.querySelector(".biodata-btn");
    var idBtn = card.querySelector(".id-btn");

    if (contactBtn) {
      addEvent(contactBtn, "click", function (e) {
        e.preventDefault();
        handleContact(user);
      });
      addEvent(contactBtn, "touchend", function (e) {
        e.preventDefault();
        handleContact(user);
      });
    }

    if (callBtn) {
      addEvent(callBtn, "click", function (e) {
        e.preventDefault();
        handleCall(user);
      });
      addEvent(callBtn, "touchend", function (e) {
        e.preventDefault();
        handleCall(user);
      });
    }

    if (biodataBtn) {
      addEvent(biodataBtn, "click", function (e) {
        e.preventDefault();
        handleViewBiodata(user);
      });
      addEvent(biodataBtn, "touchend", function (e) {
        e.preventDefault();
        handleViewBiodata(user);
      });
    }

    if (idBtn) {
      addEvent(idBtn, "click", function (e) {
        e.preventDefault();
        handleIdClick(user);
      });
      addEvent(idBtn, "touchend", function (e) {
        e.preventDefault();
        handleIdClick(user);
      });
    }

    return card;
  }

  function formatDate(dateString) {
    try {
      var date = new Date(dateString);
      if (isNaN(date.getTime())) return toSafeString(dateString);
      return date.toLocaleDateString("en-GB");
    } catch (e) {
      return toSafeString(dateString);
    }
  }

  function handleContact(user) {
    // Log the contact attempt
    ActivityLogger.log("contact_attempt", {
      userId: user.id,
      userGender: user.gender,
    });

    // Enhanced security check
    if (!enhancedSecurityCheck()) {
      showToast("Suspicious activity detected. Please try again later.");
      return;
    }

    var remaining = getRemainingAttempts();

    if (remaining > 0) {
      // User has attempts remaining - show real contact
      recordContactAttempt();
      ActivityLogger.log("contact_success", {
        userId: user.id,
        remaining: remaining - 1,
      });

      if (user.whatsapp) {
        window.open("https://wa.me/" + user.whatsapp, "_blank");
      } else {
        alert("Contact: " + (user.phone || "No contact information available"));
      }

      // Update indicator and show remaining attempts
      updateContactLimitIndicator();
      var newRemaining = getRemainingAttempts();
      if (newRemaining > 0) {
        showToast(
          newRemaining +
            " contact" +
            (newRemaining !== 1 ? "s" : "") +
            " remaining this hour"
        );
      } else {
        var resetTime = formatTimeRemaining(getTimeUntilReset());
        showToast("Contact limit reached. Resets in " + resetTime);
      }
    } else {
      // No attempts remaining - redirect to business contact
      ActivityLogger.log("contact_limit_reached", { userId: user.id });
      var resetTime = formatTimeRemaining(getTimeUntilReset());

      if (
        confirm(
          "You've reached the hourly contact limit (10 contacts/hour).\n\nFor unlimited access, contact our support team now!\n\nAccess resets in " +
            resetTime +
            "\n\nClick OK to contact support, Cancel to wait."
        )
      ) {
        ActivityLogger.log("business_contact_redirect", { type: "whatsapp" });
        window.open(
          "https://wa.me/" +
            app.contactLimit.businessWhatsApp +
            "?text=Hi! I need unlimited access to InstaRishta contacts.",
          "_blank"
        );
      }
    }
  }

  function handleCall(user) {
    // Log the call attempt
    ActivityLogger.log("call_attempt", {
      userId: user.id,
      userGender: user.gender,
    });

    // Enhanced security check
    if (!enhancedSecurityCheck()) {
      showToast("Suspicious activity detected. Please try again later.");
      return;
    }

    var remaining = getRemainingAttempts();

    if (remaining > 0) {
      // User has attempts remaining - show real phone
      recordContactAttempt();
      ActivityLogger.log("call_success", {
        userId: user.id,
        remaining: remaining - 1,
      });

      if (user.phone) {
        window.open("tel:" + user.phone, "_self");
      } else {
        alert("No phone number available");
      }

      // Update indicator and show remaining attempts
      updateContactLimitIndicator();
      var newRemaining = getRemainingAttempts();
      if (newRemaining > 0) {
        showToast(
          newRemaining +
            " call" +
            (newRemaining !== 1 ? "s" : "") +
            " remaining this hour"
        );
      } else {
        var resetTime = formatTimeRemaining(getTimeUntilReset());
        showToast("Contact limit reached. Resets in " + resetTime);
      }
    } else {
      // No attempts remaining - redirect to business phone
      ActivityLogger.log("call_limit_reached", { userId: user.id });
      var resetTime = formatTimeRemaining(getTimeUntilReset());

      if (
        confirm(
          "You've reached the hourly contact limit (10 contacts/hour).\n\nFor unlimited access, call our support team now!\n\nAccess resets in " +
            resetTime +
            "\n\nClick OK to call support, Cancel to wait."
        )
      ) {
        ActivityLogger.log("business_contact_redirect", { type: "phone" });
        window.open("tel:" + app.contactLimit.businessPhone, "_self");
      }
    }
  }

  function handleViewBiodata(user) {
    // Open biodata in new page/tab
    var biodataUrl = "https://instagram.com/instarishta__/" + user.id;
    window.open(biodataUrl, "_blank");
  }

  function handleIdClick(user) {
    // Copy ID to clipboard
    if (navigator.clipboard) {
      navigator.clipboard.writeText("LR" + user.id).then(function () {
        showToast("ID copied to clipboard!");
      });
    } else {
      // Fallback for older browsers
      var textArea = document.createElement("textarea");
      textArea.value = "LR" + user.id;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        showToast("ID copied to clipboard!");
      } catch (err) {
        console.error("Could not copy text: ", err);
      }
      document.body.removeChild(textArea);
    }
  }

  function showToast(message) {
    // Simple toast notification
    var toast = document.createElement("div");
    toast.style.cssText =
      "position:fixed;top:20px;right:20px;background:#333;color:#fff;padding:12px 16px;border-radius:8px;z-index:10000;font-size:14px;";
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(function () {
      document.body.removeChild(toast);
    }, 2000);
  }

  function updateStatistics() {
    var totalElement = $("totalAds");
    var maleElement = $("maleProfiles");
    var femaleElement = $("femaleProfiles");
    var urgentElement = $("urgentAds");

    var total = app.filteredUsers.length;
    var maleCount = 0;
    var femaleCount = 0;
    var urgentCount = 0;

    for (var i = 0; i < app.filteredUsers.length; i++) {
      var user = app.filteredUsers[i];
      if (user.gender === "male") maleCount++;
      if (user.gender === "female") femaleCount++;
      if (user.urgent) urgentCount++;
    }

    if (totalElement) totalElement.textContent = total;
    if (maleElement) maleElement.textContent = maleCount;
    if (femaleElement) femaleElement.textContent = femaleCount;
    if (urgentElement) urgentElement.textContent = urgentCount;
  }

  function updateFilterChips() {
    var container = $("filterChips");
    if (!container) return;

    // Clear existing chips (except label)
    var chips = container.querySelectorAll(".filter-chip");
    for (var i = 0; i < chips.length; i++) {
      container.removeChild(chips[i]);
    }

    if (app.appliedFilters.length === 0) {
      container.style.display = "none";
      return;
    }

    container.style.display = "flex";

    for (var i = 0; i < app.appliedFilters.length; i++) {
      var filter = app.appliedFilters[i];
      var chip = document.createElement("div");
      chip.className = "filter-chip";
      chip.innerHTML =
        '<span class="chip-label">' +
        filter.name +
        ": " +
        filter.value +
        "</span>" +
        '<button class="chip-close" data-filter="' +
        filter.name +
        '">&times;</button>';

      var removeBtn = chip.querySelector(".chip-close");
      if (removeBtn) {
        (function (filterName) {
          addEvent(removeBtn, "click", function () {
            removeFilter(filterName);
          });
          addEvent(removeBtn, "touchend", function (e) {
            e.preventDefault();
            removeFilter(filterName);
          });
        })(filter.name);
      }

      container.appendChild(chip);
    }
  }

  function removeFilter(filterName) {
    switch (filterName) {
      case "Search":
        app.searchTerm = "";
        syncDesktopInput("searchInput", "");
        syncMobileInput("mobileSearchInput", "");
        break;
      case "ID":
        app.idFilter = "";
        syncDesktopInput("idFilter", "");
        syncMobileInput("mobileIdFilter", "");
        break;
      case "Gender":
        handleGenderFilter("all");
        break;
      case "Education":
        app.educationFilter = "";
        syncDesktopSelect("educationFilter", "");
        syncMobileSelect("mobileEducationFilter", "");
        break;
    }

    resetPagination();
    applyFilters();
  }

  function clearAllFilters() {
    app.searchTerm = "";
    app.idFilter = "";
    app.genderFilter = "all";
    app.educationFilter = "";
    app.sortOrder = "dateDesc";

    // Clear desktop inputs
    syncDesktopInput("searchInput", "");
    syncDesktopInput("idFilter", "");
    syncDesktopSelect("educationFilter", "");
    syncDesktopSelect("sortOrder", "dateDesc");

    // Clear mobile inputs
    syncMobileInput("mobileSearchInput", "");
    syncMobileInput("mobileIdFilter", "");
    syncMobileSelect("mobileEducationFilter", "");
    syncMobileSelect("mobileSortOrder", "dateDesc");

    handleGenderFilter("all");
    resetPagination();
    applyFilters();
  }

  function loadMore() {
    if (app.loading || app.displayedUsers.length >= app.filteredUsers.length)
      return;

    app.currentPage++;
    updateDisplayedUsers();
  }

  function resetPagination() {
    app.currentPage = 1;
  }

  function showLoading() {
    var loading = $("loading");
    var grid = $("userList");

    if (loading) removeClass(loading, "hidden");
    if (grid) addClass(grid, "hidden");
  }

  function hideLoading() {
    var loading = $("loading");
    if (loading) addClass(loading, "hidden");
  }

  function showError(message) {
    app.loading = false;
    var loading = $("loading");
    var grid = $("userList");
    var noResults = $("noResults");

    if (grid) addClass(grid, "hidden");
    if (noResults) addClass(noResults, "hidden");
    if (loading) {
      removeClass(loading, "hidden");
      loading.innerHTML =
        '<p style="color: #ef4444; font-weight: 500;">' + message + "</p>";
    }
  }

  // Typing animation
  function startTypingAnimation() {
    typeText();
  }

  function typeText() {
    var container = $("typingText");
    if (!container) return;

    var currentText = app.typingTexts[app.currentTextIndex];

    if (app.typingDirection === "forward") {
      app.currentCharIndex++;

      if (app.currentCharIndex > currentText.length) {
        app.typingDirection = "backward";
        setTimeout(typeText, app.pauseDuration);
        return;
      }
    } else {
      app.currentCharIndex--;

      if (app.currentCharIndex < 0) {
        app.currentCharIndex = 0;
        app.typingDirection = "forward";
        app.currentTextIndex =
          (app.currentTextIndex + 1) % app.typingTexts.length;
        setTimeout(typeText, app.typingSpeed);
        return;
      }
    }

    var displayText = currentText.substring(0, app.currentCharIndex);
    container.innerHTML = displayText;

    var speed =
      app.typingDirection === "forward" ? app.typingSpeed : app.typingSpeed / 2;
    setTimeout(typeText, speed);
  }

  // Initialize when DOM is ready
  function domReady(callback) {
    if (document.readyState === "loading") {
      addEvent(document, "DOMContentLoaded", callback);
    } else {
      callback();
    }
  }

  // Start the application
  domReady(init);
})();

