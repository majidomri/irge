// LiveRishtey - Enhanced ES5 Compatible Implementation
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
      maxAttempts: 10,
      timeWindow: 60 * 60 * 1000, // 1 hour in milliseconds
      businessWhatsApp: "+923001234567", // Replace with your business WhatsApp
      businessPhone: "+923001234567", // Replace with your business phone
      storageKey: "InstaRishtaContactUsage",
    },

    // Typing animation
    typingTexts: ["Search & Filter Ads", "Try InstaRishta", "Daily 1000 Ads"],
    currentTextIndex: 0,
    currentCharIndex: 0,
    typingDirection: "forward",
    typingSpeed: 150,
    pauseDuration: 1500,
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

  // Contact Limiting System Functions
  function generateBrowserFingerprint() {
    var fingerprint = "";
    try {
      fingerprint = btoa(
        (screen.width || 0) +
          (screen.height || 0) +
          (navigator.userAgent || "") +
          (navigator.language || "") +
          (new Date().getTimezoneOffset() || 0)
      );
    } catch (e) {
      fingerprint = "fallback_" + Math.random().toString(36).substr(2, 9);
    }
    return fingerprint;
  }

  function getContactUsage() {
    try {
      var stored = localStorage.getItem(app.contactLimit.storageKey);
      if (!stored)
        return {
          fingerprint: generateBrowserFingerprint(),
          attempts: [],
          lastReset: Date.now(),
        };

      var usage = JSON.parse(stored);
      if (!usage.fingerprint) usage.fingerprint = generateBrowserFingerprint();
      if (!usage.attempts) usage.attempts = [];
      if (!usage.lastReset) usage.lastReset = Date.now();

      return usage;
    } catch (e) {
      return {
        fingerprint: generateBrowserFingerprint(),
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
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            callback(data);
          } catch (e) {
            if (errorCallback) errorCallback("Invalid JSON response");
          }
        } else {
          if (errorCallback) errorCallback("HTTP Error: " + xhr.status);
        }
      }
    };

    try {
      xhr.open("GET", url, true);
      xhr.send();
    } catch (e) {
      if (errorCallback) errorCallback("Request failed: " + e.message);
    }
  }

  // Initialize application
  function init() {
    setupEventListeners();
    setupThemeSystem();
    startTypingAnimation();
    loadUsers();
    setupOverlayAndFab();
    updateContactLimitIndicator();

    // Update contact limit indicator every 30 seconds
    setInterval(updateContactLimitIndicator, 30000);
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

    var url =
      "https://raw.githubusercontent.com/majidomri/liverishtey/main/jsdata.json";

    makeRequest(
      url,
      function (data) {
        try {
          app.allUsers = processUserData(data);
          app.loading = false;
          hideLoading();
          applyFilters();
        } catch (error) {
          console.error("Error processing data:", error);
          showError("Failed to process user data");
        }
      },
      function (error) {
        console.error("Error loading data:", error);
        showError("Failed to load user data. Please try again.");
      }
    );
  }

  // Process raw JSON data into structured format
  function processUserData(rawData) {
    var processedUsers = [];

    for (var i = 0; i < rawData.length; i++) {
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
    }

    return processedUsers;
  }

  // Detect gender from user data
  function detectGender(user) {
    if (user.gender) {
      return user.gender.toLowerCase();
    }

    var text =
      (user.body || "").toLowerCase() + " " + (user.title || "").toLowerCase();

    if (
      text.indexOf("لڑکی") !== -1 ||
      text.indexOf("girl") !== -1 ||
      text.indexOf("female") !== -1 ||
      text.indexOf("daughter") !== -1 ||
      text.indexOf("بیٹی") !== -1
    ) {
      return "female";
    } else if (
      text.indexOf("لڑکا") !== -1 ||
      text.indexOf("boy") !== -1 ||
      text.indexOf("male") !== -1 ||
      text.indexOf("son") !== -1 ||
      text.indexOf("بیٹا") !== -1
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
      switch (app.sortOrder) {
        case "dateAsc":
          return new Date(a.date) - new Date(b.date);
        case "dateDesc":
          return new Date(b.date) - new Date(a.date);
        case "userUrgent":
          if (a.urgent && !b.urgent) return -1;
          if (!a.urgent && b.urgent) return 1;
          return new Date(b.date) - new Date(a.date);
        default:
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
    card.className = "card card-hover fade-in relative";

    var urgentBadge = user.urgent
      ? '<div class="urgent-badge">URGENT</div>'
      : "";

    var genderText =
      user.gender === "female" ? "لڑکی" : user.gender === "male" ? "لڑکا" : "";
    var displayTitle = user.title || "ضرورت رشتہ " + genderText;

    card.innerHTML =
      urgentBadge +
      '<h2 class="font-urdu text-lg font-semibold mb-3">' +
      displayTitle +
      "</h2>" +
      '<p class="font-urdu text-gray-700 mb-4 leading-relaxed">' +
      (user.body || "") +
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
      user.id +
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
      return date.toLocaleDateString("en-GB");
    } catch (e) {
      return dateString;
    }
  }

  function handleContact(user) {
    var remaining = getRemainingAttempts();

    if (remaining > 0) {
      // User has attempts remaining - show real contact
      recordContactAttempt();

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
      var resetTime = formatTimeRemaining(getTimeUntilReset());

      if (
        confirm(
          "You've reached the hourly contact limit (10 contacts/hour).\n\nFor unlimited access, contact our support team now!\n\nAccess resets in " +
            resetTime +
            "\n\nClick OK to contact support, Cancel to wait."
        )
      ) {
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
    var remaining = getRemainingAttempts();

    if (remaining > 0) {
      // User has attempts remaining - show real phone
      recordContactAttempt();

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
      var resetTime = formatTimeRemaining(getTimeUntilReset());

      if (
        confirm(
          "You've reached the hourly contact limit (10 contacts/hour).\n\nFor unlimited access, call our support team now!\n\nAccess resets in " +
            resetTime +
            "\n\nClick OK to call support, Cancel to wait."
        )
      ) {
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
    var loading = $("loading");
    if (loading) {
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
