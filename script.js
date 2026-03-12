// LiveRishtey - Complete Final ES5 Compatible Implementation
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

    // Typing animation
    typingTexts: ["Search & Filter Ads", "Try LiveRishtey", "Daily 1000 Ads"],
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
    startTypingAnimation();
    loadUsers();
    try {
      setupOverlayAndFab();
    } catch (e) {
      console.warn("setupOverlayAndFab failed", e);
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
    var genderTabs = document.querySelectorAll(".tab-list a");
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

    // Clear all filters button
    var clearAllBtn = $("clearAllFilters");
    if (clearAllBtn) {
      addEvent(clearAllBtn, "click", clearAllFilters);
      addEvent(clearAllBtn, "touchend", function (e) {
        e.preventDefault();
        clearAllFilters();
      });
    }

    // desktop clear button (separate id)
    var clearAllDesk = $("clearAllFiltersDesktop");
    if (clearAllDesk) {
      addEvent(clearAllDesk, "click", clearAllFilters);
      addEvent(clearAllDesk, "touchend", function (e) {
        e.preventDefault();
        clearAllFilters();
      });
    }

    // Infinite scroll
    addEvent(window, "scroll", debounce(handleScroll, 100));
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
    if (!drawer) return;

    app.drawerOpen = open;

    var overlay = $("drawerOverlay");

    if (open) {
      // Save previously focused element to restore later
      try {
        app._prevFocus = document.activeElement;
      } catch (e) {}

      removeClass(drawer, "closed");
      addClass(drawer, "open");
      if (overlay) {
        addClass(overlay, "show");
        try {
          overlay.setAttribute("aria-hidden", "false");
        } catch (e) {}
      }
      try {
        drawer.setAttribute("aria-hidden", "false");
        drawer.setAttribute("aria-modal", "true");
      } catch (e) {}

      // update FAB state
      try {
        var fab = $("openDrawer");
        if (fab) fab.setAttribute("aria-expanded", "true");
      } catch (e) {}

      // Trap focus inside drawer
      trapFocus(drawer);
    } else {
      removeClass(drawer, "open");
      addClass(drawer, "closed");
      if (overlay) {
        removeClass(overlay, "show");
        try {
          overlay.setAttribute("aria-hidden", "true");
        } catch (e) {}
      }
      try {
        drawer.setAttribute("aria-hidden", "true");
        drawer.setAttribute("aria-modal", "false");
      } catch (e) {}

      // update FAB state
      try {
        var fab2 = $("openDrawer");
        if (fab2) fab2.setAttribute("aria-expanded", "false");
      } catch (e) {}

      // Release focus trap and restore focus
      releaseFocusTrap();
      try {
        if (app._prevFocus && typeof app._prevFocus.focus === "function")
          app._prevFocus.focus();
      } catch (e) {}
    }
  }

  /* Focus trap helpers */
  var _trap = {
    root: null,
    lastKeydownHandler: null,
  };

  function getFocusableElements(root) {
    if (!root) return [];
    var selector =
      'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    var nodes = root.querySelectorAll(selector);
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.offsetParent !== null || n === document.activeElement) out.push(n);
    }
    return out;
  }

  function trapFocus(root) {
    releaseFocusTrap();
    _trap.root = root;

    var focusable = getFocusableElements(root);
    if (focusable.length) {
      try {
        focusable[0].focus();
      } catch (e) {}
    }

    _trap.lastKeydownHandler = function (e) {
      if (e.key === "Tab" || e.keyCode === 9) {
        var f = getFocusableElements(_trap.root);
        if (!f.length) {
          e.preventDefault();
          return;
        }
        var first = f[0];
        var last = f[f.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            try {
              last.focus();
            } catch (er) {}
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            try {
              first.focus();
            } catch (er) {}
          }
        }
      }
    };

    addEvent(document, "keydown", _trap.lastKeydownHandler);
  }

  function releaseFocusTrap() {
    if (_trap.lastKeydownHandler) {
      try {
        document.removeEventListener("keydown", _trap.lastKeydownHandler);
      } catch (e) {}
      _trap.lastKeydownHandler = null;
    }
    _trap.root = null;
  }

  // Overlay and keyboard handlers
  function setupOverlayAndFab() {
    var overlay = $("drawerOverlay");
    if (overlay) {
      addEvent(overlay, "click", function () {
        toggleDrawer(false);
      });
    }

    // Close on ESC
    addEvent(document, "keydown", function (e) {
      var key = e.key || e.keyCode;
      if (key === "Escape" || key === "Esc" || key === 27) {
        toggleDrawer(false);
      }
    });

    // FAB visibility: visible on mobile (<=768px) when drawer is closed, hidden on desktop
    var fab = $("openDrawer");
    function applyFabVisibilityByViewport() {
      if (!fab) return;
      if (window.innerWidth > 768) {
        fab.style.display = "none";
      } else {
        fab.style.display = app.drawerOpen ? "none" : "flex";
      }
    }
    addEvent(window, "resize", applyFabVisibilityByViewport);
    // initial
    setTimeout(applyFabVisibilityByViewport, 50);

    // Add swipe-to-close touch handlers for mobile drawer
    var drawer = $("mobileDrawer");
    if (drawer) {
      var startY = 0;
      var currentY = 0;
      var dragging = false;
      var drawerHeight = 0;
      var lastTouchTime = 0;

      function onTouchStart(e) {
        if (!e.touches || !e.touches.length) return;
        startY = e.touches[0].clientY;
        currentY = startY;
        dragging = false;
        drawerHeight =
          drawer.getBoundingClientRect().height || window.innerHeight * 0.6;
        lastTouchTime = Date.now();
      }

      function onTouchMove(e) {
        if (!e.touches || !e.touches.length) return;
        var y = e.touches[0].clientY;
        var dy = y - startY;

        // if horizontal move is larger than vertical, ignore to allow inner swipes
        if (
          e.touches[0].clientX &&
          Math.abs(e.touches[0].clientX - (e.touches[0].clientX || 0)) >
            Math.abs(dy) &&
          !dragging
        ) {
          return;
        }

        // start dragging only when user moves vertically
        if (Math.abs(dy) > 8) {
          dragging = true;
        }

        if (!dragging) return;

        currentY = y;
        var translateY = Math.max(0, dy);
        // limit translate to drawer height
        if (translateY > drawerHeight) translateY = drawerHeight;
        drawer.style.transform = "translateY(" + translateY + "px)";
        // dim overlay slightly less as drawer follows finger
        var overlay = $("drawerOverlay");
        if (overlay) {
          var pct = 1 - translateY / drawerHeight;
          overlay.style.opacity = Math.max(
            0,
            Math.min(1, 0.45 * pct)
          ).toString();
        }

        e.preventDefault();
      }

      function onTouchEnd(e) {
        if (!dragging) return;
        var dy = currentY - startY;
        var timeDelta = Date.now() - lastTouchTime;
        // determine threshold: 25% of drawer height or fast swipe
        var shouldClose =
          dy > drawerHeight * 0.25 || (dy > 40 && timeDelta < 300);

        // reset transition
        drawer.style.transition = "transform 0.25s ease-in-out";
        var overlay = $("drawerOverlay");

        if (shouldClose) {
          // animate closing
          drawer.style.transform = "translateY(100%)";
          if (overlay) removeClass(overlay, "show");
          app.drawerOpen = false;
          // after transition, set closed class
          setTimeout(function () {
            removeClass(drawer, "open");
            addClass(drawer, "closed");
            drawer.style.transition = "";
            drawer.style.transform = "";
            if (overlay) overlay.style.opacity = "";
          }, 260);
        } else {
          // snap back open
          drawer.style.transform = "translateY(0)";
          if (overlay) {
            overlay.style.opacity = "";
            addClass(overlay, "show");
          }
          // remove the inline transition after it finishes
          setTimeout(function () {
            drawer.style.transition = "";
            drawer.style.transform = "";
          }, 260);
        }

        dragging = false;
      }

      // Attach handlers
      addEvent(drawer, "touchstart", onTouchStart);
      addEvent(drawer, "touchmove", onTouchMove);
      addEvent(drawer, "touchend", onTouchEnd);
      addEvent(drawer, "touchcancel", onTouchEnd);
    }

    // Small wiring for the polished mobile drawer UI
    var genderAnchors = document.querySelectorAll(
      "#mobileDrawer .gender-grid a"
    );
    for (var gi = 0; gi < genderAnchors.length; gi++) {
      (function (el) {
        addEvent(el, "click", function (e) {
          e.preventDefault();
          var g = el.getAttribute("data-gender");
          // update active state
          for (var k = 0; k < genderAnchors.length; k++)
            removeClass(genderAnchors[k], "active");
          addClass(el, "active");
          handleGenderFilter(g);
        });
        // touch feedback
        addEvent(el, "touchstart", function () {
          addClass(el, "pressed");
        });
        addEvent(el, "touchend", function () {
          removeClass(el, "pressed");
        });
        addEvent(el, "touchcancel", function () {
          removeClass(el, "pressed");
        });
      })(genderAnchors[gi]);
    }

    var clearBtn = $("clearAllFilters");
    if (clearBtn) {
      addEvent(clearBtn, "click", function () {
        clearAllFilters();
        // reset gender active
        var ga = document.querySelectorAll("#mobileDrawer .gender-grid a");
        for (var i = 0; i < ga.length; i++) removeClass(ga[i], "active");
        if (ga[0]) addClass(ga[0], "active");
      });
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

  /* ---- Enhancement helpers (theme toggle, lazy-image observer, focus-trap) ---- */
  function initEnhancements() {
    // Theme toggle wiring (if button exists)
    var themeToggle = $("themeToggle");
    if (themeToggle) {
      // update toggle button UI (label + ARIA)
      var updateToggleUI = function (t) {
        try {
          themeToggle.setAttribute("aria-pressed", t === "dark");
          // aria-label describes the action the button will perform
          themeToggle.setAttribute(
            "aria-label",
            t === "dark" ? "Switch to light theme" : "Switch to dark theme"
          );
          // update the inline icon (sun for light, moon for dark)
          var icon = $("themeIcon");
          if (icon) {
            if (t === "dark") {
              icon.innerHTML =
                '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />';
            } else {
              icon.innerHTML =
                '<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />';
            }
          }
        } catch (e) {}
      };

      var setThemeLocal = function (t) {
        document.body.setAttribute("data-theme", t);
        try {
          localStorage.setItem("site-theme", t);
        } catch (e) {}
        updateToggleUI(t);
      };

      addEvent(themeToggle, "click", function () {
        var current =
          document.body.getAttribute("data-theme") ||
          (window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light");
        setThemeLocal(current === "light" ? "dark" : "light");
      });

      // apply saved theme or respect OS preference
      try {
        var saved = null;
        try {
          saved = localStorage.getItem("site-theme");
        } catch (e) {}
        var initial =
          saved ||
          (window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light");
        setThemeLocal(initial);
      } catch (e) {}
    }

    // Lazy image blur-up was intentionally removed (no images used).
  }

  // initialize enhancements after DOM ready
  addEvent(window, "load", function () {
    try {
      initEnhancements();
    } catch (e) {
      console.warn("initEnhancements failed", e);
    }
  });

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
    var allTabs = document.querySelectorAll(".tab-list a");
    for (var i = 0; i < allTabs.length; i++) {
      removeClass(allTabs[i], "bg-indigo-600");
      removeClass(allTabs[i], "text-white");
      removeClass(allTabs[i], "shadow-sm");
      removeClass(allTabs[i], "active");
      addClass(allTabs[i], "text-slate-700");
      addClass(allTabs[i], "bg-inherit");

      if (allTabs[i].getAttribute("data-gender") === gender) {
        addClass(allTabs[i], "bg-indigo-600");
        addClass(allTabs[i], "text-white");
        addClass(allTabs[i], "shadow-sm");
        addClass(allTabs[i], "active");
        removeClass(allTabs[i], "text-slate-700");
        removeClass(allTabs[i], "bg-inherit");
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
      app.appliedFilters.push({ name: "Gender", value: app.genderFilter });
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
    updateAppliedFilters();
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
    card.className = "rounded-xs p-6 card-hover fade-in relative pb-6 card";
    if (user.urgent) {
      // add urgent visual treatment (pulse will be applied to badge/title only)
      addClass(card, "urgent");
    }

    var urgentBadge = user.urgent
      ? '<span class="urgent-badge">URGENT</span>'
      : "";

    var genderText =
      user.gender === "female" ? "لڑکی" : user.gender === "male" ? "لڑکا" : "";
    var displayTitle = user.title || "ضرورت رشتہ " + genderText;

    card.innerHTML =
      '<div class="flex justify-between items-start mb-6">' +
      '<h2 class="font-urdu text-lg font-semibold mb-1">' +
      displayTitle +
      "</h2>" +
      urgentBadge +
      "</div>" +
      '<p class="font-urdu text-gray-700 mb-3 leading-5">' +
      (user.body || "") +
      "</p>" +
      '<div class="card-meta">' +
      "<small class='muted'>LR ID: " +
      user.id +
      "</small>" +
      "<small class='muted'>Date: " +
      formatDate(user.date) +
      "</small>" +
      "</div>" +
      '<div class="relative flex justify-between space-x-3 card-actions">' +
      '<a class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-1.5 btn-primary rounded-md hover:from-indigo-600 hover:to-blue-600 transition-all duration-300 group contact-btn" data-id="' +
      user.id +
      '">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="transition-transform duration-200 group-hover:scale-110">' +
      '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>' +
      "</svg>" +
      "<span>Contact</span>" +
      "</a>" +
      '<a class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-1.5 btn-secondary rounded-md hover:from-indigo-600 hover:to-blue-600 transition-all duration-300 group call-btn" data-id="' +
      user.id +
      '">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="transition-transform duration-200 group-hover:scale-110">' +
      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>' +
      "</svg>" +
      "<span>Call</span>" +
      "</a>" +
      "</div>";

    // Add event listeners
    var contactBtn = card.querySelector(".contact-btn");
    var callBtn = card.querySelector(".call-btn");

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

    // If urgent, animate the badge and title rather than the whole card
    if (user.urgent) {
      try {
        var badgeEl = card.querySelector(".urgent-badge");
        if (badgeEl) addClass(badgeEl, "pulse");
        var titleEl = card.querySelector("h2");
        if (titleEl) {
          addClass(titleEl, "urgent-title");
          addClass(titleEl, "pulse");
        }
      } catch (e) {}
    }
    // No avatar images used — nothing to post-process here.

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
    if (user.whatsapp) {
      window.open("https://wa.me/" + user.whatsapp, "_blank");
    } else {
      showToast(
        "Contact: " + (user.phone || "No contact information available")
      );
    }
  }

  function handleCall(user) {
    if (user.phone) {
      window.open("tel:" + user.phone, "_self");
    } else {
      showToast("No phone number available");
    }
  }

  /* Non-blocking toast notifications */
  function showToast(message, timeout) {
    timeout = typeof timeout === "number" ? timeout : 3500;
    try {
      var wrap = document.getElementById("toastWrap");
      var live = document.getElementById("toastRegion");
      if (!wrap) return;

      var t = document.createElement("div");
      t.className = "toast";
      t.textContent = message;
      wrap.appendChild(t);

      // announce to screen readers
      if (live) {
        try {
          live.textContent = message;
        } catch (e) {}
      }

      // trigger show
      requestAnimationFrame(function () {
        t.classList.add("show");
      });

      // auto-remove
      setTimeout(function () {
        try {
          t.classList.remove("show");
          setTimeout(function () {
            try {
              if (t && t.parentNode) t.parentNode.removeChild(t);
            } catch (e) {}
          }, 220);
        } catch (e) {}
      }, timeout);
    } catch (e) {
      try {
        // fallback to alert if DOM not ready
        alert(message);
      } catch (er) {}
    }
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

  function updateAppliedFilters() {
    var container = $("appliedFilters");
    var badgesContainer = $("filterBadges");

    if (!container || !badgesContainer) return;

    if (app.appliedFilters.length === 0) {
      addClass(container, "hidden");
      return;
    }

    removeClass(container, "hidden");
    badgesContainer.innerHTML = "";

    for (var i = 0; i < app.appliedFilters.length; i++) {
      var filter = app.appliedFilters[i];

      // create chip
      var chip = document.createElement("span");
      chip.className = "filter-chip";

      var label = document.createElement("span");
      label.className = "chip-label";
      // display concise label: show ID with prefix, otherwise value
      var labelText = filter.value || "";
      if (filter.name === "ID") labelText = "ID: " + labelText;
      if (filter.name === "Search") labelText = labelText; // free text
      label.textContent = labelText;

      var closeBtn = document.createElement("button");
      closeBtn.className = "chip-close";
      closeBtn.setAttribute("type", "button");
      closeBtn.setAttribute("aria-label", "Remove filter " + filter.name);
      closeBtn.innerHTML = "&times;";

      (function (filterName) {
        addEvent(closeBtn, "click", function (e) {
          e.preventDefault();
          removeFilter(filterName);
        });
      })(filter.name);

      chip.appendChild(label);
      chip.appendChild(closeBtn);
      badgesContainer.appendChild(chip);
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

    // show loading area (for messages) and render skeleton cards in the grid
    if (loading) removeClass(loading, "hidden");
    if (grid) {
      grid.innerHTML = "";
      // render 6 skeleton cards as placeholders
      for (var i = 0; i < 6; i++) {
        var sk = document.createElement("div");
        sk.className = "skeleton";
        sk.style.height = "120px";
        sk.style.borderRadius = "12px";
        grid.appendChild(sk);
      }
    }
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
