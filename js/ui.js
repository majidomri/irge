// LiveRishtey UI - Rendering and Interface Functions
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

  // User rendering
  function renderUsers() {
    var container = $("userList");
    var noResults = $("noResults");

    if (!container) return;

    if (app.displayedUsers.length === 0) {
      addClass(container, "hidden");
      if (noResults) removeClass(noResults, "hidden");
      return;
    }

    removeClass(container, "hidden");
    if (noResults) addClass(noResults, "hidden");

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
    var displayTitle = user.title || "ضرورت رشتہ";
    var displayAge = user.age ? " (Age: " + user.age + ")" : "";
    var displayId = "LR" + (user.id || "");

    card.innerHTML =
      urgentBadge +
      '<h2 class="font-urdu text-lg font-semibold mb-3">' +
      displayTitle +
      "</h2>" +
      '<p class="font-urdu text-gray-700 mb-4 leading-relaxed">' +
      (user.body || "") +
      "</p>" +
      '<div class="text-sm text-gray-500 mb-3">ID: ' +
      displayId +
      displayAge +
      "</div>" +
      '<div class="card-actions flex gap-2">' +
      '<button class="action-btn contact-btn" onclick="handleContact(' +
      user.id +
      ')">📱 Contact</button>' +
      '<button class="action-btn call-btn" onclick="handleCall(' +
      user.id +
      ')">📞 Call</button>' +
      '<button class="action-btn biodata-btn" onclick="handleBiodata(' +
      user.id +
      ')">📄 Biodata</button>' +
      '<button class="action-btn id-btn" onclick="handleIdCopy(\'' +
      displayId +
      '\')" title="Copy ID: ' +
      displayId +
      '">🆔 ID</button>' +
      "</div>";

    return card;
  }

  // Statistics update
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

  // Filter chips
  function updateFilterChips() {
    var container = $("filterChips");
    if (!container) return;

    if (app.appliedFilters.length === 0) {
      container.style.display = "none";
      return;
    }

    container.style.display = "block";
    var chipsHtml = '<span class="filter-chips-label">Active filters:</span>';

    for (var i = 0; i < app.appliedFilters.length; i++) {
      var filter = app.appliedFilters[i];
      chipsHtml +=
        '<span class="filter-chip">' +
        filter.name +
        ": " +
        filter.value +
        '<button class="filter-chip-remove" onclick="removeFilter(\'' +
        filter.name +
        "')\">×</button>" +
        "</span>";
    }

    container.innerHTML = chipsHtml;
  }

  // Theme system
  function setupThemeSystem() {
    var themeSelect = $("themeSelect");
    if (!themeSelect) return;

    // Load saved theme
    var savedTheme = localStorage.getItem("liverishtey_theme") || "system";
    app.currentTheme = savedTheme;
    applyTheme(savedTheme);
    themeSelect.value = savedTheme;

    addEvent(themeSelect, "change", function () {
      var selectedTheme = themeSelect.value;
      app.currentTheme = selectedTheme;
      applyTheme(selectedTheme);
      localStorage.setItem("liverishtey_theme", selectedTheme);
    });
  }

  function applyTheme(theme) {
    var root = document.documentElement;

    // Remove existing theme classes
    var body = document.body;
    body.className = body.className.replace(/theme-\w+/g, "");

    if (theme === "system") {
      // Use system preference
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        addClass(body, "theme-dark");
      } else {
        addClass(body, "theme-light");
      }
    } else {
      addClass(body, "theme-" + theme);
    }
  }

  // Typing animation
  function startTypingAnimation() {
    var container = $("typingText");
    if (!container) return;

    function typeText() {
      var currentText = app.typingTexts[app.currentTextIndex];

      if (app.typingDirection === "forward") {
        if (app.currentCharIndex < currentText.length) {
          container.textContent = currentText.substring(
            0,
            app.currentCharIndex + 1
          );
          app.currentCharIndex++;
          setTimeout(typeText, app.typingSpeed);
        } else {
          setTimeout(function () {
            app.typingDirection = "backward";
            typeText();
          }, app.pauseDuration);
        }
      } else {
        if (app.currentCharIndex > 0) {
          container.textContent = currentText.substring(
            0,
            app.currentCharIndex - 1
          );
          app.currentCharIndex--;
          setTimeout(typeText, app.typingSpeed / 2);
        } else {
          app.currentTextIndex =
            (app.currentTextIndex + 1) % app.typingTexts.length;
          app.typingDirection = "forward";
          setTimeout(typeText, 500);
        }
      }
    }

    typeText();
  }

  // Mobile drawer
  function setupOverlayAndFab() {
    var overlay = $("drawerOverlay");
    var fab = $("filterFab");
    var drawer = $("mobileDrawer");

    if (!overlay || !fab || !drawer) return;

    addEvent(fab, "click", function () {
      app.drawerOpen = !app.drawerOpen;
      if (app.drawerOpen) {
        removeClass(overlay, "hidden");
        removeClass(drawer, "translate-y-full");
      } else {
        addClass(overlay, "hidden");
        addClass(drawer, "translate-y-full");
      }
    });

    addEvent(overlay, "click", function () {
      app.drawerOpen = false;
      addClass(overlay, "hidden");
      addClass(drawer, "translate-y-full");
    });
  }

  // Export UI functions
  window.LiveRishteyUI = {
    renderUsers: renderUsers,
    updateStatistics: updateStatistics,
    updateFilterChips: updateFilterChips,
    setupThemeSystem: setupThemeSystem,
    startTypingAnimation: startTypingAnimation,
    setupOverlayAndFab: setupOverlayAndFab,
  };

  // Override core functions with UI versions
  window.renderUsers = renderUsers;
  window.updateStatistics = updateStatistics;
  window.updateFilterChips = updateFilterChips;

  // Initialize UI
  function initUI() {
    setupThemeSystem();
    startTypingAnimation();
    setupOverlayAndFab();
  }

  // Start UI initialization
  if (document.readyState === "loading") {
    addEvent(document, "DOMContentLoaded", initUI);
  } else {
    initUI();
  }
})();
