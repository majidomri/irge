import {
  $,
  addClass,
  removeClass,
  copyText,
  debounce,
  domReady,
  escapeHtml,
  normalizeDate,
  toSafeString,
} from "../utils.js";
import { StorageService } from "../services/storage-service.js";
import { DataService } from "../services/data-service.js";
import { InvoiceGenerator } from "./invoice-generator.js";

const DEFAULT_REMOTE_URL =
  "https://instarishta-profile-relay.instarishtalead.workers.dev/api/profiles";
const DRAFT_STORAGE_KEY = "InstaRishtaProfileStudioDraft:v1";
const SOURCE_STORAGE_KEY = "InstaRishtaProfileStudioSource:v1";

function toLocalDateTime(value) {
  const text = toSafeString(value);
  if (!text) return "";

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function normalizePhone(value) {
  return toSafeString(value).replace(/[^\d+]/g, "");
}

function normalizeId(value) {
  const text = toSafeString(value);
  if (!text) return "";

  const numeric = Number(text);
  if (
    !Number.isNaN(numeric) &&
    `${numeric}` === text.replace(/^0+/, "") &&
    String(Math.trunc(numeric)).length
  ) {
    return Math.trunc(numeric);
  }

  return text;
}

function formatDateTime(value) {
  const text = toSafeString(value);
  if (!text) return "â€”";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function addDaysIso(iso, days) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export class ProfileAdminController {
  constructor(dataService = null, invoiceGenerator = null) {
    this.storage = new StorageService();
    this.dataService = dataService || new DataService([]);
    this.invoiceGenerator = invoiceGenerator || new InvoiceGenerator();
    this.state = {
      profiles: [],
      selectedId: "",
      search: "",
      sort: "dateDesc",
      sourceUrl: DEFAULT_REMOTE_URL,
    };
    this.pendingDraft = null;
    this.draftKey = DRAFT_STORAGE_KEY;
    this.sourceKey = SOURCE_STORAGE_KEY;
    this.currentInvoiceGenerator = null;
  }

  init() {
    document.title = "InstaRishta Profile Studio";
    this.cacheDom();
    this.bindEvents();

    const savedSource = this.storage.get(this.sourceKey, DEFAULT_REMOTE_URL);
    if (savedSource) {
      this.sourceUrlInput.value = savedSource;
      this.state.sourceUrl = savedSource;
    }

    const draft = this.storage.getJson(this.draftKey, null);
    if (draft?.profiles?.length) {
      this.pendingDraft = draft;
      this.showDraftBanner();
      this.setStatus(
        "Local draft found. Resume it or discard it and reload the live JSON.",
        "success",
      );
      this.setPreview(
        JSON.stringify(this.buildExportProfiles(draft.profiles), null, 2),
      );
      return;
    }

    this.loadFromSource();
  }

  cacheDom() {
    this.adminStatus = $("adminStatus");
    this.draftBanner = $("draftBanner");
    this.resumeDraftBtn = $("resumeDraftBtn");
    this.discardDraftBtn = $("discardDraftBtn");
    this.fetchRemoteBtn = $("fetchRemoteBtn");
    this.importJsonFile = $("importJsonFile");
    this.downloadJsonPanelBtn = $("downloadJsonPanelBtn");
    this.copyJsonPanelBtn = $("copyJsonPanelBtn");
    this.clearDraftBtn = $("clearDraftBtn");
    this.sourceUrlInput = $("sourceUrlInput");
    this.loadSourceBtn = $("loadSourceBtn");
    this.profilesSearch = $("profilesSearch");
    this.profilesSort = $("profilesSort");
    this.totalCount = $("totalCount");
    this.urgentCount = $("urgentCount");
    this.activeCount = $("activeCount");
    this.expiredCount = $("expiredCount");
    this.duplicateCount = $("duplicateCount");
    this.selectedCount = $("selectedCount");
    this.profilesTableBody = $("profilesTableBody");
    this.jsonPreview = $("jsonPreview");
    this.profileForm = $("profileForm");
    this.formTitle = $("formTitle");
    this.formSubtitle = $("formSubtitle");
    this.editingId = $("editingId");
    this.profileId = $("profileId");
    this.profileTitle = $("profileTitle");
    this.profileBody = $("profileBody");
    this.profilePhone = $("profilePhone");
    this.profileWhatsapp = $("profileWhatsapp");
    this.profileInstagramPostId = $("profileInstagramPostId");
    this.profileBiodataUrl = $("profileBiodataUrl");
    this.profileAge = $("profileAge");
    this.profileGender = $("profileGender");
    this.profileEducation = $("profileEducation");
    this.profileUrgent = $("profileUrgent");
    this.profileVerified = $("profileVerified");
    this.profileFamilyApproval = $("profileFamilyApproval");
    this.profileContactMode = $("profileContactMode");
    this.profileLocation = $("profileLocation");
    this.profileGuardianName = $("profileGuardianName");
    this.profileGuardianPhone = $("profileGuardianPhone");
    this.profileValues = $("profileValues");
    this.profileContactNotes = $("profileContactNotes");
    this.profileDate = $("profileDate");
    this.profileExpiresAt = $("profileExpiresAt");
    this.renewDays = $("renewDays");
    this.profileNotes = $("profileNotes");
    this.profileVoiceId = $("profileVoiceId");
    this.profileVoiceDurationSec = $("profileVoiceDurationSec");
    this.profileVoiceEnabled = $("profileVoiceEnabled");
    this.saveProfileBtn = $("saveProfileBtn");
    this.newProfileBtn = $("newProfileBtn");
    this.duplicateProfileBtn = $("duplicateProfileBtn");
    this.renewProfileBtn = $("renewProfileBtn");
    this.deleteProfileBtn = $("deleteProfileBtn");
  }

  bindEvents() {
    this.fetchRemoteBtn?.addEventListener("click", () => this.loadFromSource());
    this.loadSourceBtn?.addEventListener("click", () => this.loadFromSource());
    this.downloadJsonPanelBtn?.addEventListener("click", () =>
      this.downloadJson(),
    );
    this.copyJsonPanelBtn?.addEventListener("click", () => this.copyJson());
    this.clearDraftBtn?.addEventListener("click", () => this.clearDraft());
    this.resumeDraftBtn?.addEventListener("click", () => this.resumeDraft());
    this.discardDraftBtn?.addEventListener("click", () =>
      this.discardDraftAndReload(),
    );
    this.newProfileBtn?.addEventListener("click", () => this.startNewProfile());
    this.duplicateProfileBtn?.addEventListener("click", () =>
      this.duplicateSelectedProfile(),
    );
    this.renewProfileBtn?.addEventListener("click", () =>
      this.renewSelectedProfile(),
    );
    this.deleteProfileBtn?.addEventListener("click", () =>
      this.deleteSelectedProfile(),
    );
    this.profileForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.saveProfile();
    });

    this.profileForm?.addEventListener("keydown", (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "enter") {
        event.preventDefault();
        this.saveProfile();
      }
    });

    this.profilesSearch?.addEventListener(
      "input",
      debounce(() => {
        this.state.search = this.profilesSearch?.value.trim() || "";
        this.renderAll();
      }, 160),
    );

    this.profilesSort?.addEventListener("change", () => {
      this.state.sort = this.profilesSort?.value || "dateDesc";
      this.renderAll();
    });

    this.sourceUrlInput?.addEventListener("change", () => {
      this.state.sourceUrl =
        this.sourceUrlInput?.value.trim() || DEFAULT_REMOTE_URL;
      this.storage.set(this.sourceKey, this.state.sourceUrl);
    });

    this.importJsonFile?.addEventListener("change", () => this.importFile());

    this.profilesTableBody?.addEventListener("click", (event) => {
      const actionButton = event.target.closest("button[data-action]");
      if (actionButton) {
        const rowId = actionButton.getAttribute("data-id");
        const action = actionButton.getAttribute("data-action");
        if (!rowId || !action) return;

        if (action === "edit") {
          this.selectProfile(rowId);
        } else if (action === "duplicate") {
          this.selectProfile(rowId);
          this.duplicateSelectedProfile();
        } else if (action === "invoice") {
          this.openInvoiceModal(rowId);
        } else if (action === "renew") {
          this.selectProfile(rowId);
          this.renewSelectedProfile();
        } else if (action === "delete") {
          this.selectProfile(rowId);
          this.deleteSelectedProfile();
        }
        return;
      }

      const row = event.target.closest("tr[data-id]");
      if (row?.dataset?.id) {
        this.selectProfile(row.dataset.id);
      }
    });

    window.addEventListener("keydown", (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      this.downloadJson();
    });

    // Modal event listeners
    this.setupModalEvents();
    this.setupVoiceUploadEvents();
    this.setupInvoiceModalEvents();
  }

  setupModalEvents() {
    // Modal elements
    this.editModal = $("editModal");
    this.editModalOverlay = $("editModalOverlay");
    this.modalTitle = $("modalTitle");
    this.closeModalBtn = $("closeModalBtn");
    this.voiceFileBtn = $("voiceFileBtn");
    this.voiceFileInput = $("voiceFileInput");

    // Tab switching
    const tabs = document.querySelectorAll(".edit-modal-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", (e) =>
        this.switchTab(e.target.closest("button").dataset.tab),
      );
    });

    // Close modal
    this.closeModalBtn?.addEventListener("click", () => this.closeModal());
    this.editModalOverlay?.addEventListener("click", () => this.closeModal());

    // Modal keyboard
    this.editModal?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeModal();
      }
    });
  }

  setupVoiceUploadEvents() {
    const uploadZone = $("voiceUploadZone");
    const voiceFileBtn = $("voiceFileBtn");
    const voiceFileInput = $("voiceFileInput");
    const voiceFileClearBtn = $("voiceFileClearBtn");

    if (!uploadZone) return;

    // Drag and drop
    uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      addClass(uploadZone, "drag-over");
    });

    uploadZone.addEventListener("dragleave", () => {
      removeClass(uploadZone, "drag-over");
    });

    uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      removeClass(uploadZone, "drag-over");
      const files = e.dataTransfer?.files;
      if (files?.length) {
        this.handleVoiceFileSelect(files[0]);
      }
    });

    // File input click
    voiceFileBtn?.addEventListener("click", () => voiceFileInput?.click());
    voiceFileInput?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) {
        this.handleVoiceFileSelect(file);
      }
    });

    // Clear file
    voiceFileClearBtn?.addEventListener("click", () => this.clearVoiceFile());
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll(".edit-modal-tab").forEach((tab) => {
      const tabId = tab.dataset.tab;
      if (tabId === tabName) {
        addClass(tab, "active");
        tab.setAttribute("aria-selected", "true");
      } else {
        removeClass(tab, "active");
        tab.setAttribute("aria-selected", "false");
      }
    });

    // Update tab content
    document.querySelectorAll(".edit-modal-tab-content").forEach((content) => {
      if (content.dataset.tab === tabName) {
        addClass(content, "active");
      } else {
        removeClass(content, "active");
      }
    });
  }

  openModal(profileId) {
    if (!this.editModal) return;
    this.state.selectedId = profileId;
    const profile = this.state.profiles.find(
      (p) => String(p.id) === String(profileId),
    );

    if (profile) {
      this.fillForm(profile);
      this.modalTitle.textContent = `Edit Profile #${String(profileId).padStart(5, "0")}`;
    } else {
      this.startNewProfile();
      this.modalTitle.textContent = "Create Profile";
    }

    // Reset to Details tab
    this.switchTab("details");
    this.clearVoiceFile();

    this.editModal.showModal();
    this.editModalOverlay?.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
  }

  closeModal() {
    this.editModal?.close();
    this.editModalOverlay?.setAttribute("hidden", "");
    document.body.style.overflow = "";
  }

  handleVoiceFileSelect(file) {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const validTypes = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg"];

    if (!validTypes.includes(file.type)) {
      this.setStatus(
        "Invalid audio format. Supported: MP3, M4A, WAV, OGG",
        "error",
      );
      return;
    }

    if (file.size > maxSize) {
      this.setStatus("File too large. Maximum 5MB allowed.", "error");
      return;
    }

    // Show file info
    const fileInfo = $("voiceFileInfo");
    const fileName = $("voiceFileName");
    const fileMeta = $("voiceFileMeta");
    const previewContainer = $("voicePreviewContainer");
    const previewPlayer = $("voicePreviewPlayer");

    if (fileInfo && fileName) {
      fileName.textContent = file.name;
      const sizeMB = (file.size / 1024 / 1024).toFixed(2);
      fileMeta.textContent = `${sizeMB}MB`;
      fileInfo.removeAttribute("hidden");

      // Show preview
      const reader = new FileReader();
      reader.onload = (e) => {
        if (previewPlayer) {
          previewPlayer.src = e.target.result;
          previewContainer.removeAttribute("hidden");

          // Get audio duration
          previewPlayer.addEventListener(
            "loadedmetadata",
            () => {
              const duration = Math.round(previewPlayer.duration);
              this.profileVoiceDurationSec.value = duration;
              this.profileVoiceId.value = file.name;
            },
            { once: true },
          );
        }
      };
      reader.readAsDataURL(file);

      this.setStatus("Voice file loaded. Preview ready.", "success");
    }
  }

  clearVoiceFile() {
    const fileInfo = $("voiceFileInfo");
    const previewContainer = $("voicePreviewContainer");
    const previewPlayer = $("voicePreviewPlayer");
    const voiceFileInput = $("voiceFileInput");

    fileInfo?.setAttribute("hidden", "");
    previewContainer?.setAttribute("hidden", "");
    if (previewPlayer) {
      previewPlayer.src = "";
    }
    if (voiceFileInput) {
      voiceFileInput.value = "";
    }
  }

  showDraftBanner() {
    this.draftBanner?.removeAttribute("hidden");
    addClass(this.draftBanner, "show");
  }

  hideDraftBanner() {
    if (!this.draftBanner) return;
    this.draftBanner.setAttribute("hidden", "");
    removeClass(this.draftBanner, "show");
  }

  setStatus(message, tone = "") {
    if (!this.adminStatus) return;
    this.adminStatus.textContent = message;
    this.adminStatus.dataset.tone = tone;
  }

  setPreview(value) {
    if (!this.jsonPreview) return;
    this.jsonPreview.value = value;
  }

  async loadFromSource() {
    const url = this.sourceUrlInput?.value.trim() || DEFAULT_REMOTE_URL;
    this.state.sourceUrl = url;
    this.storage.set(this.sourceKey, url);

    this.setStatus(`Loading profiles from ${url}...`, "");

    try {
      const raw = await this.fetchJson(url);
      const records = this.normalizeIncomingRecords(raw);
      this.pendingDraft = null;
      this.hideDraftBanner();
      this.applyRecords(records, url);
      this.setStatus(
        `Loaded ${records.length} profiles from live JSON.`,
        "success",
      );
    } catch (error) {
      this.setStatus(`Could not load source JSON: ${error.message}`, "error");
    }
  }

  async fetchJson(url) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("request timed out");
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  normalizeIncomingRecords(raw) {
    const list = this.dataService.extractUserArray(raw);
    return list
      .map((item, index) => this.coerceProfile(item, index))
      .filter(Boolean);
  }

  coerceProfile(item, index) {
    const normalized = this.dataService.normalizeUserRecord(item, index);
    if (!normalized) return null;

    return {
      ...normalized,
      id: normalizeId(normalized.id),
      urgent: Boolean(normalized.urgent),
      priority: normalized.urgent ? "Urgent" : "normal",
      verified: Boolean(normalized.verified),
      familyApproval: Boolean(normalized.familyApproval),
      contactMode: toSafeString(normalized.contactMode),
      guardianName: toSafeString(normalized.guardianName),
      guardianPhone: toSafeString(normalized.guardianPhone),
      values: toSafeString(normalized.values),
      contactNotes: toSafeString(normalized.contactNotes),
      location: toSafeString(normalized.location),
      notes: toSafeString(normalized.notes),
      instagramPostId: toSafeString(normalized.instagramPostId),
      biodataUrl: toSafeString(normalized.biodataUrl),
      expiresAt: toSafeString(normalized.expiresAt),
      updatedAt: toSafeString(normalized.updatedAt),
    };
  }

  applyRecords(records, sourceUrl) {
    this.state.profiles = records.map((record) => this.sanitizeProfile(record));
    this.state.sourceUrl = sourceUrl || DEFAULT_REMOTE_URL;
    this.sourceUrlInput.value = this.state.sourceUrl;
    this.storage.set(this.sourceKey, this.state.sourceUrl);

    if (this.state.profiles.length) {
      this.state.selectedId = String(this.state.profiles[0].id);
      this.fillForm(this.state.profiles[0]);
    } else {
      this.startNewProfile();
    }

    this.persistDraft();
    this.renderAll();
  }

  sanitizeProfile(profile) {
    const record = profile && typeof profile === "object" ? profile : {};
    const urgent =
      Boolean(record.urgent) ||
      toSafeString(record.priority).toLowerCase() === "urgent";
    const contactMode = this.normalizeContactMode(record.contactMode);
    const familyApproval =
      Boolean(record.familyApproval) || contactMode === "family";
    const normalizedContactMode = familyApproval
      ? "family"
      : contactMode || "direct";

    return {
      id: normalizeId(record.id),
      title: toSafeString(record.title) || "Nikah Proposal",
      body: toSafeString(record.body),
      phone: normalizePhone(record.phone),
      whatsapp: normalizePhone(record.whatsapp),
      instagramPostId: toSafeString(record.instagramPostId),
      biodataUrl: toSafeString(record.biodataUrl),
      age: toSafeString(record.age),
      gender: this.normalizeGender(record.gender),
      education: toSafeString(record.education),
      location: toSafeString(record.location),
      notes: toSafeString(record.notes),
      values: toSafeString(record.values),
      verified: Boolean(record.verified),
      familyApproval,
      contactMode: normalizedContactMode,
      guardianName: toSafeString(record.guardianName),
      guardianPhone: normalizePhone(record.guardianPhone),
      contactNotes: toSafeString(record.contactNotes),
      urgent,
      priority: urgent ? "Urgent" : "normal",
      date: this.normalizeRequiredDate(record.date),
      expiresAt: this.dataService.normalizeOptionalDate(record.expiresAt),
      updatedAt: this.dataService.normalizeOptionalDate(record.updatedAt),
    };
  }

  normalizeGender(value) {
    const gender = toSafeString(value).toLowerCase();
    if (gender.startsWith("m")) return "male";
    if (gender.startsWith("f")) return "female";
    return "unknown";
  }

  normalizeContactMode(value) {
    const text = toSafeString(value).toLowerCase();
    if (!text) return "";
    if (
      text.includes("family") ||
      text.includes("wali") ||
      text.includes("guardian")
    )
      return "family";
    if (
      text.includes("private") ||
      text.includes("hidden") ||
      text.includes("exclusive")
    )
      return "private";
    if (text.includes("direct") || text.includes("open")) return "direct";
    return "";
  }

  normalizeRequiredDate(value) {
    return normalizeDate(value || new Date().toISOString());
  }

  getFilteredProfiles() {
    const query = this.state.search.trim().toLowerCase();
    const source = [...this.state.profiles];
    const idCounts = new Map();

    source.forEach((profile) => {
      const key = String(profile.id);
      idCounts.set(key, (idCounts.get(key) || 0) + 1);
    });

    const filtered = source.filter((profile) => {
      if (!query) return true;
      const haystack = [
        profile.id,
        profile.title,
        profile.body,
        profile.phone,
        profile.whatsapp,
        profile.instagramPostId,
        profile.age,
        profile.gender,
        profile.education,
        profile.location,
        profile.notes,
        profile.values,
        profile.guardianName,
        profile.guardianPhone,
        profile.contactNotes,
        profile.contactMode,
      ]
        .map((value) => toSafeString(value).toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });

    filtered.sort((a, b) => this.compareProfiles(a, b));

    return {
      filtered,
      idCounts,
    };
  }

  compareProfiles(a, b) {
    const aDate = new Date(a.date).getTime() || 0;
    const bDate = new Date(b.date).getTime() || 0;
    const aId = this.numericId(a.id);
    const bId = this.numericId(b.id);

    switch (this.state.sort) {
      case "dateAsc":
        return aDate - bDate || aId - bId;
      case "idAsc":
        return aId - bId || aDate - bDate;
      case "idDesc":
        return bId - aId || bDate - aDate;
      case "urgentFirst":
        return (
          Number(b.urgent) - Number(a.urgent) || bDate - aDate || bId - aId
        );
      case "dateDesc":
      default:
        return bDate - aDate || bId - aId;
    }
  }

  numericId(value) {
    const numeric = Number(value);
    return Number.isNaN(numeric) ? 0 : numeric;
  }

  renderAll(message = "") {
    this.renderStats();
    this.renderTable();
    this.updatePreview();
    this.updateActionState();
    if (message) {
      this.setStatus(message, "success");
    }
  }

  renderStats() {
    const { filtered, idCounts } = this.getFilteredProfiles();
    const now = Date.now();
    const activeCount = filtered.filter(
      (profile) => !this.isExpired(profile, now),
    ).length;
    const expiredCount = filtered.filter((profile) =>
      this.isExpired(profile, now),
    ).length;
    const urgentCount = filtered.filter((profile) => profile.urgent).length;
    const duplicateCount = filtered.filter(
      (profile) => (idCounts.get(String(profile.id)) || 0) > 1,
    ).length;

    if (this.totalCount) this.totalCount.textContent = String(filtered.length);
    if (this.urgentCount) this.urgentCount.textContent = String(urgentCount);
    if (this.activeCount) this.activeCount.textContent = String(activeCount);
    if (this.expiredCount) this.expiredCount.textContent = String(expiredCount);
    if (this.duplicateCount)
      this.duplicateCount.textContent = String(duplicateCount);
    if (this.selectedCount)
      this.selectedCount.textContent = this.state.selectedId ? "1" : "0";
  }

  renderTable() {
    if (!this.profilesTableBody) return;

    const { filtered, idCounts } = this.getFilteredProfiles();
    if (!filtered.length) {
      this.profilesTableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">No profiles match the current search or sort filters.</div>
          </td>
        </tr>
      `;
      return;
    }

    const rows = filtered.map((profile) => {
      const selected = String(profile.id) === String(this.state.selectedId);
      const expired = this.isExpired(profile);
      const duplicate = (idCounts.get(String(profile.id)) || 0) > 1;
      const activeBadge = expired ? "Expired" : "Active";
      const contactMode =
        profile.contactMode || (profile.familyApproval ? "family" : "direct");
      const trustBadges = [
        profile.verified
          ? '<span class="badge badge-verified">Verified</span>'
          : "",
        profile.familyApproval
          ? '<span class="badge badge-family">Family</span>'
          : "",
        contactMode !== "direct"
          ? `<span class="badge badge-private">${escapeHtml(contactMode === "family" ? "Wali" : "Private")}</span>`
          : "",
      ]
        .filter(Boolean)
        .join("");
      const safeId = escapeHtml(String(profile.id));
      return `
        <tr data-id="${safeId}" class="${selected ? "is-selected" : ""} ${expired ? "is-expired" : ""}">
          <td>
            <div class="badge-row">
              <span class="badge badge-id">#${safeId}</span>
              ${duplicate ? '<span class="badge badge-duplicate">Duplicate</span>' : ""}
            </div>
          </td>
          <td>
            <div class="cell-title">${escapeHtml(profile.title || "Untitled")}</div>
            <div class="cell-meta">
              ${profile.location ? `${escapeHtml(profile.location)}<br>` : ""}
              ${escapeHtml(profile.body ? profile.body.slice(0, 90) : "No description")}
              ${profile.body && profile.body.length > 90 ? "..." : ""}
            </div>
          </td>
          <td class="cell-contact">
            <div class="cell-meta">
              ${profile.phone ? `P: ${escapeHtml(profile.phone)}<br>` : ""}
              ${profile.whatsapp ? `W: ${escapeHtml(profile.whatsapp)}<br>` : "No WhatsApp<br>"}
              ${profile.guardianPhone ? `G: ${escapeHtml(profile.guardianPhone)}<br>` : ""}
              ${contactMode !== "direct" ? `Mode: ${escapeHtml(contactMode)}<br>` : ""}
              ${profile.values ? `Values: ${escapeHtml(profile.values)}` : ""}
            </div>
          </td>
          <td>
            <div class="cell-meta">
              Age: ${escapeHtml(profile.age || "-")}<br>
              Gender: ${escapeHtml(profile.gender || "unknown")}<br>
              Education: ${escapeHtml(profile.education || "-")}
            </div>
          </td>
          <td>
            <div class="cell-meta">
              Published: ${escapeHtml(formatDateTime(profile.date))}<br>
              Expires: ${escapeHtml(profile.expiresAt ? formatDateTime(profile.expiresAt) : "-")}
            </div>
          </td>
          <td>
            <div class="badge-row">
              <span class="badge ${profile.urgent ? "badge-urgent" : "badge-active"}">${profile.urgent ? "Urgent" : "Normal"}</span>
              <span class="badge ${expired ? "badge-expired" : "badge-active"}">${activeBadge}</span>
              ${trustBadges}
            </div>
          </td>
          <td>
            <div class="row-actions">
              <button class="row-btn" type="button" data-action="edit" data-id="${safeId}">Edit</button>
              <button class="row-btn" type="button" data-action="duplicate" data-id="${safeId}">Copy</button>
              <button class="row-btn" type="button" data-action="invoice" data-id="${safeId}">Invoice</button>
              <button class="row-btn" type="button" data-action="renew" data-id="${safeId}">Renew</button>
              <button class="row-btn danger" type="button" data-action="delete" data-id="${safeId}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    });

    this.profilesTableBody.innerHTML = rows.join("");
  }

  updatePreview() {
    if (!this.jsonPreview) return;
    this.jsonPreview.value = JSON.stringify(
      this.buildExportProfiles(),
      null,
      2,
    );
  }

  buildExportProfiles(source = this.state.profiles) {
    return [...source]
      .map((profile) => this.toExportProfile(this.sanitizeProfile(profile)))
      .sort((a, b) => this.compareProfiles(a, b));
  }

  toExportProfile(profile) {
    const now = new Date().toISOString();
    return {
      id: normalizeId(profile.id),
      title: toSafeString(profile.title) || "Nikah Proposal",
      body: toSafeString(profile.body),
      phone: normalizePhone(profile.phone),
      whatsapp: normalizePhone(profile.whatsapp),
      instagramPostId: toSafeString(profile.instagramPostId),
      biodataUrl: toSafeString(profile.biodataUrl),
      age: toSafeString(profile.age),
      gender: this.normalizeGender(profile.gender),
      education: toSafeString(profile.education),
      location: toSafeString(profile.location),
      notes: toSafeString(profile.notes),
      values: toSafeString(profile.values),
      verified: Boolean(profile.verified),
      familyApproval: Boolean(profile.familyApproval),
      contactMode: Boolean(profile.familyApproval)
        ? "family"
        : this.normalizeContactMode(profile.contactMode) || "direct",
      guardianName: toSafeString(profile.guardianName),
      guardianPhone: normalizePhone(profile.guardianPhone),
      contactNotes: toSafeString(profile.contactNotes),
      urgent: Boolean(profile.urgent),
      priority: Boolean(profile.urgent) ? "Urgent" : "normal",
      date: normalizeDate(profile.date || now),
      expiresAt: this.dataService.normalizeOptionalDate(profile.expiresAt),
      updatedAt: this.dataService.normalizeOptionalDate(
        profile.updatedAt || now,
      ),
    };
  }

  updateActionState() {
    const hasSelection = Boolean(
      this.state.selectedId && this.getProfileById(this.state.selectedId),
    );
    if (this.duplicateProfileBtn)
      this.duplicateProfileBtn.disabled = !hasSelection;
    if (this.renewProfileBtn) this.renewProfileBtn.disabled = !hasSelection;
    if (this.deleteProfileBtn) this.deleteProfileBtn.disabled = !hasSelection;

    if (this.formTitle) {
      this.formTitle.textContent = hasSelection
        ? `Edit Profile #${this.state.selectedId}`
        : "Create Profile";
    }
    if (this.formSubtitle) {
      this.formSubtitle.textContent = hasSelection
        ? "Edit the selected profile, then save and export the updated JSON."
        : "Create a new profile or load an existing one from the table.";
    }
    if (this.saveProfileBtn) {
      this.saveProfileBtn.textContent = hasSelection
        ? "Update profile"
        : "Save profile";
    }
  }

  startNewProfile() {
    const nextId = this.generateNextId();
    this.state.selectedId = "";
    this.fillForm({
      id: nextId,
      title: "",
      body: "",
      phone: "",
      whatsapp: "",
      instagramPostId: "",
      biodataUrl: "",
      age: "",
      gender: "unknown",
      education: "",
      location: "",
      notes: "",
      values: "",
      verified: false,
      familyApproval: false,
      contactMode: "direct",
      guardianName: "",
      guardianPhone: "",
      contactNotes: "",
      urgent: false,
      date: new Date().toISOString(),
      expiresAt: "",
    });
    this.setStatus(`Ready to create a new profile with ID ${nextId}.`, "");

    // Open modal for new profile
    this.editModal?.showModal();
    this.editModalOverlay?.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    this.modalTitle.textContent = "Create Profile";
    this.switchTab("details");
    this.clearVoiceFile();
  }

  resumeDraft() {
    if (!this.pendingDraft?.profiles?.length) return;
    const sourceUrl =
      this.pendingDraft?.sourceUrl ||
      this.state.sourceUrl ||
      DEFAULT_REMOTE_URL;
    const profiles = this.pendingDraft.profiles.map((profile) =>
      this.sanitizeProfile(profile),
    );
    this.hideDraftBanner();
    this.pendingDraft = null;
    this.applyRecords(profiles, sourceUrl);
    this.setStatus(
      `Local draft restored with ${profiles.length} profiles.`,
      "success",
    );
  }

  discardDraftAndReload() {
    this.storage.remove(this.draftKey);
    this.pendingDraft = null;
    this.hideDraftBanner();
    this.loadFromSource();
  }

  clearDraft() {
    this.storage.remove(this.draftKey);
    this.pendingDraft = null;
    this.hideDraftBanner();
    this.setStatus(
      "Local draft cleared. The current working set stays in memory.",
      "success",
    );
  }

  importFile() {
    const file = this.importJsonFile?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result || "null"));
        const records = this.normalizeIncomingRecords(raw);
        if (!records.length) {
          throw new Error("No valid profile rows were found in the file.");
        }
        this.pendingDraft = null;
        this.hideDraftBanner();
        this.applyRecords(records, file.name);
        this.setStatus(
          `Imported ${records.length} profiles from ${file.name}.`,
          "success",
        );
      } catch (error) {
        this.setStatus(`Could not import file: ${error.message}`, "error");
      } finally {
        if (this.importJsonFile) this.importJsonFile.value = "";
      }
    };
    reader.readAsText(file);
  }

  saveProfile() {
    const profile = this.readFormProfile();
    if (!profile) return;

    const existingIndex = this.state.profiles.findIndex(
      (item) => String(item.id) === String(this.state.selectedId),
    );
    const duplicateIndex = this.state.profiles.findIndex(
      (item, index) =>
        String(item.id) === String(profile.id) && index !== existingIndex,
    );

    if (duplicateIndex !== -1) {
      this.setStatus(
        `Profile ID ${profile.id} already exists. Choose a different ID.`,
        "error",
      );
      this.profileId?.focus();
      return;
    }

    profile.updatedAt = new Date().toISOString();

    let actionMessage = "";
    if (existingIndex === -1) {
      this.state.profiles.push(profile);
      this.state.selectedId = String(profile.id);
      actionMessage = `Created profile #${profile.id}.`;
    } else {
      this.state.profiles[existingIndex] = profile;
      this.state.selectedId = String(profile.id);
      actionMessage = `Updated profile #${profile.id}.`;
    }

    this.fillForm(profile);
    this.persistDraft();
    this.renderAll();
    this.setStatus(actionMessage, "success");

    // Close modal after successful save
    this.closeModal();
  }

  readFormProfile() {
    const id = normalizeId(this.profileId?.value);
    const title = toSafeString(this.profileTitle?.value);
    const body = toSafeString(this.profileBody?.value);
    const phone = normalizePhone(this.profilePhone?.value);
    const whatsapp = normalizePhone(this.profileWhatsapp?.value);
    const instagramPostId = toSafeString(this.profileInstagramPostId?.value);
    const biodataUrl = toSafeString(this.profileBiodataUrl?.value);
    const age = toSafeString(this.profileAge?.value);
    const gender = this.normalizeGender(this.profileGender?.value);
    const education = toSafeString(this.profileEducation?.value);
    const location = toSafeString(this.profileLocation?.value);
    const notes = toSafeString(this.profileNotes?.value);
    const values = toSafeString(this.profileValues?.value);
    const verified = Boolean(this.profileVerified?.checked);
    const familyApproval = Boolean(this.profileFamilyApproval?.checked);
    const contactMode = familyApproval
      ? "family"
      : this.normalizeContactMode(this.profileContactMode?.value) || "direct";
    const guardianName = toSafeString(this.profileGuardianName?.value);
    const guardianPhone = normalizePhone(this.profileGuardianPhone?.value);
    const contactNotes = toSafeString(this.profileContactNotes?.value);
    const urgent = Boolean(this.profileUrgent?.checked);
    const date = this.profileDate?.value
      ? new Date(this.profileDate.value).toISOString()
      : new Date().toISOString();
    const expiresAt = this.profileExpiresAt?.value
      ? new Date(this.profileExpiresAt.value).toISOString()
      : "";

    if (!title) {
      this.setStatus("Title is required.", "error");
      this.profileTitle?.focus();
      return null;
    }

    if (!body) {
      this.setStatus("Description is required.", "error");
      this.profileBody?.focus();
      return null;
    }

    const nextId = id || this.generateNextId();

    return this.sanitizeProfile({
      id: nextId,
      title,
      body,
      phone,
      whatsapp,
      instagramPostId,
      biodataUrl,
      age,
      gender,
      education,
      location,
      notes,
      values,
      verified,
      familyApproval,
      contactMode,
      guardianName,
      guardianPhone,
      contactNotes,
      urgent,
      date,
      expiresAt,
      voiceId: toSafeString(this.profileVoiceId?.value),
      voiceDurationSec: Number(this.profileVoiceDurationSec?.value) || 0,
      voiceEnabled: Boolean(this.profileVoiceEnabled?.checked),
    });
  }

  fillForm(profile) {
    const record = this.sanitizeProfile(profile);
    if (this.editingId) this.editingId.value = String(record.id);
    if (this.profileId) this.profileId.value = record.id ?? "";
    if (this.profileTitle) this.profileTitle.value = record.title ?? "";
    if (this.profileBody) this.profileBody.value = record.body ?? "";
    if (this.profilePhone) this.profilePhone.value = record.phone ?? "";
    if (this.profileWhatsapp)
      this.profileWhatsapp.value = record.whatsapp ?? "";
    if (this.profileInstagramPostId)
      this.profileInstagramPostId.value = record.instagramPostId ?? "";
    if (this.profileBiodataUrl)
      this.profileBiodataUrl.value = record.biodataUrl ?? "";
    if (this.profileAge) this.profileAge.value = record.age ?? "";
    if (this.profileGender)
      this.profileGender.value = record.gender || "unknown";
    if (this.profileEducation)
      this.profileEducation.value = record.education ?? "";
    if (this.profileUrgent) this.profileUrgent.checked = Boolean(record.urgent);
    if (this.profileVerified)
      this.profileVerified.checked = Boolean(record.verified);
    if (this.profileFamilyApproval)
      this.profileFamilyApproval.checked = Boolean(record.familyApproval);
    if (this.profileContactMode)
      this.profileContactMode.value = record.familyApproval
        ? "family"
        : record.contactMode || "direct";
    if (this.profileLocation)
      this.profileLocation.value = record.location ?? "";
    if (this.profileGuardianName)
      this.profileGuardianName.value = record.guardianName ?? "";
    if (this.profileGuardianPhone)
      this.profileGuardianPhone.value = record.guardianPhone ?? "";
    if (this.profileValues) this.profileValues.value = record.values ?? "";
    if (this.profileContactNotes)
      this.profileContactNotes.value = record.contactNotes ?? "";
    if (this.profileDate) this.profileDate.value = toLocalDateTime(record.date);
    if (this.profileExpiresAt)
      this.profileExpiresAt.value = toLocalDateTime(record.expiresAt);
    if (this.profileNotes) this.profileNotes.value = record.notes ?? "";
    if (this.profileVoiceId) this.profileVoiceId.value = record.voiceId ?? "";
    if (this.profileVoiceDurationSec)
      this.profileVoiceDurationSec.value = record.voiceDurationSec ?? "";
    if (this.profileVoiceEnabled)
      this.profileVoiceEnabled.checked = Boolean(record.voiceEnabled);
  }

  selectProfile(id, { silent = false } = {}) {
    const profile = this.getProfileById(id);
    if (!profile) return;

    this.state.selectedId = String(profile.id);
    this.openModal(String(profile.id));
    if (!silent) {
      this.setStatus(`Selected profile #${profile.id}.`, "");
    }
  }

  getProfileById(id) {
    return (
      this.state.profiles.find(
        (profile) => String(profile.id) === String(id),
      ) || null
    );
  }

  duplicateSelectedProfile() {
    const profile = this.getProfileById(this.state.selectedId);
    if (!profile) return;

    const duplicate = this.sanitizeProfile({
      ...profile,
      id: this.generateNextId(),
      title: profile.title ? `${profile.title} (Copy)` : profile.title,
      urgent: profile.urgent,
      date: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: profile.expiresAt,
    });

    this.state.profiles.push(duplicate);
    this.state.selectedId = String(duplicate.id);
    this.fillForm(duplicate);
    this.persistDraft();
    this.renderAll();
    this.setStatus(
      `Duplicated profile #${profile.id} into #${duplicate.id}.`,
      "success",
    );
  }

  renewSelectedProfile() {
    const profile = this.getProfileById(this.state.selectedId);
    if (!profile) return;

    const nowIso = new Date().toISOString();
    const renewDays = Number(this.renewDays?.value) || 30;
    const renewed = this.sanitizeProfile({
      ...profile,
      date: nowIso,
      expiresAt: renewDays > 0 ? addDaysIso(nowIso, renewDays) : "",
      updatedAt: nowIso,
    });

    const index = this.state.profiles.findIndex(
      (item) => String(item.id) === String(profile.id),
    );
    if (index === -1) return;

    this.state.profiles[index] = renewed;
    this.fillForm(renewed);
    this.persistDraft();
    this.renderAll();
    this.setStatus(
      `Renewed profile #${renewed.id} for ${renewDays} day${renewDays === 1 ? "" : "s"}.`,
      "success",
    );
  }

  deleteSelectedProfile() {
    const profile = this.getProfileById(this.state.selectedId);
    if (!profile) return;
    if (!confirm(`Delete profile #${profile.id}?`)) return;

    this.state.profiles = this.state.profiles.filter(
      (item) => String(item.id) !== String(profile.id),
    );
    this.state.selectedId = "";
    this.persistDraft();

    if (this.state.profiles.length) {
      this.state.selectedId = String(this.state.profiles[0].id);
      this.fillForm(this.state.profiles[0]);
    } else {
      this.startNewProfile();
    }

    this.persistDraft();
    this.renderAll();
    this.setStatus(`Deleted profile #${profile.id}.`, "success");
  }

  isExpired(profile, referenceTime = Date.now()) {
    const expiresAt = toSafeString(profile.expiresAt);
    if (!expiresAt) return false;
    const parsed = new Date(expiresAt).getTime();
    if (Number.isNaN(parsed)) return false;
    return parsed < referenceTime;
  }

  generateNextId() {
    const numericIds = this.state.profiles
      .map((profile) => Number(profile.id))
      .filter((value) => !Number.isNaN(value));
    if (!numericIds.length) {
      return Date.now();
    }
    return Math.max(...numericIds) + 1;
  }

  persistDraft() {
    if (!this.state.profiles.length) return;
    this.storage.setJson(this.draftKey, {
      profiles: this.buildExportProfiles(),
      sourceUrl: this.state.sourceUrl,
      savedAt: new Date().toISOString(),
    });
  }

  downloadJson() {
    const payload = this.buildExportProfiles();
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "jsdata.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.setStatus("Downloaded jsdata.json.", "success");
  }

  async copyJson() {
    const ok = await copyText(
      JSON.stringify(this.buildExportProfiles(), null, 2),
    );
    this.setStatus(
      ok ? "JSON copied to clipboard." : "Could not copy JSON.",
      ok ? "success" : "error",
    );
  }

  // ========== INVOICE GENERATOR METHODS ==========

  setupInvoiceModalEvents() {
    const invoiceModal = $("invoiceModal");
    const invoiceModalOverlay = $("invoiceModalOverlay");
    const closeInvoiceBtn = $("closeInvoiceBtn");
    const closeInvoiceFormBtn = $("closeInvoiceFormBtn");
    const addInvoiceItemBtn = $("addInvoiceItemBtn");
    const generateInvoicePdfBtn = $("generateInvoicePdfBtn");
    const previewInvoiceBtn = $("previewInvoiceBtn");
    const invoiceForm = $("invoiceForm");

    // Close handlers
    closeInvoiceBtn?.addEventListener("click", () => this.closeInvoiceModal());
    closeInvoiceFormBtn?.addEventListener("click", () =>
      this.closeInvoiceModal(),
    );
    invoiceModalOverlay?.addEventListener("click", () =>
      this.closeInvoiceModal(),
    );

    // Add item handler
    addInvoiceItemBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      this.addInvoiceItem();
    });

    // Generate PDF handler
    generateInvoicePdfBtn?.addEventListener("click", async (e) => {
      e.preventDefault();
      await this.generateAndDownloadInvoicePDF();
    });

    // Preview handler
    previewInvoiceBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      this.previewInvoice();
    });

    // Form submission
    invoiceForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.generateAndDownloadInvoicePDF();
    });

    // Logo upload handlers
    const uploadLogoBtn = $("uploadLogoBtn");
    const logoFileInput = $("logoFileInput");
    const clearLogoBtn = $("clearLogoBtn");

    uploadLogoBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      logoFileInput?.click();
    });

    logoFileInput?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) {
        this.handleLogoUpload(file);
      }
    });

    clearLogoBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      this.clearLogo();
    });

    // Invoice items container event delegation
    const itemsContainer = $("invoiceItemsContainer");
    itemsContainer?.addEventListener("click", (e) => {
      if (e.target.closest(".invoice-btn-remove")) {
        e.preventDefault();
        const item = e.target.closest(".invoice-item");
        const itemCount =
          itemsContainer.querySelectorAll(".invoice-item").length;
        if (itemCount > 1) {
          item?.remove();
          this.updateInvoiceSummary();
        } else {
          this.setStatus("At least one invoice item is required.", "error");
        }
      }
    });

    // Item inputs change handlers
    itemsContainer?.addEventListener("change", () =>
      this.updateInvoiceSummary(),
    );
    itemsContainer?.addEventListener("input", () =>
      this.updateInvoiceSummary(),
    );

    // Due date calculation
    const daysInput = $("invoiceDaysUntilDue");
    daysInput?.addEventListener("change", () => this.updateInvoiceDueDate());

    // Preview modal close
    const previewOverlay = $("invoicePreviewOverlay");
    const closePreviewBtn = $("closePreviewBtn");
    const printPreviewBtn = $("printPreviewBtn");
    const downloadFromPreviewBtn = $("downloadFromPreviewBtn");

    closePreviewBtn?.addEventListener("click", () =>
      this.closeInvoicePreviewModal(),
    );
    previewOverlay?.addEventListener("click", () =>
      this.closeInvoicePreviewModal(),
    );

    printPreviewBtn?.addEventListener("click", () => {
      if (this.currentInvoiceGenerator) {
        this.currentInvoiceGenerator.printInvoice();
      }
    });

    downloadFromPreviewBtn?.addEventListener("click", async () => {
      if (this.currentInvoiceGenerator) {
        await this.currentInvoiceGenerator.generatePDF();
      }
    });
  }

  openInvoiceModal(profileId) {
    const profile = this.getProfileById(profileId);
    if (!profile) return;

    const invoiceModal = $("invoiceModal");
    const invoiceModalOverlay = $("invoiceModalOverlay");

    // Set up invoice generator
    this.currentInvoiceGenerator = new InvoiceGenerator();
    this.currentInvoiceGenerator.initWithProfile(profile);

    // Fill form with profile data
    const invoiceNumber = $("invoiceNumber");
    const billToName = $("invoiceBillToName");
    const billToPhone = $("invoiceBillToPhone");
    const issueDate = $("invoiceIssueDate");
    const dueDate = $("invoiceDueDate");

    if (invoiceNumber)
      invoiceNumber.value =
        this.currentInvoiceGenerator.invoiceData.invoiceNumber;
    if (billToName)
      billToName.value = this.currentInvoiceGenerator.invoiceData.billTo.name;
    if (billToPhone)
      billToPhone.value = this.currentInvoiceGenerator.invoiceData.billTo.phone;
    if (issueDate) issueDate.value = new Date().toISOString().split("T")[0];
    if (dueDate) {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      dueDate.value = d.toISOString().split("T")[0];
    }

    // Reset logo preview
    const logoImage = $("logoImage");
    const logoPlaceholder = $("logoPlaceholder");
    const clearLogoBtn = $("clearLogoBtn");
    const logoFileInput = $("logoFileInput");

    if (logoImage && logoPlaceholder) {
      logoImage.src = "";
      logoImage.style.display = "none";
      logoPlaceholder.style.display = "block";
      clearLogoBtn.style.display = "none";
    }
    if (logoFileInput) {
      logoFileInput.value = "";
    }

    // Clear T&C and person info fields
    const termsInput = $("invoiceTermsConditions");
    const personNameInput = $("invoicePersonName");
    const personNumberInput = $("invoicePersonNumber");

    if (termsInput) {
      termsInput.value = `**Payment Terms**
1. Payment due within 30 days
2. Late fees apply after due date

**Cancellation Policy**
1. Cancellations must be in writing
2. Refunds processed within 7 days`;
    }
    if (personNameInput) personNameInput.value = "";
    if (personNumberInput) personNumberInput.value = "";

    this.updateInvoiceSummary();

    invoiceModal?.showModal?.();
    invoiceModalOverlay?.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
  }

  closeInvoiceModal() {
    const invoiceModal = $("invoiceModal");
    const invoiceModalOverlay = $("invoiceModalOverlay");

    invoiceModal?.close?.();
    invoiceModalOverlay?.setAttribute("hidden", "");
    document.body.style.overflow = "";

    this.currentInvoiceGenerator = null;
  }

  closeInvoicePreviewModal() {
    const previewModal = $("invoicePreviewModal");
    const previewOverlay = $("invoicePreviewOverlay");

    previewModal?.close?.();
    previewOverlay?.setAttribute("hidden", "");
    document.body.style.overflow = "";
  }

  addInvoiceItem() {
    const container = $("invoiceItemsContainer");
    if (!container) return;

    const itemHTML = `
      <div class="invoice-item">
        <div class="invoice-item-grid">
          <div class="invoice-item-field">
            <label>Description</label>
            <input type="text" class="invoice-item-input item-description" placeholder="Service description">
          </div>
          <div class="invoice-item-field">
            <label>Qty</label>
            <input type="number" class="invoice-item-input item-quantity" value="1" min="1" style="width: 60px;">
          </div>
          <div class="invoice-item-field">
            <label>Unit Price (₹)</label>
            <input type="number" class="invoice-item-input item-price" placeholder="0.00" min="0" step="0.01" style="width: 90px;">
          </div>
          <div class="invoice-item-field">
            <label>GST %</label>
            <select class="invoice-item-input item-gst" style="width: 70px;">
              <option value="0">0%</option>
              <option value="5">5%</option>
              <option value="12">12%</option>
              <option value="18" selected>18%</option>
              <option value="28">28%</option>
            </select>
          </div>
          <div class="invoice-item-field">
            <label>Total</label>
            <div class="invoice-item-total">₹0.00</div>
          </div>
          <button type="button" class="invoice-btn-remove" aria-label="Remove item" style="align-self: flex-end;">×</button>
        </div>
      </div>
    `;

    const newItem = document.createElement("div");
    newItem.innerHTML = itemHTML;
    container.appendChild(newItem.firstElementChild);
    this.updateInvoiceSummary();
  }

  updateInvoiceSummary() {
    const container = $("invoiceItemsContainer");
    if (!container) return;

    const items = container.querySelectorAll(".invoice-item");
    let subtotal = 0;
    let totalGst = 0;

    items.forEach((item) => {
      const qty = parseFloat(item.querySelector(".item-quantity")?.value || 0);
      const price = parseFloat(item.querySelector(".item-price")?.value || 0);
      const gstPercent = parseFloat(
        item.querySelector(".item-gst")?.value || 0,
      );

      const itemSubtotal = qty * price;
      const itemGst = (itemSubtotal * gstPercent) / 100;
      const itemTotal = itemSubtotal + itemGst;

      subtotal += itemSubtotal;
      totalGst += itemGst;

      const totalSpan = item.querySelector(".invoice-item-total");
      if (totalSpan) {
        totalSpan.textContent = this.formatInvoiceCurrency(itemTotal);
      }
    });

    const totalAmount = subtotal + totalGst;

    const subtotalEl = $("invoiceSubtotal");
    const gstEl = $("invoiceTotalGst");
    const totalEl = $("invoiceTotalAmount");

    if (subtotalEl)
      subtotalEl.textContent = this.formatInvoiceCurrency(subtotal);
    if (gstEl) gstEl.textContent = this.formatInvoiceCurrency(totalGst);
    if (totalEl) totalEl.textContent = this.formatInvoiceCurrency(totalAmount);

    // Update invoice generator items
    if (this.currentInvoiceGenerator) {
      const items = [];
      container.querySelectorAll(".invoice-item").forEach((item, index) => {
        items.push({
          description: item.querySelector(".item-description")?.value || "",
          quantity: parseFloat(
            item.querySelector(".item-quantity")?.value || 1,
          ),
          unitPrice: parseFloat(item.querySelector(".item-price")?.value || 0),
          gstPercent: parseFloat(item.querySelector(".item-gst")?.value || 18),
        });
      });
      this.currentInvoiceGenerator.setItems(items);
    }
  }

  updateInvoiceDueDate() {
    const daysInput = $("invoiceDaysUntilDue");
    const dueDateInput = $("invoiceDueDate");

    if (daysInput && dueDateInput) {
      const days = parseInt(daysInput.value || 30);
      const d = new Date();
      d.setDate(d.getDate() + days);
      dueDateInput.value = d.toISOString().split("T")[0];
    }
  }

  formatInvoiceCurrency(amount) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(amount);
  }

  handleLogoUpload(file) {
    const maxSize = 1024 * 1024; // 1MB
    const validTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/svg+xml",
    ];

    if (!validTypes.includes(file.type)) {
      this.setStatus(
        "Invalid image format. Supported: JPG, PNG, WebP, SVG",
        "error",
      );
      return;
    }

    if (file.size > maxSize) {
      this.setStatus("Logo file too large. Maximum 1MB allowed.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Data = e.target.result;
      if (this.currentInvoiceGenerator) {
        this.currentInvoiceGenerator.invoiceData.logo = base64Data;
      }

      // Update preview
      const logoImage = $("logoImage");
      const logoPlaceholder = $("logoPlaceholder");
      const clearLogoBtn = $("clearLogoBtn");

      if (logoImage && logoPlaceholder) {
        logoImage.src = base64Data;
        logoImage.style.display = "block";
        logoPlaceholder.style.display = "none";
        clearLogoBtn.style.display = "inline-block";
      }

      this.setStatus("Logo uploaded successfully! 📸", "success");
    };

    reader.onerror = () => {
      this.setStatus("Failed to read logo file.", "error");
    };

    reader.readAsDataURL(file);
  }

  clearLogo() {
    if (this.currentInvoiceGenerator) {
      this.currentInvoiceGenerator.invoiceData.logo = null;
    }

    const logoImage = $("logoImage");
    const logoPlaceholder = $("logoPlaceholder");
    const clearLogoBtn = $("clearLogoBtn");
    const logoFileInput = $("logoFileInput");

    if (logoImage && logoPlaceholder) {
      logoImage.src = "";
      logoImage.style.display = "none";
      logoPlaceholder.style.display = "block";
      clearLogoBtn.style.display = "none";
    }

    if (logoFileInput) {
      logoFileInput.value = "";
    }

    this.setStatus("Logo cleared.", "success");
  }

  previewInvoice() {
    if (!this.currentInvoiceGenerator) return;

    // Update invoice data from form
    this.updateInvoiceDataFromForm();

    const previewModal = $("invoicePreviewModal");
    const previewOverlay = $("invoicePreviewOverlay");
    const previewContainer = $("invoicePreviewContainer");

    if (previewContainer) {
      previewContainer.innerHTML =
        this.currentInvoiceGenerator.generateInvoiceHTML();
    }

    previewModal?.showModal?.();
    previewOverlay?.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
  }

  async generateAndDownloadInvoicePDF() {
    if (!this.currentInvoiceGenerator) return;

    // Update invoice data from form
    this.updateInvoiceDataFromForm();

    this.setStatus("Generating PDF...", "");

    try {
      await this.currentInvoiceGenerator.generatePDF();
      this.setStatus("Invoice PDF downloaded successfully!", "success");
      this.closeInvoiceModal();
    } catch (error) {
      console.error("PDF generation error:", error);
      this.setStatus(
        "Failed to generate PDF. Please try again or use the Print option.",
        "error",
      );
    }
  }

  updateInvoiceDataFromForm() {
    if (!this.currentInvoiceGenerator) return;

    // Update from section
    this.currentInvoiceGenerator.invoiceData.from.name =
      $("invoiceFromName")?.value || "InstaRishta";
    this.currentInvoiceGenerator.invoiceData.from.email =
      $("invoiceFromEmail")?.value || "";
    this.currentInvoiceGenerator.invoiceData.from.address =
      $("invoiceFromAddress")?.value || "";
    this.currentInvoiceGenerator.invoiceData.from.phone =
      $("invoiceFromPhone")?.value || "";

    // Update bill to section
    this.currentInvoiceGenerator.invoiceData.billTo.name =
      $("invoiceBillToName")?.value || "";
    this.currentInvoiceGenerator.invoiceData.billTo.email =
      $("invoiceBillToEmail")?.value || "";
    this.currentInvoiceGenerator.invoiceData.billTo.address =
      $("invoiceBillToAddress")?.value || "";
    this.currentInvoiceGenerator.invoiceData.billTo.phone =
      $("invoiceBillToPhone")?.value || "";

    // Update invoice dates
    this.currentInvoiceGenerator.invoiceData.invoiceDate = new Date(
      $("invoiceIssueDate")?.value || new Date(),
    ).toLocaleDateString("en-GB", { dateStyle: "medium" });
    this.currentInvoiceGenerator.invoiceData.dueDate = new Date(
      $("invoiceDueDate")?.value || new Date(),
    ).toLocaleDateString("en-GB", { dateStyle: "medium" });

    // Update invoice items from form
    const itemsContainer = $("invoiceItemsContainer");
    if (itemsContainer) {
      const items = [];
      itemsContainer.querySelectorAll(".invoice-item").forEach((item) => {
        items.push({
          description: item.querySelector(".item-description")?.value || "",
          quantity: parseFloat(
            item.querySelector(".item-quantity")?.value || 1,
          ),
          unitPrice: parseFloat(item.querySelector(".item-price")?.value || 0),
          gstPercent: parseFloat(item.querySelector(".item-gst")?.value || 18),
        });
      });
      this.currentInvoiceGenerator.setItems(items);
    }

    // Update terms and conditions
    this.currentInvoiceGenerator.invoiceData.termsAndConditions =
      $("invoiceTermsConditions")?.value || "";

    // Update person info
    this.currentInvoiceGenerator.invoiceData.personName =
      $("invoicePersonName")?.value || "";
    this.currentInvoiceGenerator.invoiceData.personNumber =
      $("invoicePersonNumber")?.value || "";
  }
}

domReady(() => {
  const app = new ProfileAdminController();
  app.init();
  window.profileAdminApp = app;
});
