// LiveRishtey Core - Essential Functions
(function () {
  "use strict";

  // Core utilities
  function $(id) {
    return document.getElementById(id);
  }

  function addClass(element, className) {
    if (element && element.classList) {
      element.classList.add(className);
    } else if (element) {
      element.className += " " + className;
    }
  }

  function removeClass(element, className) {
    if (element && element.classList) {
      element.classList.remove(className);
    } else if (element) {
      element.className = element.className.replace(
        new RegExp("\\b" + className + "\\b", "g"),
        ""
      );
    }
  }

  function addEvent(element, event, handler) {
    if (element.addEventListener) {
      element.addEventListener(event, handler, false);
    } else if (element.attachEvent) {
      element.attachEvent("on" + event, handler);
    }
  }

  // Application state
  window.app = {
    allUsers: [],
    filteredUsers: [],
    displayedUsers: [],
    loading: false,
    currentPage: 1,
    usersPerPage: 20,
    searchTerm: "",
    idFilter: "",
    genderFilter: "all",
    educationFilter: "",
    sortOrder: "dateDesc",
    appliedFilters: [],
    drawerOpen: false,
    currentTheme: "system",
    typingTexts: ["Search & Filter Ads", "Find Your Match", "Daily Updates"],
    currentTextIndex: 0,
    currentCharIndex: 0,
    typingDirection: "forward",
    typingSpeed: 100,
    pauseDuration: 2000,

    // Contact limiting configuration
    contactLimit: {
      maxAttempts: 10, // 🔧 CHANGE: Number of contacts allowed
      timeWindow: 60 * 60 * 1000, // 🔧 CHANGE: Time window in milliseconds
      // Examples:
      // - 30 minutes: 30 * 60 * 1000
      // - 2 hours: 2 * 60 * 60 * 1000
      // - 1 day: 24 * 60 * 60 * 1000
      // - 1 week: 7 * 24 * 60 * 60 * 1000

      businessWhatsApp: "+923001234567", // 🔧 CHANGE: Your WhatsApp number
      businessPhone: "+923001234567", // 🔧 CHANGE: Your phone number
      storageKey: "liverishtey_contact_usage",
    },
  };

  // Core data loading
  function makeRequest(url, successCallback, errorCallback) {
    try {
      var xhr = new XMLHttpRequest();

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            try {
              var data = JSON.parse(xhr.responseText);
              if (successCallback) successCallback(data);
            } catch (parseError) {
              if (errorCallback) errorCallback("Failed to parse response");
            }
          } else {
            if (errorCallback) errorCallback("Request failed: " + xhr.status);
          }
        }
      };

      xhr.onerror = function () {
        if (errorCallback) errorCallback("Network error");
      };

      xhr.ontimeout = function () {
        if (errorCallback) errorCallback("Request timeout");
      };

      xhr.open("GET", url, true);
      xhr.timeout = 30000;
      xhr.send();
    } catch (e) {
      if (errorCallback) errorCallback("Request failed: " + e.message);
    }
  }

  function loadUsers() {
    app.loading = true;
    showLoading();

    var url =
      "https://raw.githubusercontent.com/majidomri/liverishtey/main/jsdata.json";

    makeRequest(
      url,
      function (data) {
        app.allUsers = processUserData(data);
        app.loading = false;
        hideLoading();
        applyFilters();
      },
      function (error) {
        showError("Failed to load data: " + error);
      }
    );
  }

  function processUserData(rawData) {
    var processedUsers = [];

    for (var i = 0; i < rawData.length; i++) {
      try {
        var user = rawData[i];

        var processedUser = {
          id: user.id || 2000 + i,
          title: user.title || "ضرورت رشتہ",
          phone: user.phone || "",
          whatsapp: user.whatsapp || "",
          age: user.age || "",
          body: user.body || "",
          gender: detectGender(user),
          priority: user.priority || "normal",
          date: user.date || new Date().toISOString(),
          education: user.education || extractEducation(user.body || ""),
          urgent: user.priority && user.priority.toLowerCase() === "urgent",
        };

        processedUsers.push(processedUser);
      } catch (error) {
        console.error("Error processing user", i, ":", error);
      }
    }

    return processedUsers;
  }

  function detectGender(user) {
    if (user.gender) {
      return user.gender.toLowerCase();
    }

    var text =
      (user.body || "").toLowerCase() + " " + (user.title || "").toLowerCase();

    if (
      text.indexOf("لڑکی") !== -1 ||
      text.indexOf("girl") !== -1 ||
      text.indexOf("female") !== -1
    ) {
      return "female";
    } else if (
      text.indexOf("لڑکا") !== -1 ||
      text.indexOf("boy") !== -1 ||
      text.indexOf("male") !== -1
    ) {
      return "male";
    }

    return "unknown";
  }

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
      "Graduate",
      "Masters",
      "Bachelor",
      "Degree",
      "Intermediate",
      "Inter",
    ];

    var upperText = text.toUpperCase();
    for (var i = 0; i < educationKeywords.length; i++) {
      if (upperText.indexOf(educationKeywords[i].toUpperCase()) !== -1) {
        return educationKeywords[i];
      }
    }

    return "";
  }

  // Core filtering
  function applyFilters() {
    var filtered = app.allUsers.slice();
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

    // Sort
    filtered.sort(function (a, b) {
      if (app.sortOrder === "dateAsc") {
        return new Date(a.date) - new Date(b.date);
      } else if (app.sortOrder === "urgent") {
        return b.urgent - a.urgent;
      } else {
        return new Date(b.date) - new Date(a.date);
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

  // Core UI functions
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
    var loading = $("loading");
    if (loading) {
      loading.innerHTML =
        '<p style="color: #ef4444; font-weight: 500;">' + message + "</p>";
    }
  }

  function showToast(message) {
    // Simple toast implementation
    var toast = document.createElement("div");
    toast.textContent = message;
    toast.style.cssText =
      "position:fixed;top:20px;right:20px;background:#333;color:white;padding:12px 20px;border-radius:6px;z-index:10000;";
    document.body.appendChild(toast);

    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 3000);
  }

  // Export core functions to global scope
  window.LiveRishteyCore = {
    $: $,
    addClass: addClass,
    removeClass: removeClass,
    addEvent: addEvent,
    makeRequest: makeRequest,
    loadUsers: loadUsers,
    applyFilters: applyFilters,
    showLoading: showLoading,
    hideLoading: hideLoading,
    showError: showError,
    showToast: showToast,
  };

  // Initialize core
  function initCore() {
    loadUsers();
  }

  // Start when DOM is ready
  if (document.readyState === "loading") {
    addEvent(document, "DOMContentLoaded", initCore);
  } else {
    initCore();
  }
})();
