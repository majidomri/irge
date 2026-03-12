// LiveRishtey Filters - Search and Filter Functions
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
  var applyFilters = window.LiveRishteyCore.applyFilters;

  // Search functionality
  function setupSearch() {
    var searchInput = $("searchInput");
    var mobileSearchInput = $("mobileSearchInput");

    if (searchInput) {
      var searchTimeout;
      addEvent(searchInput, "input", function () {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function () {
          app.searchTerm = searchInput.value.trim();
          if (mobileSearchInput) mobileSearchInput.value = app.searchTerm;
          applyFilters();
        }, 300);
      });
    }

    if (mobileSearchInput) {
      var mobileSearchTimeout;
      addEvent(mobileSearchInput, "input", function () {
        clearTimeout(mobileSearchTimeout);
        mobileSearchTimeout = setTimeout(function () {
          app.searchTerm = mobileSearchInput.value.trim();
          if (searchInput) searchInput.value = app.searchTerm;
          applyFilters();
        }, 300);
      });
    }
  }

  // ID filter
  function setupIdFilter() {
    var idInput = $("idFilter");
    var mobileIdInput = $("mobileIdFilter");

    if (idInput) {
      var idTimeout;
      addEvent(idInput, "input", function () {
        clearTimeout(idTimeout);
        idTimeout = setTimeout(function () {
          app.idFilter = idInput.value.trim();
          if (mobileIdInput) mobileIdInput.value = app.idFilter;
          applyFilters();
        }, 300);
      });
    }

    if (mobileIdInput) {
      var mobileIdTimeout;
      addEvent(mobileIdInput, "input", function () {
        clearTimeout(mobileIdTimeout);
        mobileIdTimeout = setTimeout(function () {
          app.idFilter = mobileIdInput.value.trim();
          if (idInput) idInput.value = app.idFilter;
          applyFilters();
        }, 300);
      });
    }
  }

  // Gender filter
  function setupGenderFilter() {
    var genderTabs = document.querySelectorAll(".gender-tab");
    var mobileGenderTabs = document.querySelectorAll(".mobile-gender-tab");

    function updateGenderTabs(selectedGender) {
      // Update desktop tabs
      for (var i = 0; i < genderTabs.length; i++) {
        var tab = genderTabs[i];
        var gender = tab.getAttribute("data-gender");
        if (gender === selectedGender) {
          addClass(tab, "active");
        } else {
          removeClass(tab, "active");
        }
      }

      // Update mobile tabs
      for (var j = 0; j < mobileGenderTabs.length; j++) {
        var mobileTab = mobileGenderTabs[j];
        var mobileGender = mobileTab.getAttribute("data-gender");
        if (mobileGender === selectedGender) {
          addClass(mobileTab, "active");
        } else {
          removeClass(mobileTab, "active");
        }
      }
    }

    // Desktop gender tabs
    for (var i = 0; i < genderTabs.length; i++) {
      (function (tab) {
        addEvent(tab, "click", function (e) {
          e.preventDefault();
          var gender = tab.getAttribute("data-gender");
          app.genderFilter = gender;
          updateGenderTabs(gender);
          applyFilters();
        });
      })(genderTabs[i]);
    }

    // Mobile gender tabs
    for (var j = 0; j < mobileGenderTabs.length; j++) {
      (function (tab) {
        addEvent(tab, "click", function (e) {
          e.preventDefault();
          var gender = tab.getAttribute("data-gender");
          app.genderFilter = gender;
          updateGenderTabs(gender);
          applyFilters();
        });
      })(mobileGenderTabs[j]);
    }
  }

  // Sort functionality
  function setupSort() {
    var sortSelect = $("sortSelect");
    var mobileSortSelect = $("mobileSortSelect");

    if (sortSelect) {
      addEvent(sortSelect, "change", function () {
        app.sortOrder = sortSelect.value;
        if (mobileSortSelect) mobileSortSelect.value = app.sortOrder;
        applyFilters();
      });
    }

    if (mobileSortSelect) {
      addEvent(mobileSortSelect, "change", function () {
        app.sortOrder = mobileSortSelect.value;
        if (sortSelect) sortSelect.value = app.sortOrder;
        applyFilters();
      });
    }
  }

  // Education filter
  function setupEducationFilter() {
    var educationSelect = $("educationFilter");
    var mobileEducationSelect = $("mobileEducationFilter");

    if (educationSelect) {
      addEvent(educationSelect, "change", function () {
        app.educationFilter = educationSelect.value;
        if (mobileEducationSelect)
          mobileEducationSelect.value = app.educationFilter;
        applyFilters();
      });
    }

    if (mobileEducationSelect) {
      addEvent(mobileEducationSelect, "change", function () {
        app.educationFilter = mobileEducationSelect.value;
        if (educationSelect) educationSelect.value = app.educationFilter;
        applyFilters();
      });
    }
  }

  // Clear filters
  function setupClearFilters() {
    var clearBtn = $("clearFilters");
    var mobileClearBtn = $("mobileClearFilters");

    function clearAllFilters() {
      app.searchTerm = "";
      app.idFilter = "";
      app.genderFilter = "all";
      app.educationFilter = "";
      app.sortOrder = "dateDesc";

      // Reset form inputs
      var searchInput = $("searchInput");
      var mobileSearchInput = $("mobileSearchInput");
      var idInput = $("idFilter");
      var mobileIdInput = $("mobileIdFilter");
      var sortSelect = $("sortSelect");
      var mobileSortSelect = $("mobileSortSelect");
      var educationSelect = $("educationFilter");
      var mobileEducationSelect = $("mobileEducationFilter");

      if (searchInput) searchInput.value = "";
      if (mobileSearchInput) mobileSearchInput.value = "";
      if (idInput) idInput.value = "";
      if (mobileIdInput) mobileIdInput.value = "";
      if (sortSelect) sortSelect.value = "dateDesc";
      if (mobileSortSelect) mobileSortSelect.value = "dateDesc";
      if (educationSelect) educationSelect.value = "";
      if (mobileEducationSelect) mobileEducationSelect.value = "";

      // Reset gender tabs
      var genderTabs = document.querySelectorAll(".gender-tab");
      var mobileGenderTabs = document.querySelectorAll(".mobile-gender-tab");

      for (var i = 0; i < genderTabs.length; i++) {
        var tab = genderTabs[i];
        if (tab.getAttribute("data-gender") === "all") {
          addClass(tab, "active");
        } else {
          removeClass(tab, "active");
        }
      }

      for (var j = 0; j < mobileGenderTabs.length; j++) {
        var mobileTab = mobileGenderTabs[j];
        if (mobileTab.getAttribute("data-gender") === "all") {
          addClass(mobileTab, "active");
        } else {
          removeClass(mobileTab, "active");
        }
      }

      applyFilters();
    }

    if (clearBtn) {
      addEvent(clearBtn, "click", clearAllFilters);
    }

    if (mobileClearBtn) {
      addEvent(mobileClearBtn, "click", clearAllFilters);
    }
  }

  // Remove individual filter
  function removeFilter(filterName) {
    switch (filterName) {
      case "Search":
        app.searchTerm = "";
        var searchInput = $("searchInput");
        var mobileSearchInput = $("mobileSearchInput");
        if (searchInput) searchInput.value = "";
        if (mobileSearchInput) mobileSearchInput.value = "";
        break;
      case "ID":
        app.idFilter = "";
        var idInput = $("idFilter");
        var mobileIdInput = $("mobileIdFilter");
        if (idInput) idInput.value = "";
        if (mobileIdInput) mobileIdInput.value = "";
        break;
      case "Gender":
        app.genderFilter = "all";
        var genderTabs = document.querySelectorAll(
          ".gender-tab, .mobile-gender-tab"
        );
        for (var i = 0; i < genderTabs.length; i++) {
          var tab = genderTabs[i];
          if (tab.getAttribute("data-gender") === "all") {
            addClass(tab, "active");
          } else {
            removeClass(tab, "active");
          }
        }
        break;
      case "Education":
        app.educationFilter = "";
        var educationSelect = $("educationFilter");
        var mobileEducationSelect = $("mobileEducationFilter");
        if (educationSelect) educationSelect.value = "";
        if (mobileEducationSelect) mobileEducationSelect.value = "";
        break;
    }
    applyFilters();
  }

  // Load more functionality
  function setupLoadMore() {
    var loadMoreBtn = $("loadMoreBtn");
    if (!loadMoreBtn) return;

    addEvent(loadMoreBtn, "click", function () {
      app.currentPage++;
      window.LiveRishteyCore.applyFilters();

      if (app.displayedUsers.length >= app.filteredUsers.length) {
        addClass(loadMoreBtn, "hidden");
      }
    });
  }

  // Export filter functions
  window.LiveRishteyFilters = {
    setupSearch: setupSearch,
    setupIdFilter: setupIdFilter,
    setupGenderFilter: setupGenderFilter,
    setupSort: setupSort,
    setupEducationFilter: setupEducationFilter,
    setupClearFilters: setupClearFilters,
    setupLoadMore: setupLoadMore,
  };

  // Make removeFilter global
  window.removeFilter = removeFilter;

  // Initialize filters
  function initFilters() {
    setupSearch();
    setupIdFilter();
    setupGenderFilter();
    setupSort();
    setupEducationFilter();
    setupClearFilters();
    setupLoadMore();
  }

  // Start filter initialization
  if (document.readyState === "loading") {
    addEvent(document, "DOMContentLoaded", initFilters);
  } else {
    initFilters();
  }
})();
