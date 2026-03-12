// LiveRishtey Contacts - Contact Limiting and Interaction Functions
(function () {
  "use strict";

  // Wait for core to be ready
  if (!window.LiveRishteyCore || !window.app) {
    setTimeout(arguments.callee, 100);
    return;
  }

  var $ = window.LiveRishteyCore.$;
  var showToast = window.LiveRishteyCore.showToast;

  // Advanced browser fingerprinting
  function generateAdvancedFingerprint() {
    var fingerprint = {
      screen:
        screen.width + "x" + screen.height + "x" + (screen.colorDepth || ""),
      timezone: new Date().getTimezoneOffset(),
      language: navigator.language || navigator.userLanguage || "",
      platform: navigator.platform || "",
      userAgent: navigator.userAgent || "",
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack || "",
      hardwareConcurrency: navigator.hardwareConcurrency || 0,
      deviceMemory: navigator.deviceMemory || 0,
      connection: navigator.connection
        ? navigator.connection.effectiveType
        : "",
      plugins: [],
      mimeTypes: [],
      canvas: "",
      webgl: "",
      audio: "",
    };

    // Plugin fingerprinting
    try {
      for (var i = 0; i < navigator.plugins.length; i++) {
        fingerprint.plugins.push(navigator.plugins[i].name);
      }
    } catch (e) {}

    // MIME type fingerprinting
    try {
      for (var j = 0; j < navigator.mimeTypes.length; j++) {
        fingerprint.mimeTypes.push(navigator.mimeTypes[j].type);
      }
    } catch (e) {}

    // Canvas fingerprinting
    try {
      var canvas = document.createElement("canvas");
      var ctx = canvas.getContext("2d");
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillText("LiveRishtey fingerprint", 2, 2);
      fingerprint.canvas = canvas.toDataURL();
    } catch (e) {}

    // WebGL fingerprinting
    try {
      var gl = document.createElement("canvas").getContext("webgl");
      if (gl) {
        fingerprint.webgl =
          gl.getParameter(gl.RENDERER) + "|" + gl.getParameter(gl.VENDOR);
      }
    } catch (e) {}

    // Audio fingerprinting
    try {
      var audioContext = window.AudioContext || window.webkitAudioContext;
      if (audioContext) {
        var context = new audioContext();
        fingerprint.audio =
          context.sampleRate + "|" + context.destination.maxChannelCount;
      }
    } catch (e) {}

    // Create hash from fingerprint
    var fingerprintString = JSON.stringify(fingerprint);
    var hash = 0;
    for (var k = 0; k < fingerprintString.length; k++) {
      var char = fingerprintString.charCodeAt(k);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36);
  }

  // Contact usage tracking
  function getContactUsage() {
    var fingerprint = generateAdvancedFingerprint();
    var storageKey = app.contactLimit.storageKey;
    var now = Date.now();

    try {
      var stored = localStorage.getItem(storageKey);
      var usage = stored ? JSON.parse(stored) : {};

      if (!usage[fingerprint]) {
        usage[fingerprint] = { attempts: [], firstSeen: now };
      }

      // Clean old attempts outside time window
      var timeWindow = app.contactLimit.timeWindow;
      usage[fingerprint].attempts = usage[fingerprint].attempts.filter(
        function (timestamp) {
          return now - timestamp < timeWindow;
        }
      );

      return {
        fingerprint: fingerprint,
        usage: usage,
        remaining: Math.max(
          0,
          app.contactLimit.maxAttempts - usage[fingerprint].attempts.length
        ),
        resetTime:
          usage[fingerprint].attempts.length > 0
            ? usage[fingerprint].attempts[0] + timeWindow
            : now + timeWindow,
      };
    } catch (e) {
      return {
        fingerprint: fingerprint,
        usage: {},
        remaining: app.contactLimit.maxAttempts,
        resetTime: now + app.contactLimit.timeWindow,
      };
    }
  }

  function recordContactAttempt() {
    var contactData = getContactUsage();
    var now = Date.now();

    try {
      contactData.usage[contactData.fingerprint].attempts.push(now);
      localStorage.setItem(
        app.contactLimit.storageKey,
        JSON.stringify(contactData.usage)
      );

      // Also store in cookies as backup
      var cookieData = contactData.fingerprint + ":" + now;
      document.cookie =
        "lr_contact=" +
        cookieData +
        "; max-age=" +
        app.contactLimit.timeWindow / 1000;

      updateContactLimitIndicator();
      return true;
    } catch (e) {
      return false;
    }
  }

  function updateContactLimitIndicator() {
    var indicator = $("contactLimitIndicator");
    if (!indicator) return;

    var contactData = getContactUsage();
    var remaining = contactData.remaining;
    var resetTime = new Date(contactData.resetTime);
    var now = new Date();
    var timeUntilReset = Math.max(0, resetTime - now);

    var hours = Math.floor(timeUntilReset / (1000 * 60 * 60));
    var minutes = Math.floor((timeUntilReset % (1000 * 60 * 60)) / (1000 * 60));

    var statusClass = "";
    if (remaining > 7) statusClass = "text-green-600";
    else if (remaining > 3) statusClass = "text-yellow-600";
    else statusClass = "text-red-600";

    var resetText = "";
    if (hours > 0) {
      resetText = "Resets in " + hours + "h " + minutes + "m";
    } else if (minutes > 0) {
      resetText = "Resets in " + minutes + " minutes";
    } else {
      resetText = "Resets soon";
    }

    indicator.innerHTML =
      '<div class="' +
      statusClass +
      ' font-semibold text-xl">' +
      remaining +
      "</div>" +
      '<div class="text-sm">Contacts Remaining</div>' +
      '<div class="text-xs text-gray-500">' +
      resetText +
      "</div>";
  }

  // Contact handlers
  function handleContact(userId) {
    var contactData = getContactUsage();

    if (contactData.remaining <= 0) {
      var confirmMessage =
        "You've reached your contact limit (" +
        app.contactLimit.maxAttempts +
        " per hour).\n\n" +
        "Would you like to contact our support team for unlimited access?\n\n" +
        "We'll connect you with our team who can help you get premium access.";

      if (confirm(confirmMessage)) {
        var message = encodeURIComponent(
          "Hi! I need unlimited access to LiveRishtey contacts. I've reached my hourly limit."
        );
        var whatsappUrl =
          "https://wa.me/" +
          app.contactLimit.businessWhatsApp.replace(/[^0-9]/g, "") +
          "?text=" +
          message;
        window.open(whatsappUrl, "_blank");
        showToast("Redirected to our support team for unlimited access!");
      }
      return;
    }

    var user = findUserById(userId);
    if (!user) {
      showToast("User not found");
      return;
    }

    if (!user.whatsapp) {
      showToast("WhatsApp contact not available");
      return;
    }

    recordContactAttempt();

    var message = encodeURIComponent(
      "Hi! I'm interested in your profile from LiveRishtey (ID: LR" +
        user.id +
        ")"
    );
    var whatsappUrl =
      "https://wa.me/" +
      user.whatsapp.replace(/[^0-9]/g, "") +
      "?text=" +
      message;
    window.open(whatsappUrl, "_blank");

    showToast(
      "Opening WhatsApp... (" +
        (contactData.remaining - 1) +
        " contacts remaining)"
    );
  }

  function handleCall(userId) {
    var contactData = getContactUsage();

    if (contactData.remaining <= 0) {
      var confirmMessage =
        "You've reached your contact limit (" +
        app.contactLimit.maxAttempts +
        " per hour).\n\n" +
        "Would you like to call our support team for unlimited access?";

      if (confirm(confirmMessage)) {
        window.location.href =
          "tel:" + app.contactLimit.businessPhone.replace(/[^0-9+]/g, "");
        showToast("Calling our support team for unlimited access!");
      }
      return;
    }

    var user = findUserById(userId);
    if (!user) {
      showToast("User not found");
      return;
    }

    if (!user.phone) {
      showToast("Phone contact not available");
      return;
    }

    recordContactAttempt();

    window.location.href = "tel:" + user.phone.replace(/[^0-9+]/g, "");
    showToast(
      "Initiating call... (" +
        (contactData.remaining - 1) +
        " contacts remaining)"
    );
  }

  function handleBiodata(userId) {
    var user = findUserById(userId);
    if (!user) {
      showToast("User not found");
      return;
    }

    var biodataUrl = "biodata.html?id=" + user.id;
    window.open(biodataUrl, "_blank");
    showToast("Opening biodata in new tab");
  }

  function handleIdCopy(displayId) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(displayId)
          .then(function () {
            showToast("ID copied: " + displayId);
          })
          .catch(function () {
            fallbackCopyToClipboard(displayId);
          });
      } else {
        fallbackCopyToClipboard(displayId);
      }
    } catch (e) {
      fallbackCopyToClipboard(displayId);
    }
  }

  function fallbackCopyToClipboard(text) {
    try {
      var textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      var successful = document.execCommand("copy");
      document.body.removeChild(textArea);

      if (successful) {
        showToast("ID copied: " + text);
      } else {
        showToast("Copy failed. ID: " + text);
      }
    } catch (e) {
      showToast("Copy not supported. ID: " + text);
    }
  }

  function findUserById(userId) {
    for (var i = 0; i < app.allUsers.length; i++) {
      if (app.allUsers[i].id == userId) {
        return app.allUsers[i];
      }
    }
    return null;
  }

  // Export contact functions
  window.LiveRishteyContacts = {
    generateAdvancedFingerprint: generateAdvancedFingerprint,
    getContactUsage: getContactUsage,
    updateContactLimitIndicator: updateContactLimitIndicator,
  };

  // Make handlers global
  window.handleContact = handleContact;
  window.handleCall = handleCall;
  window.handleBiodata = handleBiodata;
  window.handleIdCopy = handleIdCopy;

  // Initialize contact system
  function initContacts() {
    updateContactLimitIndicator();

    // Update indicator every minute
    setInterval(updateContactLimitIndicator, 60000);
  }

  // Start contact initialization
  if (document.readyState === "loading") {
    window.LiveRishteyCore.addEvent(document, "DOMContentLoaded", initContacts);
  } else {
    initContacts();
  }
})();
