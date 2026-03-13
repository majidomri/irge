import { config } from "./config.js";
import { createState } from "./state.js";
import {
  $, $$, debounce, domReady, getQueryParam,
} from "./utils.js";
import { StorageService } from "./services/storage-service.js";
import { ActivityLogger } from "./services/activity-logger.js";
import { ContactService } from "./services/contact-service.js";
import { DataService } from "./services/data-service.js";
import { applyFilters } from "./modules/filter-engine.js";
import { ThemeController } from "./modules/theme-controller.js";
import { TypingController } from "./modules/typing-controller.js";
import { DrawerController } from "./modules/drawer-controller.js";
import { Renderer } from "./modules/renderer.js";
import { AdminController } from "./modules/admin-controller.js";

class InstaRishtaApp {
  constructor() {
    this.state = createState(config.usersPerPage);
    this.filterWorker = null;
    this.filterWorkerRequestId = 0;
    this.latestFilterRequestId = 0;
    this.workerRequests = new Map();
    this.workerRequestTimeoutMs = 6000;
    this.workerReady = false;
    this.splashDismissScheduled = false;
    this.splashVisibleAt = typeof performance !== "undefined" ? performance.now() : Date.now();

    this.storage = new StorageService();
    this.logger = new ActivityLogger(this.storage, config.activityLogKey);
    this.contactService = new ContactService(this.storage, config.contactLimit);
    this.dataService = new DataService(config.dataSources);

    this.renderer = new Renderer({
      onContact: (user) => this.handleContact(user),
      onCall: (user) => this.handleCall(user),
      onBiodata: (user) => this.handleBiodata(user),
      onShare: (user) => this.handleShareCard(user),
      onLongPress: (user) => this.handleLongPressCard(user),
    });

    this.theme = new ThemeController(this.storage, config.themeStorageKey);
    this.typing = new TypingController(this.state.typing);
    this.drawer = new DrawerController();
    this.admin = new AdminController({
      storage: this.storage,
      logger: this.logger,
      contactService: this.contactService,
      adminCode: config.adminCode,
      showToast: (message) => this.renderer.showToast(message),
    });

    this.initFilterWorker();
  }

  init() {
    this.logger.log("page_load", {
      timestamp: Date.now(),
      referrer: document.referrer || "direct",
    });

    this.theme.init();
    this.typing.start();
    this.drawer.init();
    this.admin.init();
    this.applyFiltersFromUrl();
    this.bindEvents();
    this.applyFiltersToInputs();
    this.applyAccessibilityEnhancements();
    this.updateGenderTabs();
    this.updateContactLimitIndicator();
    this.loadUsers();
    this.requestSplashHide();

    setInterval(() => this.updateContactLimitIndicator(), 30000);
    setInterval(() => this.admin.updateStats(), 30000);
    setInterval(() => {
      this.logger.log("heartbeat", {
        scrollPosition: window.scrollY,
        activeFilters: this.state.appliedFilters.length,
      });
    }, 300000);

    this.registerServiceWorker();
  }

