import { config } from "./config.js";
import { createState } from "./state.js";
import { $, $$, debounce, domReady, getQueryParam } from "./utils.js";
import { StorageService } from "./services/storage-service.js";
import { ActivityLogger } from "./services/activity-logger.js";
import { ContactService } from "./services/contact-service.js";
import { DataService } from "./services/data-service.js";
import { VoicePreviewService } from "./services/voice-preview-service.js";
import { applyFilters } from "./modules/filter-engine.js";
import { ThemeController } from "./modules/theme-controller.js";
import { TypingController } from "./modules/typing-controller.js";
import { DrawerController } from "./modules/drawer-controller.js";
import { Renderer } from "./modules/renderer.js";
import { AdminController } from "./modules/admin-controller.js";
import { initRuntimeManager } from "./security/runtime-manager.js";
import { escapeHtml, toSafeString, toTitleCase } from "./utils.js";

const runtime = initRuntimeManager(config);

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
    this.splashVisibleAt =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    this.storage = new StorageService();
    this.logger = new ActivityLogger(this.storage, config.activityLogKey);
    this.contactService = new ContactService(this.storage, config.contactLimit);
    this.audioPreviewLimit = new ContactService(
      this.storage,
      config.audioPreviewLimit,
    );
    this.runtime = runtime;
    this.dataService = new DataService(config.dataSources, {
      allowTestData: config.allowTestData,
      useTestData: config.useTestData,
      secureRuntimeSource: config.secureRuntimeSource,
    });
    this.voicePreviews = new VoicePreviewService({
      onStateChange: (userId, state) =>
        this.renderer.setVoicePreviewState(userId, state),
    });

    this.renderer = new Renderer({
      onContact: (user) => this.handleContact(user),
      onCall: (user) => this.handleCall(user),
      onInstagram: (user) => this.handleInstagram(user),
      onBiodata: (user) => this.handleBiodata(user),
      onShare: (user) => this.handleShareCard(user),
      onLongPress: (user) => this.handleLongPressCard(user),
      onVoicePreview: (user) => this.handleVoicePreview(user),
      getVoicePreviewMeta: (user) => this.voicePreviews.getPreviewMeta(user),
      getVoicePreviewState: (userId) => this.voicePreviews.getState(userId),
    });

    this.theme = new ThemeController(this.storage, config.themeStorageKey);
    this.typing = new TypingController(this.state.typing);
    this.drawer = new DrawerController();
    this.activeContactUser = null;
    this.contactFlowActionTaken = false;
    this.contactFlowReturnFocus = null;
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
    this.runtime.log("App init started", {
      mode: config.mode,
      sources: config.dataSources,
    });

    this.logger.log("page_load", {
      timestamp: Date.now(),
      referrer: document.referrer || "direct",
    });

    this.theme.init();
    this.typing.start();
    this.drawer.init();
    this.admin.init();
    this.bindContactFlow();
    this.bindUsageLimitModal();
    this.bindPostAdModal();
    this.bindInstagramViewerModal();
    this.applyFiltersFromUrl();
    this.bindEvents();
    this.applyFiltersToInputs();
    this.updateRangeDisplays();
    this.applyAccessibilityEnhancements();
    this.updateGenderTabs();
    this.updateContactLimitIndicator();
    this.renderer.updateLiveClock(new Date());
    this.bindConnectionMonitor();
    this.loadUsers();
    void this.loadPlatformMetrics();
    this.requestSplashHide();

    setInterval(() => this.updateContactLimitIndicator(), 30000);
    setInterval(() => this.renderer.updateLiveClock(new Date()), 1000);
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

    const bindRange = (id, handler) => {
      const element = $(id);
      if (!element) return;
      element.addEventListener("input", handler);
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

    const handleAgeRangeChange = (source) => {
      const min = Number($(source === "desktop" ? "ageMinFilter" : "mobileAgeMinFilter")?.value || 18);
      const max = Number($(source === "desktop" ? "ageMaxFilter" : "mobileAgeMaxFilter")?.value || 60);
      this.state.filters.ageMin = Math.min(min, max);
      this.state.filters.ageMax = Math.max(min, max);
      this.syncInput("ageMinFilter", String(this.state.filters.ageMin));
      this.syncInput("ageMaxFilter", String(this.state.filters.ageMax));
      this.syncInput("mobileAgeMinFilter", String(this.state.filters.ageMin));
      this.syncInput("mobileAgeMaxFilter", String(this.state.filters.ageMax));
      this.updateRangeDisplays();
      this.refreshFilters();
    };

    const handleHeightRangeChange = (source) => {
      const min = Number($(source === "desktop" ? "heightMinFilter" : "mobileHeightMinFilter")?.value || 54);
      const max = Number($(source === "desktop" ? "heightMaxFilter" : "mobileHeightMaxFilter")?.value || 78);
      this.state.filters.heightMin = Math.min(min, max);
      this.state.filters.heightMax = Math.max(min, max);
      this.syncInput("heightMinFilter", String(this.state.filters.heightMin));
      this.syncInput("heightMaxFilter", String(this.state.filters.heightMax));
      this.syncInput("mobileHeightMinFilter", String(this.state.filters.heightMin));
      this.syncInput("mobileHeightMaxFilter", String(this.state.filters.heightMax));
      this.updateRangeDisplays();
      this.refreshFilters();
    };

    bindRange("ageMinFilter", () => handleAgeRangeChange("desktop"));
    bindRange("ageMaxFilter", () => handleAgeRangeChange("desktop"));
    bindRange("mobileAgeMinFilter", () => handleAgeRangeChange("mobile"));
    bindRange("mobileAgeMaxFilter", () => handleAgeRangeChange("mobile"));
    bindRange("heightMinFilter", () => handleHeightRangeChange("desktop"));
    bindRange("heightMaxFilter", () => handleHeightRangeChange("desktop"));
    bindRange("mobileHeightMinFilter", () => handleHeightRangeChange("mobile"));
    bindRange("mobileHeightMaxFilter", () => handleHeightRangeChange("mobile"));

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

    $("clearAllFilters")?.addEventListener("click", () =>
      this.clearAllFilters(),
    );
    $("clearAllFiltersMobile")?.addEventListener("click", () =>
      this.clearAllFilters(),
    );

    window.addEventListener(
      "scroll",
      debounce(() => this.handleScroll(), 100),
    );
  }

  syncInput(id, value) {
    const element = $(id);
    if (element) element.value = value;
  }

  sanitizeFilters(filters = {}) {
    const next = {
      search: toSafeString(filters.search),
      id: toSafeString(filters.id),
      gender: ["all", "male", "female"].includes(toSafeString(filters.gender).toLowerCase())
        ? toSafeString(filters.gender).toLowerCase()
        : "all",
      education: toSafeString(filters.education),
      sort: ["dateDesc", "dateAsc", "userUrgent", "relevance"].includes(toSafeString(filters.sort))
        ? toSafeString(filters.sort)
        : "dateDesc",
      ageMin: Number(filters.ageMin),
      ageMax: Number(filters.ageMax),
      heightMin: Number(filters.heightMin),
      heightMax: Number(filters.heightMax),
    };

    if (!Number.isFinite(next.ageMin) || next.ageMin < 18 || next.ageMin > 60) {
      next.ageMin = 18;
    }
    if (!Number.isFinite(next.ageMax) || next.ageMax < 18 || next.ageMax > 60) {
      next.ageMax = 60;
    }
    if (next.ageMin > next.ageMax) {
      [next.ageMin, next.ageMax] = [next.ageMax, next.ageMin];
    }

    if (!Number.isFinite(next.heightMin) || next.heightMin < 54 || next.heightMin > 78) {
      next.heightMin = 54;
    }
    if (!Number.isFinite(next.heightMax) || next.heightMax < 54 || next.heightMax > 78) {
      next.heightMax = 78;
    }
    if (next.heightMin > next.heightMax) {
      [next.heightMin, next.heightMax] = [next.heightMax, next.heightMin];
    }

    return next;
  }

  getAvailableEducations(users = this.state.allUsers) {
    return [...new Set(
      (users || [])
        .map((user) => toSafeString(user.education))
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b));
  }

  syncEducationOptions(users = this.state.allUsers) {
    const educations = this.getAvailableEducations(users);
    const targets = ["educationFilter", "mobileEducationFilter"];
    const currentValue = this.state.filters.education;

    targets.forEach((id) => {
      const select = $(id);
      if (!select) return;
      select.innerHTML = [
        '<option value="">All Education</option>',
        ...educations.map((education) =>
          `<option value="${escapeHtml(education)}">${escapeHtml(education)}</option>`,
        ),
      ].join("");
      select.value = educations.includes(currentValue) ? currentValue : "";
    });

    if (currentValue && !educations.includes(currentValue)) {
      this.state.filters.education = "";
    }
  }

  formatHeightLabel(value) {
    const inches = Number(value);
    if (!Number.isFinite(inches) || inches <= 0) return "--";
    const feet = Math.floor(inches / 12);
    const remainder = inches % 12;
    return `${feet}'${remainder}"`;
  }

  updateRangeTrack(trackId, minValue, maxValue) {
    const track = $(trackId);
    if (!track) return;

    const absoluteMin = Number(track.dataset.rangeMin);
    const absoluteMax = Number(track.dataset.rangeMax);
    if (!Number.isFinite(absoluteMin) || !Number.isFinite(absoluteMax) || absoluteMax <= absoluteMin) {
      return;
    }

    const start = ((Number(minValue) - absoluteMin) / (absoluteMax - absoluteMin)) * 100;
    const end = ((Number(maxValue) - absoluteMin) / (absoluteMax - absoluteMin)) * 100;
    track.style.setProperty("--range-start", `${Math.max(0, Math.min(100, start))}%`);
    track.style.setProperty("--range-end", `${Math.max(0, Math.min(100, end))}%`);
  }

  updateRangeDisplays() {
    const ageLabel = `${this.state.filters.ageMin}-${this.state.filters.ageMax}`;
    const heightLabel = `${this.formatHeightLabel(this.state.filters.heightMin)} - ${this.formatHeightLabel(this.state.filters.heightMax)}`;
    ["ageRangeValue", "mobileAgeRangeValue"].forEach((id) => {
      const node = $(id);
      if (node) node.textContent = ageLabel;
    });
    ["heightRangeValue", "mobileHeightRangeValue"].forEach((id) => {
      const node = $(id);
      if (node) node.textContent = heightLabel;
    });
    ["ageMinValue", "mobileAgeMinValue"].forEach((id) => {
      const node = $(id);
      if (node) node.textContent = String(this.state.filters.ageMin);
    });
    ["ageMaxValue", "mobileAgeMaxValue"].forEach((id) => {
      const node = $(id);
      if (node) node.textContent = String(this.state.filters.ageMax);
    });
    ["heightMinValue", "mobileHeightMinValue"].forEach((id) => {
      const node = $(id);
      if (node) node.textContent = this.formatHeightLabel(this.state.filters.heightMin);
    });
    ["heightMaxValue", "mobileHeightMaxValue"].forEach((id) => {
      const node = $(id);
      if (node) node.textContent = this.formatHeightLabel(this.state.filters.heightMax);
    });
    this.updateRangeTrack("ageRangeTrack", this.state.filters.ageMin, this.state.filters.ageMax);
    this.updateRangeTrack("mobileAgeRangeTrack", this.state.filters.ageMin, this.state.filters.ageMax);
    this.updateRangeTrack("heightRangeTrack", this.state.filters.heightMin, this.state.filters.heightMax);
    this.updateRangeTrack("mobileHeightRangeTrack", this.state.filters.heightMin, this.state.filters.heightMax);
  }

  getNetworkSummary() {
    const connection =
      navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const effectiveType = toSafeString(connection?.effectiveType).toUpperCase();
    const downlink = Number(connection?.downlink);
    const saveData = Boolean(connection?.saveData);
    const speed = Number.isFinite(downlink) && downlink > 0
      ? downlink
      : effectiveType === "4G"
        ? 20
        : effectiveType === "3G"
          ? 6
          : effectiveType === "2G"
            ? 1.5
            : 12;

    return {
      speedNumber: Number.isFinite(speed)
        ? speed.toFixed(speed >= 10 ? 0 : 1)
        : "--",
      speedText: `${speed.toFixed(speed >= 10 ? 0 : 1)} Mbps`,
      speedLabel: effectiveType ? `${effectiveType} network quality` : "Estimated connection quality",
      speedMeta: saveData ? "Data saver is enabled" : "Estimated from your current connection",
      speedProgress: Math.max(8, Math.min(100, (speed / 40) * 100)),
    };
  }

  getFallbackActivitySummary() {
    const totalProfiles = this.state.allUsers.length || 1;
    const timestamps = this.state.allUsers
      .map((user) => Date.parse(user.date) || 0)
      .filter((value) => value > 0);
    const latestTimestamp = timestamps.length ? Math.max(...timestamps) : Date.now();
    const recentCutoff = latestTimestamp - (24 * 60 * 60 * 1000);
    const recentProfiles = this.state.allUsers.filter((user) => {
      const time = Date.parse(user.date) || 0;
      return time >= recentCutoff;
    }).length;
    const urgentVisible = this.state.allUsers.filter((user) => user.urgent).length;

    return {
      activityCount: recentProfiles,
      activityLabel: "Profiles active in the last 24 hours",
      activityMeta: `${urgentVisible} urgent listings in the full live feed`,
      activityProgress: Math.max(8, Math.min(100, (recentProfiles / totalProfiles) * 100)),
    };
  }

  getPlatformActivitySummary() {
    const metrics = this.state.platformMetrics;
    const allTimeVisitors = Number(metrics?.allTimeVisitors);
    const uniqueVisitors = Number(metrics?.uniqueVisitors);
    const newVisitorsToday = Number(metrics?.newVisitorsToday);
    const returningVisitors = Number(metrics?.returningVisitors);

    if (
      Number.isFinite(allTimeVisitors) &&
      Number.isFinite(uniqueVisitors) &&
      Number.isFinite(newVisitorsToday)
    ) {
      const progressBase = uniqueVisitors > 0 ? uniqueVisitors : Math.max(1, allTimeVisitors);
      const localSuffix = metrics?.localPreview ? " (live stats skip local previews)" : "";
      const metaParts = [
        `${allTimeVisitors} all-time visits`,
        `${uniqueVisitors} unique visitors`,
      ];

      if (Number.isFinite(returningVisitors) && returningVisitors > 0) {
        metaParts.push(`${returningVisitors} returning`);
      }

      return {
        activityCount: newVisitorsToday,
        activityLabel: `New visitors today${localSuffix}`,
        activityMeta: metaParts.join(" • "),
        activityProgress: Math.max(
          8,
          Math.min(100, (newVisitorsToday / Math.max(1, progressBase)) * 100),
        ),
      };
    }

    return this.getFallbackActivitySummary();
  }

  buildDashboardSummary() {
    return {
      ...this.getPlatformActivitySummary(),
      ...this.getNetworkSummary(),
    };
  }

  updateDashboardInsights() {
    this.renderer.updateDashboardInsights(this.buildDashboardSummary());
  }

  async loadPlatformMetrics() {
    const endpoint = toSafeString(config.platformMetricsEndpoint);
    if (!endpoint) {
      this.updateDashboardInsights();
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const isRemote = (() => {
      try {
        return new URL(endpoint, window.location.href).origin !== window.location.origin;
      } catch {
        return false;
      }
    })();

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        cache: "no-store",
        credentials: isRemote ? "omit" : "same-origin",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (!payload?.ok || !payload?.metrics) {
        throw new Error(payload?.error || "Invalid metrics payload");
      }

      this.state.platformMetrics = payload.metrics;
      this.runtime.log("Platform metrics loaded", payload.metrics);
    } catch (error) {
      this.runtime.warn("Platform metrics unavailable", {
        endpoint,
        message: error?.message || "Unknown error",
      });
    } finally {
      clearTimeout(timeoutId);
      this.updateDashboardInsights();
    }
  }

  bindConnectionMonitor() {
    const connection =
      navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection?.addEventListener) {
      this.updateDashboardInsights();
      return;
    }
    connection.addEventListener("change", () => this.updateDashboardInsights());
    this.updateDashboardInsights();
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
    const ageMin = Number(getQueryParam("ageMin"));
    const ageMax = Number(getQueryParam("ageMax"));
    const heightMin = Number(getQueryParam("heightMin"));
    const heightMax = Number(getQueryParam("heightMax"));

    if (search) nextFilters.search = search;
    if (id) nextFilters.id = id;
    if (education) nextFilters.education = education;
    if (Number.isFinite(ageMin)) nextFilters.ageMin = ageMin;
    if (Number.isFinite(ageMax)) nextFilters.ageMax = ageMax;
    if (Number.isFinite(heightMin)) nextFilters.heightMin = heightMin;
    if (Number.isFinite(heightMax)) nextFilters.heightMax = heightMax;

    if (gender && ["all", "male", "female"].includes(gender)) {
      nextFilters.gender = gender;
    }

    if (
      sort &&
      ["dateDesc", "dateAsc", "userUrgent", "relevance"].includes(sort)
    ) {
      nextFilters.sort = sort;
    }

    this.state.filters = this.sanitizeFilters(nextFilters);
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
    this.syncInput("ageMinFilter", String(this.state.filters.ageMin));
    this.syncInput("ageMaxFilter", String(this.state.filters.ageMax));
    this.syncInput("mobileAgeMinFilter", String(this.state.filters.ageMin));
    this.syncInput("mobileAgeMaxFilter", String(this.state.filters.ageMax));
    this.syncInput("heightMinFilter", String(this.state.filters.heightMin));
    this.syncInput("heightMaxFilter", String(this.state.filters.heightMax));
    this.syncInput("mobileHeightMinFilter", String(this.state.filters.heightMin));
    this.syncInput("mobileHeightMaxFilter", String(this.state.filters.heightMax));
  }

  syncFiltersToUrl() {
    this.state.filters = this.sanitizeFilters(this.state.filters);

    const defaults = {
      search: "",
      id: "",
      gender: "all",
      education: "",
      sort: "dateDesc",
      ageMin: 18,
      ageMax: 60,
      heightMin: 54,
      heightMax: 78,
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
    applyParam("ageMin", String(this.state.filters.ageMin), String(defaults.ageMin));
    applyParam("ageMax", String(this.state.filters.ageMax), String(defaults.ageMax));
    applyParam("heightMin", String(this.state.filters.heightMin), String(defaults.heightMin));
    applyParam("heightMax", String(this.state.filters.heightMax), String(defaults.heightMax));

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
    $("mobileEducationFilter")?.setAttribute(
      "aria-label",
      "Filter by education",
    );
    $("ageMinFilter")?.setAttribute("aria-label", "Minimum age");
    $("ageMaxFilter")?.setAttribute("aria-label", "Maximum age");
    $("mobileAgeMinFilter")?.setAttribute("aria-label", "Minimum age");
    $("mobileAgeMaxFilter")?.setAttribute("aria-label", "Maximum age");
    $("heightMinFilter")?.setAttribute("aria-label", "Minimum height");
    $("heightMaxFilter")?.setAttribute("aria-label", "Maximum height");
    $("mobileHeightMinFilter")?.setAttribute("aria-label", "Minimum height");
    $("mobileHeightMaxFilter")?.setAttribute("aria-label", "Maximum height");

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

  bindContactFlow() {
    this.contactFlowModal = $("contactFlowModal");
    this.contactFlowTitle = $("contactFlowTitle");
    this.contactFlowCopy = $("contactFlowCopy");
    this.contactFlowSummary = $("contactFlowSummary");
    this.contactFlowBadges = $("contactFlowBadges");
    this.contactFlowMessage = $("contactFlowMessage");
    this.contactFlowPrimaryBtn = $("contactFlowPrimaryBtn");
    this.contactFlowCallBtn = $("contactFlowCallBtn");
    this.closeContactFlowBtn = $("closeContactFlow");
    this.contactFlowActionButtons = [
      this.contactFlowPrimaryBtn,
      this.contactFlowCallBtn,
    ].filter(Boolean);

    const close = () => this.closeContactFlow();

    this.contactFlowModal?.addEventListener("click", (event) => {
      if (event.target?.dataset?.contactClose !== undefined) close();
    });
    this.closeContactFlowBtn?.addEventListener("click", close);
    this.contactFlowPrimaryBtn?.addEventListener("click", () =>
      this.openPrimaryContact(),
    );
    this.contactFlowCallBtn?.addEventListener("click", () =>
      this.callPrimaryContact(),
    );

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.contactFlowModal?.hidden) {
        close();
      }
    });
  }

  bindPostAdModal() {
    this.postAdModal = $("postAdModal");
    this.postAdFrame = $("postAdFrame");
    this.closePostAdBtn = $("closePostAd");
    this.postAdOpeners = $$("[data-open-post-ad]");

    const close = () => this.closePostAdModal();

    this.postAdModal?.addEventListener("click", (event) => {
      if (event.target?.dataset?.postAdClose !== undefined) close();
    });
    this.closePostAdBtn?.addEventListener("click", close);
    this.postAdOpeners.forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        this.openPostAdModal();
      });
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.postAdModal?.hidden) {
        close();
      }
    });
  }

  bindInstagramViewerModal() {
    this.instagramViewerModal = $("instagramViewerModal");
    this.instagramViewerFrame = $("instagramViewerFrame");
    this.instagramViewerMeta = $("instagramViewerMeta");
    this.instagramViewerPostId = $("instagramViewerPostId");
    this.instagramViewerContent = $("instagramViewerContent");
    this.instagramViewerFollowBtn = $("instagramViewerFollowBtn");
    this.instagramViewerShareBtn = $("instagramViewerShareBtn");
    this.instagramViewerOpenBtn = $("instagramViewerOpenBtn");
    this.closeInstagramViewerBtn = $("closeInstagramViewer");
    this.instagramViewerReturnFocus = null;
    this.activeInstagramUser = null;
    this.activeInstagramResource = null;

    const close = () => this.closeInstagramViewer();

    this.instagramViewerModal?.addEventListener("click", (event) => {
      if (event.target?.dataset?.instagramViewerClose !== undefined) close();
    });
    this.closeInstagramViewerBtn?.addEventListener("click", close);
    this.instagramViewerShareBtn?.addEventListener("click", () =>
      this.shareInstagramProfile(),
    );

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.instagramViewerModal?.hidden) {
        close();
      }
    });
  }

  bindUsageLimitModal() {
    this.usageLimitModal = $("usageLimitModal");
    this.usageLimitTitle = $("usageLimitTitle");
    this.usageLimitCopy = $("usageLimitCopy");
    this.usageLimitBody = $("usageLimitBody");
    this.usageLimitPrimaryBtn = $("usageLimitPrimaryBtn");
    this.usageLimitSecondaryBtn = $("usageLimitSecondaryBtn");
    this.closeUsageLimitBtn = $("closeUsageLimit");
    this.usageLimitSupportAction = null;

    const close = () => this.closeUsageLimitModal();

    this.usageLimitModal?.addEventListener("click", (event) => {
      if (event.target?.dataset?.usageLimitClose !== undefined) close();
    });
    this.closeUsageLimitBtn?.addEventListener("click", close);
    this.usageLimitSecondaryBtn?.addEventListener("click", close);
    this.usageLimitPrimaryBtn?.addEventListener("click", () =>
      this.openUsageLimitSupport(),
    );

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.usageLimitModal?.hidden) {
        close();
      }
    });
  }

  requestSplashHide() {
    if (this.splashDismissScheduled) return;

    this.splashDismissScheduled = true;
    const splash = $("splashScreen");
    if (!splash) return;
    const hideSplash = typeof window.__INSTA_HIDE_SPLASH__ === "function"
      ? window.__INSTA_HIDE_SPLASH__
      : () => {
          splash.classList.add("is-hidden");
          window.setTimeout(() => splash.remove(), 420);
        };

    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsed = now - this.splashVisibleAt;
    const delay = Math.max(0, 250 - elapsed);

    window.setTimeout(() => {
      hideSplash();
    }, delay);
  }

  updateGenderTabs() {
    $$(".gender-tab, .gender-grid a").forEach((tab) => {
      const active =
        tab.getAttribute("data-gender") === this.state.filters.gender;
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
      this.runtime.log("Using cached users", {
        source: cached.source,
        rows: cached.users.length,
        expired: cached.expired,
      });
      this.state.allUsers = cached.users;
      this.state.activeDataSource = `${cached.source} (cache)`;
      this.syncEducationOptions(cached.users);
      this.state.loading = false;
      this.renderer.hideLoading();
      await this.refreshFilters();
      void this.syncUsersToWorker();
      hasRenderedCache = true;
    }

    try {
      this.runtime.log("Loading users from source", {
        sources: config.dataSources,
      });
      const { users, source } = await this.dataService.loadUsers();
      const incomingSignature = this.dataService.getUsersSignature(users);
      const currentSignature = this.dataService.getUsersSignature(
        this.state.allUsers,
      );
      const shouldRefreshView =
        !hasRenderedCache || incomingSignature !== currentSignature;

      this.state.allUsers = users;
      this.state.activeDataSource = source;
      this.syncEducationOptions(users);

      if (shouldRefreshView) {
        this.state.loading = false;
        this.renderer.hideLoading();
        await this.refreshFilters();
      }
      void this.syncUsersToWorker();

      this.runtime.log("Users loaded", {
        source,
        rows: users.length,
      });
    } catch (error) {
      this.runtime.error("Failed to load users", error, {
        sources: config.dataSources,
      });
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
    this.updateDashboardInsights();
    this.renderer.updateFilterChips(
      this.state.appliedFilters,
      (name) => this.removeFilter(name),
      () => this.clearAllFilters(),
    );
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
      case "Age":
        this.state.filters.ageMin = 18;
        this.state.filters.ageMax = 60;
        this.syncInput("ageMinFilter", "18");
        this.syncInput("ageMaxFilter", "60");
        this.syncInput("mobileAgeMinFilter", "18");
        this.syncInput("mobileAgeMaxFilter", "60");
        this.updateRangeDisplays();
        break;
      case "Height":
        this.state.filters.heightMin = 54;
        this.state.filters.heightMax = 78;
        this.syncInput("heightMinFilter", "54");
        this.syncInput("heightMaxFilter", "78");
        this.syncInput("mobileHeightMinFilter", "54");
        this.syncInput("mobileHeightMaxFilter", "78");
        this.updateRangeDisplays();
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
      ageMin: 18,
      ageMax: 60,
      heightMin: 54,
      heightMax: 78,
    };
    this.state.filters = this.sanitizeFilters(this.state.filters);

    this.syncInput("searchInput", "");
    this.syncInput("mobileSearchInput", "");
    this.syncInput("idFilter", "");
    this.syncInput("mobileIdFilter", "");
    this.syncInput("educationFilter", "");
    this.syncInput("mobileEducationFilter", "");
    this.syncInput("sortOrder", "dateDesc");
    this.syncInput("mobileSortOrder", "dateDesc");
    this.syncInput("ageMinFilter", "18");
    this.syncInput("ageMaxFilter", "60");
    this.syncInput("mobileAgeMinFilter", "18");
    this.syncInput("mobileAgeMaxFilter", "60");
    this.syncInput("heightMinFilter", "54");
    this.syncInput("heightMaxFilter", "78");
    this.syncInput("mobileHeightMinFilter", "54");
    this.syncInput("mobileHeightMaxFilter", "78");
    this.updateRangeDisplays();
    this.updateGenderTabs();
    this.refreshFilters();
  }

  handleScroll() {
    if (this.state.loading) return;

    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const windowHeight =
      window.innerHeight || document.documentElement.clientHeight;
    const documentHeight = document.documentElement.scrollHeight;

    if (scrollTop + windowHeight < documentHeight - 500) return;

    if (this.state.displayedUsers.length >= this.state.filteredUsers.length)
      return;

    this.state.currentPage += 1;
    this.updateDisplayedUsers();
  }

  updateContactLimitIndicator() {
    const contactRemaining = this.contactService.getRemainingAttempts();
    const contactReset = this.contactService.formatTimeRemaining(
      this.contactService.getTimeUntilReset(),
    );
    const audioRemaining = this.audioPreviewLimit.getRemainingAttempts();
    const audioReset = this.audioPreviewLimit.formatTimeRemaining(
      this.audioPreviewLimit.getTimeUntilReset(),
    );

    this.renderer.updateContactLimitIndicator({
      contact: {
        remaining: contactRemaining,
        resetText: contactReset,
        maxAttempts: config.contactLimit.maxAttempts,
      },
      audio: {
        remaining: audioRemaining,
        resetText: audioReset,
        maxAttempts: config.audioPreviewLimit.maxAttempts,
      },
    });
  }

  buildUsageLimitCards(focus = "contact") {
    const contactRemaining = this.contactService.getRemainingAttempts();
    const contactReset = this.contactService.formatTimeRemaining(
      this.contactService.getTimeUntilReset(),
    );
    const audioRemaining = this.audioPreviewLimit.getRemainingAttempts();
    const audioReset = this.audioPreviewLimit.formatTimeRemaining(
      this.audioPreviewLimit.getTimeUntilReset(),
    );

    const cards = [];

    if (contactRemaining <= 0 || focus === "contact") {
      cards.push({
        kind: "contact",
        title: "Contact access",
        detail: `${config.contactLimit.maxAttempts} openings per hour`,
        reset: contactRemaining <= 0 ? `Resets in ${contactReset}` : "Available",
        exhausted: contactRemaining <= 0,
      });
    }

    if (audioRemaining <= 0 || focus === "audio") {
      cards.push({
        kind: "audio",
        title: "Voice previews",
        detail: `${config.audioPreviewLimit.maxAttempts} listens per hour`,
        reset: audioRemaining <= 0 ? `Resets in ${audioReset}` : "Available",
        exhausted: audioRemaining <= 0,
      });
    }

    return { cards };
  }

  openUsageLimitModal({ focus = "contact", supportKind = null } = {}) {
    if (!this.usageLimitModal) return;

    const { cards } = this.buildUsageLimitCards(focus);
    if (!cards.length) return;

    const primaryCard = cards.find((card) => card.kind === focus) || cards[0];

    if (this.usageLimitTitle) {
      this.usageLimitTitle.textContent =
        primaryCard.kind === "audio"
          ? "Voice preview limit reached"
          : "Contact limit reached";
    }

    if (this.usageLimitCopy) {
      this.usageLimitCopy.textContent =
        primaryCard.kind === "audio"
          ? "Voice previews are paused until the current hourly window resets."
          : "Contact access is paused until the current hourly window resets.";
    }

    if (this.usageLimitBody) {
      this.usageLimitBody.innerHTML = cards
        .map(
          (card) => `
            <div class="usage-limit-card${card.exhausted ? " is-exhausted" : ""}">
              <span class="usage-limit-chip">${escapeHtml(card.title)}</span>
              <strong>${escapeHtml(card.detail)}</strong>
              <p>${escapeHtml(card.reset)}</p>
            </div>
          `,
        )
        .join("");
    }

    this.usageLimitSupportAction = supportKind;
    if (this.usageLimitPrimaryBtn) {
      const showSupport = supportKind === "whatsapp" || supportKind === "call";
      this.usageLimitPrimaryBtn.hidden = !showSupport;
      this.usageLimitPrimaryBtn.textContent =
        supportKind === "call" ? "Call support" : "Contact support";
    }

    this.usageLimitModal.hidden = false;
    this.usageLimitModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    (this.usageLimitPrimaryBtn && !this.usageLimitPrimaryBtn.hidden
      ? this.usageLimitPrimaryBtn
      : this.usageLimitSecondaryBtn
    )?.focus();
  }

  closeUsageLimitModal() {
    if (!this.usageLimitModal) return;
    this.usageLimitModal.hidden = true;
    this.usageLimitModal.setAttribute("aria-hidden", "true");
    this.usageLimitSupportAction = null;

    if (
      this.contactFlowModal?.hidden === false ||
      this.postAdModal?.hidden === false ||
      this.instagramViewerModal?.hidden === false
    ) {
      document.body.style.overflow = "hidden";
      return;
    }

    document.body.style.overflow = "";
  }

  openUsageLimitSupport() {
    if (this.usageLimitSupportAction === "call") {
      const number = this.normalizeDialNumber(config.contactLimit.businessPhone);
      if (number) window.open(`tel:${number}`, "_self");
      this.closeUsageLimitModal();
      return;
    }

    if (this.usageLimitSupportAction === "whatsapp") {
      const number = this.normalizeWhatsAppNumber(
        config.contactLimit.businessWhatsApp,
      );
      if (number) {
        window.open(
          `https://wa.me/${number}?text=${encodeURIComponent("Hi! I need unlimited access to InstaRishta contacts.")}`,
          "_blank",
        );
      }
    }

    this.closeUsageLimitModal();
  }

  handleContact(user) {
    this.logger.log("contact_attempt", {
      userId: user.id,
      userGender: user.gender,
    });

    const remaining = this.contactService.getRemainingAttempts();
    if (remaining <= 0) {
      this.logger.log("contact_limit_reached", { userId: user.id });
      this.openUsageLimitModal({ focus: "contact", supportKind: "whatsapp" });
      return;
    }

    if (
      !this.getPreferredWhatsAppNumber(user) &&
      !this.getPreferredCallNumber(user)
    ) {
      this.renderer.showToast("No contact number available");
      return;
    }

    this.openContactFlow(user);
    this.updateContactLimitIndicator();
  }

  handleCall(user) {
    this.logger.log("call_attempt", {
      userId: user.id,
      userGender: user.gender,
    });

    const remaining = this.contactService.getRemainingAttempts();
    if (remaining <= 0) {
      this.logger.log("call_limit_reached", { userId: user.id });
      this.openUsageLimitModal({ focus: "contact", supportKind: "call" });
      return;
    }

    const mode = this.getContactMode(user);
    const needsProtectedFlow = mode === "family" || mode === "private";
    if (
      needsProtectedFlow &&
      (user.guardianPhone || user.whatsapp || user.phone)
    ) {
      this.openContactFlow(user);
      this.updateContactLimitIndicator();
      return;
    }

    const number = this.getPreferredCallNumber(user);
    if (!number) {
      this.renderer.showToast("No phone number available");
      return;
    }

    this.performOutboundAction({
      user,
      kind: "call",
      targetUrl: `tel:${number}`,
      windowTarget: "_self",
      supportLabel: "call",
    });
  }

  resolveInstagramResource(user) {
    const instagramTarget = toSafeString(user?.instagramPostId);
    if (!instagramTarget) return null;

    const cleanTarget = instagramTarget.trim();
    const fallbackType = "p";
    let type = fallbackType;
    let postId = "";
    let canonicalUrl = "";

    if (/^https?:\/\//i.test(cleanTarget)) {
      try {
        const parsed = new URL(cleanTarget);
        const host = parsed.hostname.toLowerCase();
        if (!host.includes("instagram.com")) {
          return null;
        }

        const parts = parsed.pathname
          .split("/")
          .map((part) => part.trim())
          .filter(Boolean);
        const supported = new Set(["p", "reel", "tv"]);
        if (parts.length >= 2 && supported.has(parts[0].toLowerCase())) {
          type = parts[0].toLowerCase();
          postId = parts[1];
        } else if (parts.length >= 1) {
          postId = parts[0];
        }
      } catch {
        return null;
      }
    } else if (/^(p|reel|tv)\//i.test(cleanTarget)) {
      const parts = cleanTarget.replace(/^\/+/, "").split("/");
      type = toSafeString(parts[0]).toLowerCase() || fallbackType;
      postId = toSafeString(parts[1]);
    } else {
      postId = cleanTarget.replace(/^\/+|\/+$/g, "");
    }

    postId = postId.replace(/[?#].*$/, "").trim();
    if (!postId) return null;

    canonicalUrl = `https://www.instagram.com/${type}/${encodeURIComponent(postId)}/`;
    const embedUrl = `https://www.instagram.com/${type}/${encodeURIComponent(postId)}/embed/`;

    return {
      type,
      postId,
      canonicalUrl,
      embedUrl,
    };
  }

  resolveBiodataUrl(user) {
    const target = toSafeString(user?.biodataUrl);
    if (!target) return "";

    if (/^(https?:|mailto:|tel:|blob:|data:)/i.test(target)) {
      return target;
    }

    try {
      return new URL(target, window.location.href).href;
    } catch {
      return "";
    }
  }

  handleInstagram(user) {
    const resource = this.resolveInstagramResource(user);
    if (!resource) {
      this.renderer.showToast("No Instagram post available");
      return;
    }
    this.openInstagramViewer(user, resource);
  }

  openInstagramViewer(user, resource) {
    if (!this.instagramViewerModal) {
      window.open(resource.canonicalUrl, "_blank");
      return;
    }

    this.activeInstagramUser = user;
    this.activeInstagramResource = resource;
    const profileTitle = this.getProfileTitle(user);
    const profileShareUrl = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(String(user.id || ""))}`;
    const profileSummary = toSafeString(user?.body).replace(/\s+/g, " ").trim();

    if (this.instagramViewerMeta) {
      this.instagramViewerMeta.textContent = `LR ${user.id} • ${profileTitle}`;
    }
    if (this.instagramViewerPostId) {
      this.instagramViewerPostId.textContent = `Post ID: ${resource.postId}`;
    }
    if (this.instagramViewerContent) {
      this.instagramViewerContent.textContent = profileSummary
        ? profileSummary.slice(0, 220)
        : "Instagram post preview linked with this profile.";
    }
    if (this.instagramViewerFrame) {
      this.instagramViewerFrame.src = resource.embedUrl;
    }
    if (this.instagramViewerFollowBtn) {
      this.instagramViewerFollowBtn.href = config.instagramProfileUrl || "https://www.instagram.com/instarishta/";
    }
    if (this.instagramViewerOpenBtn) {
      this.instagramViewerOpenBtn.href = resource.canonicalUrl;
    }
    if (this.instagramViewerShareBtn) {
      this.instagramViewerShareBtn.dataset.shareUrl = profileShareUrl;
      this.instagramViewerShareBtn.dataset.postUrl = resource.canonicalUrl;
    }

    this.instagramViewerReturnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.instagramViewerModal.hidden = false;
    this.instagramViewerModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    this.closeInstagramViewerBtn?.focus();
  }

  shareInstagramProfile() {
    if (!this.activeInstagramUser) return;

    const shareUrl = toSafeString(this.instagramViewerShareBtn?.dataset?.shareUrl);
    const postUrl = toSafeString(this.instagramViewerShareBtn?.dataset?.postUrl);
    const profileTitle = this.getProfileTitle(this.activeInstagramUser);
    const text = encodeURIComponent(
      `Check this InstaRishta profile: LR ${this.activeInstagramUser.id} (${profileTitle}) ${shareUrl || window.location.href} Instagram: ${postUrl}`,
    );

    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener");
  }

  closeInstagramViewer() {
    if (!this.instagramViewerModal) return;
    this.instagramViewerModal.hidden = true;
    this.instagramViewerModal.setAttribute("aria-hidden", "true");

    if (this.instagramViewerFrame) {
      this.instagramViewerFrame.removeAttribute("src");
    }
    this.activeInstagramUser = null;
    this.activeInstagramResource = null;

    document.body.style.overflow =
      this.usageLimitModal?.hidden === false ||
      this.contactFlowModal?.hidden === false ||
      this.postAdModal?.hidden === false
        ? "hidden"
        : "";

    const returnFocus = this.instagramViewerReturnFocus;
    this.instagramViewerReturnFocus = null;
    if (returnFocus && typeof returnFocus.focus === "function") {
      returnFocus.focus();
    }
  }

  handleBiodata(user) {
    const url = this.resolveBiodataUrl(user);
    if (!url) {
      this.renderer.showToast("No biodata available");
      return;
    }
    window.open(url, "_blank");
  }

  async handleShareCard(user, card) {
    this.logger.log("card_share_attempt", { userId: user.id });
    try {
      await this.renderer.shareUserCard(user, card);
      this.logger.log("card_share_success", { userId: user.id });
    } catch (error) {
      this.logger.log("card_share_failed", {
        userId: user.id,
        reason: error?.message || "unknown",
      });
      this.renderer.showToast("Unable to share this card");
    }
  }

  async handleVoicePreview(user) {
    this.logger.log("voice_preview_attempt", { userId: user.id });
    const actionType = this.voicePreviews.getActionType(user);

    if (actionType === "start") {
      const remaining = this.audioPreviewLimit.getRemainingAttempts();
      if (remaining <= 0) {
        this.logger.log("voice_preview_limit_reached", { userId: user.id });
        this.openUsageLimitModal({ focus: "audio" });
        this.updateContactLimitIndicator();
        return;
      }
    }

    try {
      await this.voicePreviews.toggle(user);
      if (actionType === "start") {
        this.audioPreviewLimit.recordAttempt();
        this.updateContactLimitIndicator();
      }
      this.logger.log("voice_preview_toggle", { userId: user.id });
    } catch (error) {
      this.logger.log("voice_preview_failed", {
        userId: user.id,
        reason: error?.message || "unknown",
      });
      this.renderer.showToast("Voice preview unavailable right now");
    }
  }

  handleLongPressCard(user) {
    this.logger.log("card_long_press", { userId: user.id });
    if (user.biodataUrl) {
      this.handleBiodata(user);
      return;
    }
    if (user.instagramPostId) {
      this.handleInstagram(user);
      return;
    }
    this.renderer.showToast("No external profile details available");
  }

  getContactMode(user) {
    if (user.familyApproval) return "family";
    if (user.contactMode) return user.contactMode;
    return "direct";
  }

  getProfileTitle(user) {
    const title = toSafeString(user?.title);
    if (title) return title;
    if (user?.gender === "female") return "ضرورت رشتہ لڑکی";
    if (user?.gender === "male") return "ضرورت رشتہ لڑکا";
    return "ضرورت رشتہ";
  }

  normalizeDialNumber(value) {
    return toSafeString(value).replace(/[^\d+]/g, "");
  }

  normalizeWhatsAppNumber(value) {
    return this.normalizeDialNumber(value).replace(/\+/g, "");
  }

  getPreferredWhatsAppNumber(user) {
    const mode = this.getContactMode(user);
    const preferred =
      mode === "family"
        ? user.guardianPhone || user.whatsapp || user.phone
        : user.whatsapp || user.phone || user.guardianPhone;
    return this.normalizeWhatsAppNumber(preferred);
  }

  getPreferredCallNumber(user) {
    const mode = this.getContactMode(user);
    const preferred =
      mode === "family"
        ? user.guardianPhone || user.phone
        : user.phone || user.guardianPhone;
    return this.normalizeDialNumber(preferred);
  }

  buildContactSummaryHtml(user, mode) {
    const summaryItems = [
      {
        icon: `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
            <path d="M8 7h8"></path>
            <path d="M8 12h8"></path>
            <path d="M8 17h5"></path>
            <rect x="4" y="3.5" width="16" height="17" rx="3"></rect>
          </svg>
        `,
        label: `LR ${user.id}`,
      },
      {
        icon: `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
            <path d="M12 3.5 5 6.5v5.5c0 4.1 2.7 7.9 7 9 4.3-1.1 7-4.9 7-9V6.5l-7-3Z"></path>
            ${user.verified ? '<path d="m9.5 12.3 1.8 1.8 3.7-4"></path>' : '<path d="M9.5 9.5 14.5 14.5"></path><path d="M14.5 9.5 9.5 14.5"></path>'}
          </svg>
        `,
        label: user.verified ? "Verified profile" : "Unverified profile",
      },
      {
        icon: `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
            ${
              mode === "family"
                ? '<path d="M7 20v-7.5A2.5 2.5 0 0 1 9.5 10H15a2 2 0 0 1 2 2V20"></path><path d="M9 7a3 3 0 1 0 0-.01Z"></path><path d="M17.5 9.5a2.5 2.5 0 1 0 0-.01Z"></path><path d="M16 20v-5"></path>'
                : mode === "private"
                  ? '<rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7.5a4 4 0 1 1 8 0V10"></path>'
                  : '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>'
            }
          </svg>
        `,
        label:
          mode === "family"
            ? "Guardian contact"
            : mode === "private"
              ? "Private contact"
              : "Direct contact",
      },
    ];

    return summaryItems
      .map(
        (item) => `
          <span class="contact-summary-item">
            <span class="contact-summary-icon">${item.icon}</span>
            <span>${escapeHtml(item.label)}</span>
          </span>
        `,
      )
      .join("");
  }

  setContactFlowButtonContent(button, kind, label) {
    if (!button) return;

    const icon =
      kind === "whatsapp"
        ? `
          <svg class="contact-flow-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>
            <path d="M9.5 9.5c.4 2 2.1 3.7 4.1 4.1"></path>
          </svg>
        `
        : `
          <svg class="contact-flow-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
          </svg>
        `;

    button.innerHTML = `
      <span class="contact-flow-action-icon-wrap">${icon}</span>
      <span class="contact-flow-action-copy">
        <span class="contact-flow-action-label">${escapeHtml(label)}</span>
      </span>
    `;
  }

  buildContactMessage(user) {
    const mode = this.getContactMode(user);
    const title = this.getProfileTitle(user);
    const body = toSafeString(user?.body);
    const notes = toSafeString(user?.notes);
    const contactNotes = toSafeString(user?.contactNotes);
    const lines = [
      "Assalamu Alaikum,",
      "We have seen your InstaRishta profile ad and are interested in a serious nikah conversation.",
      mode === "family"
        ? "We are redirecting you to the preferred guardian contact for this profile."
        : mode === "private"
          ? "We respect the private contact preference and have drafted a respectful message below."
          : "",
      `InstaRishta ID: IR ${user.id}`,
      `Title: ${title}`,
    ];

    if (user.age) lines.push(`Age: ${user.age}`);
    if (user.gender) lines.push(`Gender: ${toTitleCase(user.gender)}`);
    if (user.education) lines.push(`Education: ${user.education}`);
    if (user.location) lines.push(`Location: ${user.location}`);
    if (user.values) lines.push(`Values: ${user.values}`);
    if (user.verified) lines.push("Verification: Verified profile");
    if (user.familyApproval) lines.push("Family approval: Enabled");
    if (mode !== "direct") {
      lines.push(
        `Contact mode: ${mode === "family" ? "Guardian contact" : "Private contact"}`,
      );
    }
    if (user.instagramPostId)
      lines.push(`Instagram post: ${user.instagramPostId}`);
    if (contactNotes) lines.push(`Contact notes: ${contactNotes}`);
    if (notes) lines.push(`Notes: ${notes}`);
    if (body) {
      lines.push("");
      lines.push("Your Profile Ad:");
      lines.push(body);
    }
    lines.push("");
    lines.push(
      mode === "family"
        ? "Please respond to this message and share the best time to connect with the guardian/family contact."
        : mode === "private"
          ? "Please respond to this message and share the best time to connect privately."
          : "Please respond to this message and share the best time to connect.",
    );
    lines.push("JazakAllah Khair.");

    return lines.join("\n");
  }

  setContactFlowActionsDisabled(disabled) {
    (this.contactFlowActionButtons || []).forEach((button) => {
      if (!button) return;
      button.disabled = Boolean(disabled);
    });
  }

  openContactFlow(user) {
    this.activeContactUser = user;
    this.contactFlowActionTaken = false;
    this.contactFlowReturnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const mode = this.getContactMode(user);
    const message = this.buildContactMessage(user);
    const whatsappNumber = this.getPreferredWhatsAppNumber(user);
    const callNumber = this.getPreferredCallNumber(user);
    const headline =
      mode === "family"
        ? "Guardian contact"
        : mode === "private"
          ? "Private contact"
          : "Contact this ad";
    const summaryParts = [
      `LR ${user.id}`,
      user.verified ? "Verified profile" : "Unverified profile",
      mode === "family"
        ? "Guardian contact"
        : mode === "private"
          ? "Private contact"
          : "Direct contact",
      user.familyApproval ? "Family approval" : "",
    ].filter(Boolean);
    const badges = [
      user.verified
        ? '<span class="contact-pill contact-pill-verified">Verified</span>'
        : "",
      user.familyApproval
        ? '<span class="contact-pill contact-pill-family">Family approved</span>'
        : "",
      mode !== "direct"
        ? `<span class="contact-pill contact-pill-mode">${escapeHtml(mode === "family" ? "Wali contact" : "Private contact")}</span>`
        : "",
    ]
      .filter(Boolean)
      .join("");

    if (this.contactFlowTitle) this.contactFlowTitle.textContent = headline;
    if (this.contactFlowCopy) {
      this.contactFlowCopy.textContent =
        mode === "family"
          ? "You are being redirected to the preferred guardian contact for this ad. Edit the drafted message below if needed."
          : mode === "private"
            ? "This profile prefers a private first contact. Edit the drafted message below before sending."
            : "We have prepared a respectful message with the full profile details below. Edit it if needed before sending.";
    }
    if (this.contactFlowSummary)
      this.contactFlowSummary.innerHTML = this.buildContactSummaryHtml(
        user,
        mode,
      );
    if (this.contactFlowBadges) this.contactFlowBadges.innerHTML = badges;
    if (this.contactFlowMessage) this.contactFlowMessage.value = message;

    if (this.contactFlowPrimaryBtn) {
      const primaryLabel =
        mode === "family" ? "Chat guardian on WhatsApp" : "Chat on WhatsApp";
      this.setContactFlowButtonContent(
        this.contactFlowPrimaryBtn,
        "whatsapp",
        primaryLabel,
      );
      this.contactFlowPrimaryBtn.setAttribute("aria-label", primaryLabel);
      this.contactFlowPrimaryBtn.hidden = !whatsappNumber;
      this.contactFlowPrimaryBtn.disabled = !whatsappNumber;
    }
    if (this.contactFlowCallBtn) {
      const callLabel = mode === "family" ? "Call guardian" : "Call now";
      this.setContactFlowButtonContent(
        this.contactFlowCallBtn,
        "call",
        callLabel,
      );
      this.contactFlowCallBtn.setAttribute("aria-label", callLabel);
      this.contactFlowCallBtn.hidden = !callNumber;
      this.contactFlowCallBtn.disabled = !callNumber;
    }
    this.setContactFlowActionsDisabled(false);

    if (this.contactFlowModal) {
      this.contactFlowModal.hidden = false;
      this.contactFlowModal.setAttribute("aria-hidden", "false");
    }
    document.body.style.overflow = "hidden";

    const focusTarget =
      this.contactFlowPrimaryBtn && !this.contactFlowPrimaryBtn.hidden
        ? this.contactFlowPrimaryBtn
        : this.contactFlowCallBtn && !this.contactFlowCallBtn.hidden
          ? this.contactFlowCallBtn
          : this.closeContactFlowBtn;
    focusTarget?.focus();
  }

  closeContactFlow() {
    if (!this.contactFlowModal) return;
    this.contactFlowModal.hidden = true;
    this.contactFlowModal.setAttribute("aria-hidden", "true");
    this.activeContactUser = null;
    this.contactFlowActionTaken = false;
    this.setContactFlowActionsDisabled(false);
    document.body.style.overflow =
      this.usageLimitModal?.hidden === false ||
      this.postAdModal?.hidden === false ||
      this.instagramViewerModal?.hidden === false
        ? "hidden"
        : "";
    const returnFocus = this.contactFlowReturnFocus;
    this.contactFlowReturnFocus = null;
    if (returnFocus && typeof returnFocus.focus === "function") {
      returnFocus.focus();
    }
  }

  openPostAdModal() {
    if (!this.postAdModal) return;

    if (this.postAdFrame && !this.postAdFrame.src) {
      this.postAdFrame.src =
        this.postAdFrame.dataset.src || "/post-your-ad.html";
    }

    this.postAdModal.hidden = false;
    this.postAdModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    this.closePostAdBtn?.focus();
  }

  closePostAdModal() {
    if (!this.postAdModal) return;
    this.postAdModal.hidden = true;
    this.postAdModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow =
      this.usageLimitModal?.hidden === false ||
      this.contactFlowModal?.hidden === false ||
      this.instagramViewerModal?.hidden === false
        ? "hidden"
        : "";
  }

  getContactFlowMessage(user) {
    const message = toSafeString(this.contactFlowMessage?.value);
    return message || this.buildContactMessage(user);
  }

  performOutboundAction({
    user,
    kind,
    targetUrl,
    windowTarget = "_blank",
    supportLabel,
  }) {
    if (!user || !targetUrl) return false;

    if (this.activeContactUser && this.contactFlowActionTaken) {
      this.renderer.showToast("This contact is already open");
      return false;
    }

    const remaining = this.contactService.getRemainingAttempts();
    if (remaining <= 0) {
      this.logger.log(`${kind}_limit_reached`, { userId: user.id });
      this.openUsageLimitModal({
        focus: "contact",
        supportKind: supportLabel === "call" ? "call" : "whatsapp",
      });
      return false;
    }

    if (this.activeContactUser && this.activeContactUser.id === user.id) {
      this.contactFlowActionTaken = true;
      this.setContactFlowActionsDisabled(true);
    }

    this.contactService.recordAttempt();
    this.logger.log(`${kind}_success`, {
      userId: user.id,
      remaining: this.contactService.getRemainingAttempts(),
    });
    this.updateContactLimitIndicator();

    const opened = window.open(targetUrl, windowTarget);
    if (this.activeContactUser && this.activeContactUser.id === user.id) {
      this.closeContactFlow();
    }

    return Boolean(opened || windowTarget === "_self");
  }

  openPrimaryContact() {
    const user = this.activeContactUser;
    if (!user) return;
    const number = this.getPreferredWhatsAppNumber(user);
    if (!number) {
      this.renderer.showToast("No WhatsApp number available");
      return;
    }

    const message = encodeURIComponent(this.getContactFlowMessage(user));
    this.performOutboundAction({
      user,
      kind: "contact",
      targetUrl: `https://wa.me/${number}?text=${message}`,
      windowTarget: "_blank",
      supportLabel: "contact",
    });
  }

  callPrimaryContact() {
    const user = this.activeContactUser;
    if (!user) return;
    const number = this.getPreferredCallNumber(user);
    if (!number) {
      this.renderer.showToast("No phone number available");
      return;
    }

    this.performOutboundAction({
      user,
      kind: "call",
      targetUrl: `tel:${number}`,
      windowTarget: "_self",
      supportLabel: "call",
    });
  }
}

domReady(() => {
  const app = new InstaRishtaApp();
  app.init();
  window.instaRishtaApp = app;
});
