// LiveRishtey - Final ES5 Compatible Implementation
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
  }

  // Setup all event listeners
  function setupEventListeners() {
    // Desktop search input (if exists)
    var desktopSearch = document.querySelector(
      '#desktopFilters input[placeholder="Search..."]'
    );
    if (desktopSearch) {
      addEvent(
        desktopSearch,
        "input",
        debounce(function () {
          app.searchTerm = desktopSearch.value.trim();
          resetPagination();
          applyFilters();
        }, 300)
      );
    }

    // Desktop ID filter (if exists)
    var desktopIdFilter = document.querySelector(
      '#desktopFilters input[placeholder="Filter by ID"]'
    );
    if (desktopIdFilter) {
      addEvent(
        desktopIdFilter,
        "input",
        debounce(function () {
          app.idFilter = desktopIdFilter.value.trim();
          resetPagination();
          applyFilters();
        }, 300)
      );
    }

    // Desktop sort order (if exists)
    var desktopSort = document.querySelector("#desktopFilters select");
    if (desktopSort) {
      addEvent(desktopSort, "change", function () {
        app.sortOrder = desktopSort.value;
        resetPagination();
        applyFilters();
      });
    }

    // Desktop education filter (if exists)
    var desktopEducation = document.querySelectorAll(
      "#desktopFilters select"
    )[1];
    if (desktopEducation) {
      addEvent(desktopEducation, "change", function () {
        app.educationFilter = desktopEducation.value;
        resetPagination();
        applyFilters();
      });
    }

    // Gender tabs
    var genderTabs = document.querySelectorAll(".tab-list a");
    for (var i = 0; i < genderTabs.length; i++) {
      (function (tab, index) {
        var genderValue = index === 0 ? "all" : index === 1 ? "male" : "female";

        addEvent(tab, "click", function (e) {
          e.preventDefault();
          handleGenderFilter(genderValue);
        });

        // Touch events for mobile
        addEvent(tab, "touchend", function (e) {
          e.preventDefault();
          handleGenderFilter(genderValue);
        });
      })(genderTabs[i], i);
    }

    // Load more button
    var loadMoreBtn = $("loadMoreBtn");
    if (loadMoreBtn) {
      addEvent(loadMoreBtn, "click", loadMore);
      addEvent(loadMoreBtn, "touchend", function (e) {
        e.preventDefault();
        loadMore();
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

    // Infinite scroll
    addEvent(window, "scroll", debounce(handleScroll, 100));
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
        isUrgent: user.priority && user.priority.toLowerCase() === "urgent",
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

    // Update tab states
    var tabs = document.querySelectorAll(".tab-list a");
    for (var i = 0; i < tabs.length; i++) {
      removeClass(tabs[i], "bg-indigo-600");
      removeClass(tabs[i], "text-white");
      removeClass(tabs[i], "shadow-lg");
      removeClass(tabs[i], "glossy-effect");
      addClass(tabs[i], "text-slate-700");
      addClass(tabs[i], "bg-inherit");
    }

    // Set active tab
    var activeIndex = gender === "all" ? 0 : gender === "male" ? 1 : 2;
    if (tabs[activeIndex]) {
      addClass(tabs[activeIndex], "bg-indigo-600");
      addClass(tabs[activeIndex], "text-white");
      addClass(tabs[activeIndex], "shadow-lg");
      addClass(tabs[activeIndex], "glossy-effect");
      removeClass(tabs[activeIndex], "text-slate-700");
      removeClass(tabs[activeIndex], "bg-inherit");
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
          if (a.isUrgent && !b.isUrgent) return -1;
          if (!a.isUrgent && b.isUrgent) return 1;
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
    updateLoadMoreButton();
  }

  function renderUsers() {
    var container = $("usersList");
    var noResults = $("noResults");

    if (!container || !noResults) return;

    if (app.displayedUsers.length === 0) {
      addClass(container, "hidden");
      addClass(noResults, "show");
      return;
    }

    removeClass(container, "hidden");
    removeClass(noResults, "show");

    container.innerHTML = "";

    for (var i = 0; i < app.displayedUsers.length; i++) {
      var userCard = createUserCard(app.displayedUsers[i]);
      container.appendChild(userCard);
    }
  }

  function createUserCard(user) {
    var card = document.createElement("div");
    card.className =
      "bg-white p-6 rounded-lg shadow-md card-hover fade-in relative";

    var urgentBadge = user.isUrgent
      ? '<div class="urgent-badge">URGENT</div>'
      : "";
    var genderText =
      user.gender === "female" ? "لڑکی" : user.gender === "male" ? "لڑکا" : "";

    card.innerHTML =
      urgentBadge +
      '<h2 class="card-title font-urdu">ضرورت رشتہ ' +
      genderText +
      "</h2>" +
      '<div class="card-description font-urdu">' +
      (user.body || "") +
      "</div>" +
      '<div class="card-meta">' +
      "<span>LR ID: " +
      user.id +
      "</span>" +
      "<span>Date: " +
      formatDate(user.date) +
      "</span>" +
      "</div>" +
      '<div class="card-actions">' +
      '<button class="action-btn btn-primary" data-id="' +
      user.id +
      '">📞 Contact</button>' +
      '<button class="action-btn btn-success" data-id="' +
      user.id +
      '">📱 Call</button>' +
      "</div>";

    // Add event listeners
    var contactBtn = card.querySelector(".btn-primary");
    var callBtn = card.querySelector(".btn-success");

    if (contactBtn) {
      addEvent(contactBtn, "click", function () {
        handleContact(user);
      });
      addEvent(contactBtn, "touchend", function (e) {
        e.preventDefault();
        handleContact(user);
      });
    }

    if (callBtn) {
      addEvent(callBtn, "click", function () {
        handleCall(user);
      });
      addEvent(callBtn, "touchend", function (e) {
        e.preventDefault();
        handleCall(user);
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
    if (user.whatsapp) {
      window.open("https://wa.me/" + user.whatsapp, "_blank");
    } else {
      alert("Contact: " + (user.phone || "No contact information available"));
    }
  }

  function handleCall(user) {
    if (user.phone) {
      window.open("tel:" + user.phone, "_self");
    } else {
      alert("No phone number available");
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
      if (user.isUrgent) urgentCount++;
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
      removeClass(container, "show");
      return;
    }

    addClass(container, "show");
    badgesContainer.innerHTML = "";

    for (var i = 0; i < app.appliedFilters.length; i++) {
      var filter = app.appliedFilters[i];
      var badge = document.createElement("div");
      badge.className = "filter-badge";
      badge.innerHTML =
        filter.name +
        ": " +
        filter.value +
        '<button class="filter-badge-remove" data-filter="' +
        filter.name +
        '">&times;</button>';

      var removeBtn = badge.querySelector(".filter-badge-remove");
      if (removeBtn) {
        (function (filterName) {
          addEvent(removeBtn, "click", function () {
            removeFilter(filterName);
          });
        })(filter.name);
      }

      badgesContainer.appendChild(badge);
    }
  }

  function removeFilter(filterName) {
    switch (filterName) {
      case "Search":
        app.searchTerm = "";
        var searchInput = document.querySelector(
          '#desktopFilters input[placeholder="Search..."]'
        );
        if (searchInput) searchInput.value = "";
        break;
      case "ID":
        app.idFilter = "";
        var idInput = document.querySelector(
          '#desktopFilters input[placeholder="Filter by ID"]'
        );
        if (idInput) idInput.value = "";
        break;
      case "Gender":
        handleGenderFilter("all");
        break;
      case "Education":
        app.educationFilter = "";
        var eduSelect = document.querySelectorAll("#desktopFilters select")[1];
        if (eduSelect) eduSelect.value = "";
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

    var searchInput = document.querySelector(
      '#desktopFilters input[placeholder="Search..."]'
    );
    if (searchInput) searchInput.value = "";

    var idInput = document.querySelector(
      '#desktopFilters input[placeholder="Filter by ID"]'
    );
    if (idInput) idInput.value = "";

    var eduSelect = document.querySelectorAll("#desktopFilters select")[1];
    if (eduSelect) eduSelect.value = "";

    var sortSelect = document.querySelector("#desktopFilters select");
    if (sortSelect) sortSelect.value = "dateDesc";

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

  function updateLoadMoreButton() {
    var button = $("loadMoreBtn");
    if (!button) return;

    if (
      app.displayedUsers.length < app.filteredUsers.length &&
      app.filteredUsers.length > 0
    ) {
      addClass(button, "show");
    } else {
      removeClass(button, "show");
    }
  }

  function resetPagination() {
    app.currentPage = 1;
  }

  function showLoading() {
    var loading = $("loading");
    var grid = $("usersList");

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