  bindEvents() {
    const bindInput = (id, handler, wait = 250) => {
      const element = $(id);
      if (!element) return;
      element.addEventListener("input", debounce(handler, wait));
    };

    const bindChange = (id, handler) => {
      const element = $(id);
      if (!element) return;
      element.addEventListener("change", handler);
    };

    bindInput("searchInput", () => {
      this.state.filters.search = $("searchInput")?.value.trim() || "";
      this.syncInput("mobileSearchInput", this.state.filters.search);
      this.refreshFilters();
    });

    bindInput("mobileSearchInput", () => {
      this.state.filters.search = $("mobileSearchInput")?.value.trim() || "";
      this.syncInput("searchInput", this.state.filters.search);
      this.refreshFilters();
    });

    bindInput("idFilter", () => {
      this.state.filters.id = $("idFilter")?.value.trim() || "";
      this.syncInput("mobileIdFilter", this.state.filters.id);
      this.refreshFilters();
    });

    bindInput("mobileIdFilter", () => {
      this.state.filters.id = $("mobileIdFilter")?.value.trim() || "";
      this.syncInput("idFilter", this.state.filters.id);
      this.refreshFilters();
    });

    bindChange("sortOrder", () => {
      this.state.filters.sort = $("sortOrder")?.value || "dateDesc";
      this.syncInput("mobileSortOrder", this.state.filters.sort);
      this.refreshFilters();
    });

    bindChange("mobileSortOrder", () => {
      this.state.filters.sort = $("mobileSortOrder")?.value || "dateDesc";
      this.syncInput("sortOrder", this.state.filters.sort);
      this.refreshFilters();
    });

    bindChange("educationFilter", () => {
      this.state.filters.education = $("educationFilter")?.value || "";
      this.syncInput("mobileEducationFilter", this.state.filters.education);
      this.refreshFilters();
    });

    bindChange("mobileEducationFilter", () => {
      this.state.filters.education = $("mobileEducationFilter")?.value || "";
      this.syncInput("educationFilter", this.state.filters.education);
      this.refreshFilters();
    });

    $$(".gender-tab, .gender-grid a").forEach((tab) => {
      const applyGender = () => {
        const gender = tab.getAttribute("data-gender") || "all";
        this.state.filters.gender = gender;
        this.updateGenderTabs();
        this.refreshFilters();
      };

      tab.addEventListener("click", (event) => {
        event.preventDefault();
        applyGender();
      });

      tab.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        applyGender();
      });
    });

    $("clearAllFilters")?.addEventListener("click", () => this.clearAllFilters());
    $("clearAllFiltersMobile")?.addEventListener("click", () => this.clearAllFilters());

    window.addEventListener("scroll", debounce(() => this.handleScroll(), 100));
  }

  syncInput(id, value) {
    const element = $(id);
    if (element) element.value = value;
  }

  initFilterWorker() {
    if (typeof Worker === "undefined") return;

    try {
      const workerUrl = new URL("./workers/filter-worker.js", import.meta.url);
      this.filterWorker = new Worker(workerUrl, { type: "module" });

      this.filterWorker.onmessage = (event) => {
        const payload = event.data || {};
        const request = this.workerRequests.get(payload.requestId);
        if (!request) return;

        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        this.workerRequests.delete(payload.requestId);

        if (payload.type === "filter-result") {
          request.resolve(payload.result);
          return;
        }

        if (payload.type === "users-set") {
          request.resolve({ ok: true });
          return;
        }

        request.reject(new Error(payload.error || "Worker request failed"));
      };

      this.filterWorker.onerror = () => {
        const pendingRequests = Array.from(this.workerRequests.values());
        pendingRequests.forEach((request) => {
          if (request.timeoutId) clearTimeout(request.timeoutId);
          request.reject(new Error("Filter worker crashed"));
        });
        this.filterWorker?.terminate();
        this.filterWorker = null;
        this.workerReady = false;
        this.workerRequests.clear();
      };
    } catch {
      this.filterWorker = null;
      this.workerReady = false;
    }
  }

  postToWorker(type, payload = {}) {
    if (!this.filterWorker) {
      return Promise.reject(new Error("Filter worker unavailable"));
    }

    this.filterWorkerRequestId += 1;
    const requestId = this.filterWorkerRequestId;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.workerRequests.delete(requestId);
        reject(new Error("Filter worker timeout"));
      }, this.workerRequestTimeoutMs);

      this.workerRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
      });

      try {
        this.filterWorker.postMessage({
          type,
          requestId,
          ...payload,
        });
      } catch (error) {
        clearTimeout(timeoutId);
        this.workerRequests.delete(requestId);
        reject(error);
      }
    });
  }

  async syncUsersToWorker() {
    if (!this.filterWorker) return;
    try {
      await this.postToWorker("setUsers", {
        users: this.state.allUsers,
      });
      this.workerReady = true;
    } catch {
      this.filterWorker?.terminate();
      this.filterWorker = null;
      this.workerReady = false;
      this.workerRequests.clear();
    }
  }

  async runFilterPipeline() {
    if (!this.filterWorker || !this.workerReady) {
      return applyFilters(this.state.allUsers, this.state.filters);
    }

    const requestId = this.filterWorkerRequestId + 1;
    this.latestFilterRequestId = requestId;
    let result;
    try {
      result = await this.postToWorker("filter", {
        filters: this.state.filters,
      });
    } catch {
      this.filterWorker?.terminate();
      this.filterWorker = null;
      this.workerReady = false;
      this.workerRequests.clear();
      return applyFilters(this.state.allUsers, this.state.filters);
    }

    if (requestId !== this.latestFilterRequestId) {
      return null;
    }

    return result;
  }

  applyFiltersFromUrl() {
    const nextFilters = { ...this.state.filters };

    const search = getQueryParam("search");
    const id = getQueryParam("id");
    const gender = getQueryParam("gender");
    const education = getQueryParam("education");
    const sort = getQueryParam("sort");

    if (search) nextFilters.search = search;
    if (id) nextFilters.id = id;
    if (education) nextFilters.education = education;

    if (gender && ["all", "male", "female"].includes(gender)) {
      nextFilters.gender = gender;
    }

    if (sort && ["dateDesc", "dateAsc", "userUrgent", "relevance"].includes(sort)) {
      nextFilters.sort = sort;
    }

    this.state.filters = nextFilters;
  }

  applyFiltersToInputs() {
    this.syncInput("searchInput", this.state.filters.search);
    this.syncInput("mobileSearchInput", this.state.filters.search);
    this.syncInput("idFilter", this.state.filters.id);
    this.syncInput("mobileIdFilter", this.state.filters.id);
    this.syncInput("educationFilter", this.state.filters.education);
    this.syncInput("mobileEducationFilter", this.state.filters.education);
    this.syncInput("sortOrder", this.state.filters.sort);
    this.syncInput("mobileSortOrder", this.state.filters.sort);
  }

  syncFiltersToUrl() {
    const defaults = {
      search: "",
      id: "",
      gender: "all",
      education: "",
      sort: "dateDesc",
    };

    const params = new URLSearchParams(window.location.search);
    const applyParam = (key, value, fallback) => {
      if (!value || value === fallback) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    };

    applyParam("search", this.state.filters.search, defaults.search);
    applyParam("id", this.state.filters.id, defaults.id);
    applyParam("gender", this.state.filters.gender, defaults.gender);
    applyParam("education", this.state.filters.education, defaults.education);
    applyParam("sort", this.state.filters.sort, defaults.sort);

    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }

  applyAccessibilityEnhancements() {
    $("searchInput")?.setAttribute("aria-label", "Search profiles");
    $("mobileSearchInput")?.setAttribute("aria-label", "Search profiles");
    $("idFilter")?.setAttribute("aria-label", "Filter by ID");
    $("mobileIdFilter")?.setAttribute("aria-label", "Filter by ID");
    $("sortOrder")?.setAttribute("aria-label", "Sort profiles");
    $("mobileSortOrder")?.setAttribute("aria-label", "Sort profiles");
    $("educationFilter")?.setAttribute("aria-label", "Filter by education");
    $("mobileEducationFilter")?.setAttribute("aria-label", "Filter by education");

    $("userList")?.setAttribute("role", "list");
    $("filterChips")?.setAttribute("aria-live", "polite");
  }

  registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    };

    const scheduleRegister = () => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(register, { timeout: 5000 });
      } else {
        window.setTimeout(register, 1500);
      }
    };

    if (document.readyState === "complete") {
      scheduleRegister();
    } else {
      window.addEventListener("load", scheduleRegister, { once: true });
    }
  }

  requestSplashHide() {
    if (this.splashDismissScheduled) return;

    this.splashDismissScheduled = true;
    const splash = $("splashScreen");
    if (!splash) return;

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsed = now - this.splashVisibleAt;
    const delay = Math.max(0, 950 - elapsed);

    window.setTimeout(() => {
      splash.classList.add("is-hidden");
      window.setTimeout(() => splash.remove(), 420);
    }, delay);
  }

  updateGenderTabs() {
    $$(".gender-tab, .gender-grid a").forEach((tab) => {
      const active = tab.getAttribute("data-gender") === this.state.filters.gender;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  async loadUsers() {
    this.state.loading = true;
    this.renderer.showLoading();
    let hasRenderedCache = false;

    const cached = this.dataService.loadCachedUsers();
    if (cached?.users?.length) {
      this.state.allUsers = cached.users;
      this.state.activeDataSource = `${cached.source} (cache)`;
      this.state.loading = false;
      this.renderer.hideLoading();
      await this.refreshFilters();
      void this.syncUsersToWorker();
      hasRenderedCache = true;
    }

    try {
      const { users, source } = await this.dataService.loadUsers();
      const incomingSignature = this.dataService.getUsersSignature(users);
      const currentSignature = this.dataService.getUsersSignature(this.state.allUsers);
      const shouldRefreshView = !hasRenderedCache || incomingSignature !== currentSignature;

      this.state.allUsers = users;
      this.state.activeDataSource = source;

      if (shouldRefreshView) {
        this.state.loading = false;
        this.renderer.hideLoading();
        await this.refreshFilters();
      }
      void this.syncUsersToWorker();

      console.info("InstaRishta data loaded from:", source, "records:", users.length);
    } catch (error) {
      if (!hasRenderedCache) {
        this.state.loading = false;
        this.renderer.showError(`Failed to load user data. ${error.message}`);
      } else {
        this.state.loading = false;
        this.renderer.showToast("Network slow. Showing saved data.");
      }
    } finally {
      this.requestSplashHide();
    }
  }

  async refreshFilters() {
    this.state.currentPage = 1;

    let result;
    try {
      result = await this.runFilterPipeline();
    } catch {
      result = applyFilters(this.state.allUsers, this.state.filters);
    }

    if (!result) return;

    const { filtered, appliedFilters } = result;

    this.state.filteredUsers = filtered;
    this.state.appliedFilters = appliedFilters;
    this.syncFiltersToUrl();

    this.logger.log("filters_applied", {
      activeFilters: appliedFilters,
      resultCount: filtered.length,
      totalUsers: this.state.allUsers.length,
    });

    this.updateDisplayedUsers();
  }

  updateDisplayedUsers() {
    const endIndex = this.state.currentPage * this.state.usersPerPage;
    this.state.displayedUsers = this.state.filteredUsers.slice(0, endIndex);

    this.renderer.renderUsers(this.state.displayedUsers);
    this.renderer.updateStatistics(this.state.filteredUsers);
    this.renderer.updateFilterChips(this.state.appliedFilters, (name) => this.removeFilter(name));
  }

  removeFilter(filterName) {
    switch (filterName) {
      case "Search":
        this.state.filters.search = "";
        this.syncInput("searchInput", "");
        this.syncInput("mobileSearchInput", "");
        break;
      case "ID":
        this.state.filters.id = "";
        this.syncInput("idFilter", "");
        this.syncInput("mobileIdFilter", "");
        break;
      case "Gender":
        this.state.filters.gender = "all";
        this.updateGenderTabs();
        break;
      case "Education":
        this.state.filters.education = "";
        this.syncInput("educationFilter", "");
        this.syncInput("mobileEducationFilter", "");
        break;
      default:
        break;
    }

    this.refreshFilters();
  }

  clearAllFilters() {
    this.state.filters = {
      search: "",
      id: "",
      gender: "all",
      education: "",
      sort: "dateDesc",
    };

    this.syncInput("searchInput", "");
    this.syncInput("mobileSearchInput", "");
    this.syncInput("idFilter", "");
    this.syncInput("mobileIdFilter", "");
    this.syncInput("educationFilter", "");
    this.syncInput("mobileEducationFilter", "");
    this.syncInput("sortOrder", "dateDesc");
    this.syncInput("mobileSortOrder", "dateDesc");
    this.updateGenderTabs();
    this.refreshFilters();
  }

  handleScroll() {
    if (this.state.loading) return;

    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const documentHeight = document.documentElement.scrollHeight;

    if (scrollTop + windowHeight < documentHeight - 500) return;

    if (this.state.displayedUsers.length >= this.state.filteredUsers.length) return;

    this.state.currentPage += 1;
    this.updateDisplayedUsers();
  }

  updateContactLimitIndicator() {
    const remaining = this.contactService.getRemainingAttempts();
    const reset = this.contactService.formatTimeRemaining(
      this.contactService.getTimeUntilReset()
    );

    this.renderer.updateContactLimitIndicator(remaining, reset);
  }

  handleContact(user) {
    this.logger.log("contact_attempt", { userId: user.id, userGender: user.gender });

    const remaining = this.contactService.getRemainingAttempts();
    if (remaining <= 0) {
      this.logger.log("contact_limit_reached", { userId: user.id });
      const reset = this.contactService.formatTimeRemaining(
        this.contactService.getTimeUntilReset()
      );

      if (
        confirm(
          `You've reached the hourly contact limit (10 contacts/hour).\n\nResets in ${reset}.\n\nClick OK to contact support.`
        )
      ) {
        const number = config.contactLimit.businessWhatsApp.replace(/[^\d+]/g, "");
        window.open(
          `https://wa.me/${number}?text=Hi! I need unlimited access to InstaRishta contacts.`,
          "_blank"
        );
      }

      return;
    }

    this.contactService.recordAttempt();
    this.logger.log("contact_success", {
      userId: user.id,
      remaining: this.contactService.getRemainingAttempts(),
    });

    if (user.whatsapp) {
      window.open(`https://wa.me/${user.whatsapp}`, "_blank");
    } else if (user.phone) {
      this.renderer.showToast(`Contact: ${user.phone}`);
    } else {
      this.renderer.showToast("No contact information available");
    }

    this.updateContactLimitIndicator();
  }

  handleCall(user) {
    this.logger.log("call_attempt", { userId: user.id, userGender: user.gender });

    const remaining = this.contactService.getRemainingAttempts();
    if (remaining <= 0) {
      this.logger.log("call_limit_reached", { userId: user.id });
      const reset = this.contactService.formatTimeRemaining(
        this.contactService.getTimeUntilReset()
      );

      if (
        confirm(
          `You've reached the hourly contact limit (10 contacts/hour).\n\nResets in ${reset}.\n\nClick OK to call support.`
        )
      ) {
        window.open(`tel:${config.contactLimit.businessPhone}`, "_self");
      }
      return;
    }

    this.contactService.recordAttempt();
    this.logger.log("call_success", {
      userId: user.id,
      remaining: this.contactService.getRemainingAttempts(),
    });

    if (user.phone) {
      window.open(`tel:${user.phone}`, "_self");
    } else {
      this.renderer.showToast("No phone number available");
    }

    this.updateContactLimitIndicator();
  }

  handleBiodata(user) {
    const url = `https://instagram.com/instarishta__/${user.id}`;
    window.open(url, "_blank");
  }

  async handleShareCard(user) {
    this.logger.log("card_share_attempt", { userId: user.id });
    try {
      await this.renderer.shareUserCard(user);
      this.logger.log("card_share_success", { userId: user.id });
    } catch (error) {
      this.logger.log("card_share_failed", {
        userId: user.id,
        reason: error?.message || "unknown",
      });
      this.renderer.showToast("Unable to share this card");
    }
  }

  handleLongPressCard(user) {
    this.logger.log("card_long_press", { userId: user.id });
    this.handleBiodata(user);
  }
}

domReady(() => {
  const app = new InstaRishtaApp();
  app.init();
  window.instaRishtaApp = app;
});
