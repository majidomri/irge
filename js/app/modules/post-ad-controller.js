import {
  $,
  $$,
  copyText,
  debounce,
  escapeHtml,
  formatUserText,
  normalizeDate,
  toSafeString,
  toTitleCase,
} from "../utils.js";
import { DataService } from "../services/data-service.js";

const DRAFT_KEY = "InstaRishtaPostAdDraft:v2";
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizePhone(value) {
  return toSafeString(value).replace(/[^\d+]/g, "");
}

function addDaysIso(baseIso, days) {
  const date = new Date(baseIso);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function defaultTitle(gender) {
  if (gender === "female") return "ضرورت رشتہ لڑکی";
  if (gender === "male") return "ضرورت رشتہ لڑکا";
  return "ضرورت رشتہ";
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 250);
}

function cloneRecord(record) {
  if (!record || typeof record !== "object") return null;
  try {
    return JSON.parse(JSON.stringify(record));
  } catch {
    return { ...record };
  }
}

function parsePositiveNumber(value, fallback = 30) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.round(parsed));
}

export class PostAdController {
  constructor() {
    this.dataService = new DataService([]);
    this.state = {
      importedProfiles: [],
      selectedIndex: -1,
      draftKey: DRAFT_KEY,
      activeRecord: null,
      draftCreatedAt: "",
    };
  }

  init() {
    this.cacheDom();
    this.bindEvents();
    this.restoreDraft();

    if (!this.profileId?.value) {
      this.profileId.value = String(Date.now());
    }

    if (!this.profileGender?.value) {
      this.profileGender.value = "unknown";
    }

    if (!this.profileContactMode?.value) {
      this.profileContactMode.value = "direct";
    }

    if (!this.profileExpiresDays?.value) {
      this.profileExpiresDays.value = "30";
    }

    if (!this.profileSourceUrl?.value) {
      this.profileSourceUrl.value = "jsdata.json";
    }

    if (!this.state.draftCreatedAt) {
      this.state.draftCreatedAt = new Date().toISOString();
    }

    this.render();
    this.setStatus("Ready to build a clean profile ad.");
  }

  cacheDom() {
    this.form = $("postAdForm");
    this.statusBar = $("postAdStatus");
    this.profileId = $("profileId");
    this.profileTitle = $("profileTitle");
    this.profileBody = $("profileBody");
    this.profileAge = $("profileAge");
    this.profileGender = $("profileGender");
    this.profileEducation = $("profileEducation");
    this.profileLocation = $("profileLocation");
    this.profilePhone = $("profilePhone");
    this.profileWhatsapp = $("profileWhatsapp");
    this.profileInstagramPostId = $("profileInstagramPostId");
    this.profileValues = $("profileValues");
    this.profileNotes = $("profileNotes");
    this.profileContactNotes = $("profileContactNotes");
    this.profileGuardianName = $("profileGuardianName");
    this.profileGuardianPhone = $("profileGuardianPhone");
    this.profileUrgent = $("profileUrgent");
    this.profileVerified = $("profileVerified");
    this.profileFamilyApproval = $("profileFamilyApproval");
    this.profileContactMode = $("profileContactMode");
    this.profileExpiresDays = $("profileExpiresDays");
    this.profileSourceUrl = $("profileSourceUrl");
    this.loadSourceBtn = $("loadSourceBtn");
    this.generateIdBtn = $("generateIdBtn");
    this.newProfileBtn = $("newProfileBtn");
    this.duplicateProfileBtn = $("duplicateProfileBtn");
    this.deleteProfileBtn = $("deleteProfileBtn");
    this.renewProfileBtn = $("renewProfileBtn");
    this.downloadJsonBtn = $("downloadJsonBtn");
    this.copyJsonBtn = $("copyJsonBtn");
    this.copyMessageBtn = $("copyMessageBtn");
    this.openTelegramBtn = $("openTelegramBtn");
    this.openWhatsAppBtn = $("openWhatsAppBtn");
    this.resetBtn = $("resetBtn");
    this.previewCard = $("postAdPreview");
    this.jsonPreview = $("postAdJsonPreview");
    this.importedCount = $("importedCount");
    this.importedList = $("importedList");
  }

  bindEvents() {
    const rerender = debounce(() => this.render(), 120);

    this.form?.addEventListener("submit", (event) => {
      event.preventDefault();
    });

    const syncFromForm = () => {
      const record = this.buildRecord();
      this.state.activeRecord = cloneRecord(record);

      if (this.state.selectedIndex >= 0 && this.state.importedProfiles[this.state.selectedIndex]) {
        this.state.importedProfiles[this.state.selectedIndex] = cloneRecord(record);
      }

      return record;
    };

    this.form?.addEventListener("input", () => {
      syncFromForm();
      this.render();
      this.saveDraft();
    });

    this.form?.addEventListener("change", () => {
      syncFromForm();
      this.render();
      this.saveDraft();
    });

    this.loadSourceBtn?.addEventListener("click", () => this.loadSource());
    this.generateIdBtn?.addEventListener("click", () => {
      const nowIso = new Date().toISOString();
      if (this.profileId) this.profileId.value = String(Date.now());
      this.state.draftCreatedAt = nowIso;
      this.state.activeRecord = cloneRecord(this.buildRecord({ forceNewIdentity: true }));
      this.render();
      this.saveDraft();
      this.setStatus("Generated a fresh profile ID.");
    });
    this.newProfileBtn?.addEventListener("click", () => this.createNewProfile());
    this.duplicateProfileBtn?.addEventListener("click", () => this.duplicateCurrentProfile());
    this.deleteProfileBtn?.addEventListener("click", () => this.deleteCurrentProfile());
    this.renewProfileBtn?.addEventListener("click", () => this.renewCurrentProfile());
    this.downloadJsonBtn?.addEventListener("click", () => this.downloadJson());
    this.copyJsonBtn?.addEventListener("click", () => this.copyJson());
    this.copyMessageBtn?.addEventListener("click", () => this.copyMessage());
    this.openTelegramBtn?.addEventListener("click", () => this.openTelegram());
    this.openWhatsAppBtn?.addEventListener("click", () => this.openWhatsApp());
    this.resetBtn?.addEventListener("click", () => this.resetForm());

    this.importedList?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-index]");
      if (!button) return;
      const index = Number(button.getAttribute("data-index"));
      if (Number.isNaN(index)) return;
      this.selectImportedProfile(index);
    });

    this.profileSourceUrl?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.loadSource();
      }
    });

    this.profileSourceUrl?.addEventListener("input", rerender);
  }

  setStatus(message, tone = "") {
    if (!this.statusBar) return;
    this.statusBar.textContent = message;
    this.statusBar.dataset.tone = tone;
  }

  restoreDraft() {
    try {
      const raw = localStorage.getItem(this.state.draftKey);
      if (!raw) return;

      const draft = JSON.parse(raw);
      if (!draft || typeof draft !== "object") return;

      if (Array.isArray(draft)) {
        this.state.importedProfiles = draft.map((item) => cloneRecord(item)).filter(Boolean);
        this.state.selectedIndex = this.state.importedProfiles.length ? 0 : -1;
        if (this.state.importedProfiles[0]) {
          this.setRecord(this.state.importedProfiles[0]);
        }
        this.setStatus("Draft restored from local storage.");
        return;
      }

      if (Array.isArray(draft.importedProfiles)) {
        this.state.importedProfiles = draft.importedProfiles.map((item) => cloneRecord(item)).filter(Boolean);
      }

      if (Number.isInteger(draft.selectedIndex)) {
        this.state.selectedIndex = draft.selectedIndex;
      }

      if (draft.draftCreatedAt) {
        this.state.draftCreatedAt = toSafeString(draft.draftCreatedAt);
      }

      const record = cloneRecord(draft.activeRecord || draft.record || (draft.id ? draft : null));
      if (record) {
        this.setRecord(record);
      } else if (this.state.selectedIndex >= 0 && this.state.importedProfiles[this.state.selectedIndex]) {
        this.setRecord(this.state.importedProfiles[this.state.selectedIndex]);
      }

      if (this.state.importedProfiles.length && this.state.selectedIndex < 0) {
        this.state.selectedIndex = 0;
        this.setRecord(this.state.importedProfiles[0]);
      }

      if (record || this.state.importedProfiles.length) {
        this.setStatus("Draft restored from local storage.");
      }
    } catch {
      // Ignore draft load issues.
    }
  }

  saveDraft() {
    try {
      const payload = {
        activeRecord: this.buildRecord(),
        importedProfiles: this.state.importedProfiles.map((item) => cloneRecord(item)).filter(Boolean),
        selectedIndex: this.state.selectedIndex,
        draftCreatedAt: this.state.draftCreatedAt,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(this.state.draftKey, JSON.stringify(payload));
    } catch {
      // Draft persistence is best effort.
    }
  }

  getBaseRecord() {
    if (this.state.selectedIndex >= 0) {
      return this.state.importedProfiles[this.state.selectedIndex] || null;
    }
    if (this.state.activeRecord) {
      return this.state.activeRecord;
    }
    return null;
  }

  getExpiresDays(record = null) {
    const fieldDays = parsePositiveNumber(this.profileExpiresDays?.value, 0);
    if (fieldDays > 0) return fieldDays;

    const recordDays = parsePositiveNumber(record?.expiresDays, 0);
    if (recordDays > 0) return recordDays;

    const baseDate = Date.parse(record?.date || record?.createdAt || "");
    const expiryDate = Date.parse(record?.expiresAt || "");
    if (!Number.isNaN(baseDate) && !Number.isNaN(expiryDate)) {
      const diff = Math.round((expiryDate - baseDate) / DAY_MS);
      if (diff > 0) return diff;
    }

    return 30;
  }

  buildRecord(options = {}) {
    const nowIso = new Date().toISOString();
    const baseRecord = this.getBaseRecord();
    const forceNewIdentity = Boolean(options.forceNewIdentity);
    const forceRenewal = Boolean(options.forceRenewal);
    const age = toSafeString(this.profileAge?.value);
    const gender = toSafeString(this.profileGender?.value) || "unknown";
    const urgent = Boolean(this.profileUrgent?.checked);
    const familyApproval = Boolean(this.profileFamilyApproval?.checked);
    const contactMode = familyApproval
      ? "family"
      : toSafeString(this.profileContactMode?.value) || "direct";
    const createdAt = forceNewIdentity || forceRenewal
      ? nowIso
      : toSafeString(baseRecord?.date || baseRecord?.createdAt || this.state.draftCreatedAt || nowIso) || nowIso;
    const expiresDays = this.getExpiresDays(baseRecord);
    const title = toSafeString(this.profileTitle?.value) || defaultTitle(gender);
    const sourceUrl = toSafeString(this.profileSourceUrl?.value);

    return {
      id: forceNewIdentity ? String(Date.now()) : (toSafeString(this.profileId?.value) || toSafeString(baseRecord?.id) || String(Date.now())),
      title,
      body: toSafeString(this.profileBody?.value),
      age,
      gender,
      education: toSafeString(this.profileEducation?.value),
      location: toSafeString(this.profileLocation?.value),
      phone: normalizePhone(this.profilePhone?.value),
      whatsapp: normalizePhone(this.profileWhatsapp?.value),
      instagramPostId: toSafeString(this.profileInstagramPostId?.value),
      values: toSafeString(this.profileValues?.value),
      notes: toSafeString(this.profileNotes?.value),
      contactNotes: toSafeString(this.profileContactNotes?.value),
      guardianName: toSafeString(this.profileGuardianName?.value),
      guardianPhone: normalizePhone(this.profileGuardianPhone?.value),
      urgent,
      verified: Boolean(this.profileVerified?.checked),
      familyApproval,
      contactMode,
      priority: urgent ? "urgent" : "normal",
      date: createdAt,
      createdAt,
      updatedAt: nowIso,
      expiresDays,
      expiresAt: addDaysIso(forceRenewal ? nowIso : createdAt, expiresDays),
      sourceUrl,
    };
  }

  createBlankRecord() {
    const nowIso = new Date().toISOString();
    const expiresDays = this.getExpiresDays();

    return {
      id: String(Date.now()),
      title: "",
      body: "",
      age: "",
      gender: "unknown",
      education: "",
      location: "",
      phone: "",
      whatsapp: "",
      instagramPostId: "",
      values: "",
      notes: "",
      contactNotes: "",
      guardianName: "",
      guardianPhone: "",
      urgent: false,
      verified: false,
      familyApproval: false,
      contactMode: "direct",
      priority: "normal",
      date: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      expiresDays,
      expiresAt: addDaysIso(nowIso, expiresDays),
      sourceUrl: toSafeString(this.profileSourceUrl?.value),
    };
  }

  setRecord(record) {
    if (!record) return;

    const normalized = cloneRecord(record) || {};
    const fallbackDate = normalized.date || normalized.createdAt || normalized.updatedAt || new Date().toISOString();
    this.state.activeRecord = cloneRecord(normalized);
    this.state.draftCreatedAt = toSafeString(fallbackDate) || new Date().toISOString();

    if (this.profileId) this.profileId.value = toSafeString(normalized.id) || String(Date.now());
    if (this.profileTitle) this.profileTitle.value = toSafeString(normalized.title);
    if (this.profileBody) this.profileBody.value = toSafeString(normalized.body);
    if (this.profileAge) this.profileAge.value = toSafeString(normalized.age);
    if (this.profileGender) this.profileGender.value = toSafeString(normalized.gender) || "unknown";
    if (this.profileEducation) this.profileEducation.value = toSafeString(normalized.education);
    if (this.profileLocation) this.profileLocation.value = toSafeString(normalized.location);
    if (this.profilePhone) this.profilePhone.value = toSafeString(normalized.phone);
    if (this.profileWhatsapp) this.profileWhatsapp.value = toSafeString(normalized.whatsapp);
    if (this.profileInstagramPostId) this.profileInstagramPostId.value = toSafeString(normalized.instagramPostId);
    if (this.profileValues) this.profileValues.value = toSafeString(normalized.values);
    if (this.profileNotes) this.profileNotes.value = toSafeString(normalized.notes);
    if (this.profileContactNotes) this.profileContactNotes.value = toSafeString(normalized.contactNotes);
    if (this.profileGuardianName) this.profileGuardianName.value = toSafeString(normalized.guardianName);
    if (this.profileGuardianPhone) this.profileGuardianPhone.value = toSafeString(normalized.guardianPhone);
    if (this.profileUrgent) this.profileUrgent.checked = Boolean(normalized.urgent);
    if (this.profileVerified) this.profileVerified.checked = Boolean(normalized.verified);
    if (this.profileFamilyApproval) this.profileFamilyApproval.checked = Boolean(normalized.familyApproval);
    if (this.profileContactMode) this.profileContactMode.value = toSafeString(normalized.contactMode) || "direct";
    if (this.profileExpiresDays) {
      this.profileExpiresDays.value = String(this.getExpiresDays(normalized));
    }
    if (this.profileSourceUrl) {
      const sourceValue = toSafeString(normalized.sourceUrl);
      if (sourceValue) {
        this.profileSourceUrl.value = sourceValue;
      } else if (!this.profileSourceUrl.value) {
        this.profileSourceUrl.value = "jsdata.json";
      }
    }
  }

  getCurrentRecord() {
    return this.buildRecord();
  }

  getExportPayload(record) {
    const exportRecord = cloneRecord(record) || this.createBlankRecord();

    if (this.state.importedProfiles.length) {
      if (this.state.selectedIndex >= 0 && this.state.selectedIndex < this.state.importedProfiles.length) {
        return this.state.importedProfiles.map((item, index) => {
          if (index === this.state.selectedIndex) return exportRecord;
          return item;
        });
      }

      return [...this.state.importedProfiles, exportRecord];
    }

    return [exportRecord];
  }

  renderImportedProfiles() {
    if (!this.importedList || !this.importedCount) return;

    this.importedCount.textContent = String(this.state.importedProfiles.length);
    if (!this.state.importedProfiles.length) {
      this.importedList.innerHTML = "";
      this.importedList.hidden = true;
      return;
    }

    this.importedList.hidden = false;
    this.importedList.innerHTML = this.state.importedProfiles.map((profile, index) => {
      const active = index === this.state.selectedIndex;
      const title = profile.title || defaultTitle(profile.gender);
      const status = this.getRecordStatus(profile);
      const dateText = normalizeDate(profile.date || profile.createdAt || new Date());
      return `
        <button type="button" class="import-pill${active ? " active" : ""}" data-index="${index}" aria-pressed="${active ? "true" : "false"}">
          <span class="import-pill-row">
            <strong>LR ${escapeHtml(profile.id)}</strong>
            <small class="import-pill-status import-pill-status-${escapeHtml(status.tone)}">${escapeHtml(status.label)}</small>
          </span>
          <span class="import-pill-title">${escapeHtml(title)}</span>
          <small class="import-pill-meta">${escapeHtml(dateText.slice(0, 10))}</small>
        </button>
      `;
    }).join("");
  }

  getRecordStatus(record) {
    const urgent = Boolean(record?.urgent);
    const verified = Boolean(record?.verified);
    const expiresAt = Date.parse(record?.expiresAt || "");

    if (!Number.isNaN(expiresAt)) {
      const remainingDays = (expiresAt - Date.now()) / DAY_MS;
      if (remainingDays < 0) {
        return { label: "Expired", tone: "expired" };
      }
      if (remainingDays <= 3) {
        return { label: "Expiring soon", tone: "warning" };
      }
    }

    if (urgent) return { label: "Urgent", tone: "urgent" };
    if (verified) return { label: "Verified", tone: "verified" };
    return { label: "Active", tone: "active" };
  }

  selectImportedProfile(index) {
    const profile = this.state.importedProfiles[index];
    if (!profile) return;

    this.state.selectedIndex = index;
    this.setRecord(profile);
    this.render();
    this.setStatus(`Selected imported profile LR ${profile.id}.`);
  }

  createNewProfile() {
    this.state.selectedIndex = -1;
    const blank = this.createBlankRecord();
    this.setRecord(blank);
    this.render();
    this.saveDraft();
    this.setStatus(`Started a new profile draft with LR ${blank.id}.`);
  }

  duplicateCurrentProfile() {
    const source = this.getBaseRecord() || this.getCurrentRecord();
    const duplicate = cloneRecord(source) || this.createBlankRecord();
    const nowIso = new Date().toISOString();
    duplicate.id = String(Date.now());
    duplicate.date = nowIso;
    duplicate.createdAt = source?.createdAt || source?.date || nowIso;
    duplicate.updatedAt = nowIso;
    duplicate.expiresDays = this.getExpiresDays(source);
    duplicate.expiresAt = addDaysIso(nowIso, duplicate.expiresDays);
    duplicate.sourceUrl = toSafeString(this.profileSourceUrl?.value) || duplicate.sourceUrl || "";
    duplicate.priority = duplicate.urgent ? "urgent" : "normal";

    this.state.importedProfiles.push(duplicate);
    this.state.selectedIndex = this.state.importedProfiles.length - 1;
    this.setRecord(duplicate);
    this.render();
    this.saveDraft();
    this.setStatus(`Duplicated profile as LR ${duplicate.id}.`);
  }

  deleteCurrentProfile() {
    if (this.state.selectedIndex < 0 || !this.state.importedProfiles.length) {
      this.setStatus("Select an imported profile to delete.", "error");
      return;
    }

    const removed = this.state.importedProfiles.splice(this.state.selectedIndex, 1)[0];
    const nextIndex = Math.min(this.state.selectedIndex, this.state.importedProfiles.length - 1);

    if (this.state.importedProfiles[nextIndex]) {
      this.state.selectedIndex = nextIndex;
      this.setRecord(this.state.importedProfiles[nextIndex]);
    } else {
      this.state.selectedIndex = -1;
      const blank = this.createBlankRecord();
      this.setRecord(blank);
    }

    this.render();
    this.saveDraft();
    this.setStatus(`Deleted LR ${removed?.id || "profile"}.`);
  }

  renewCurrentProfile() {
    const source = this.getBaseRecord() || this.getCurrentRecord();
    const renewed = cloneRecord(source) || this.createBlankRecord();
    const nowIso = new Date().toISOString();
    renewed.date = nowIso;
    renewed.createdAt = source?.createdAt || source?.date || nowIso;
    renewed.updatedAt = nowIso;
    renewed.expiresDays = this.getExpiresDays(source);
    renewed.expiresAt = addDaysIso(nowIso, renewed.expiresDays);
    renewed.priority = renewed.urgent ? "urgent" : "normal";

    if (this.state.selectedIndex >= 0 && this.state.importedProfiles[this.state.selectedIndex]) {
      this.state.importedProfiles[this.state.selectedIndex] = renewed;
    }

    this.setRecord(renewed);
    this.state.draftCreatedAt = renewed.date;
    this.render();
    this.saveDraft();
    this.setStatus(`Renewed LR ${renewed.id} for ${renewed.expiresDays} days.`);
  }

  render() {
    const record = this.syncCurrentRecord();

    this.renderPreview(record);
    this.renderJson(record);
    this.renderImportedProfiles();
    this.saveDraft();
  }

  syncCurrentRecord() {
    const record = this.buildRecord();
    this.state.activeRecord = cloneRecord(record);

    if (this.state.selectedIndex >= 0 && this.state.importedProfiles[this.state.selectedIndex]) {
      this.state.importedProfiles[this.state.selectedIndex] = cloneRecord(record);
    }

    return record;
  }

  renderPreview(record) {
    if (!this.previewCard) return;

    const genderText = record.gender === "female" ? "لڑکی" : record.gender === "male" ? "لڑکا" : "";
    const bodyText = record.body || "Add a clean profile description here.";
    const normalizedBody = bodyText.replace(/\s+/g, " ").trim();
    const isLongBody = normalizedBody.length > 180 || bodyText.split(/\r?\n/).length > 3;
    const contactMode = record.contactMode || (record.familyApproval ? "family" : "direct");
    const contactModeLabel = contactMode === "family"
      ? "Family contact"
      : contactMode === "private"
        ? "Private contact"
        : "Direct contact";
    const trustBadges = [
      record.verified ? '<span class="trust-badge trust-badge-verified">Verified</span>' : "",
      record.familyApproval ? '<span class="trust-badge trust-badge-family">Family approved</span>' : "",
      contactMode !== "direct" ? `<span class="trust-badge trust-badge-private">${escapeHtml(contactModeLabel)}</span>` : "",
      record.values ? '<span class="trust-badge trust-badge-values">Values-led</span>' : "",
    ].filter(Boolean).join("");

    this.previewCard.innerHTML = `
      <article class="card card-hover relative${record.urgent ? " urgent" : ""}">
        ${record.urgent ? '<div class="urgent-badge">URGENT</div>' : ""}
        <h2 class="font-urdu text-lg font-semibold card-title-urdu">${formatUserText(record.title || defaultTitle(record.gender || genderText))}</h2>
        <div class="card-trust-row">${trustBadges}</div>
        <p class="font-urdu text-gray-700 card-body-urdu${isLongBody ? " is-trimmed" : ""}">${formatUserText(bodyText)}</p>
        ${isLongBody ? '<button class="card-toggle-btn" type="button" aria-expanded="false">Read more</button>' : ""}
        <div class="card-meta">
          <small>LR ID: ${escapeHtml(record.id)}</small>
          <small>Date: ${escapeHtml(normalizeDate(record.date || new Date()))}</small>
        </div>
        <div class="card-actions card-actions-primary">
          <button class="action-btn action-btn-lg contact-btn" type="button" aria-label="Preview contact button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path></svg>
            <span>${escapeHtml(contactMode !== "direct" || record.familyApproval ? "Contact safely" : "Contact")}</span>
          </button>
          <button class="action-btn action-btn-lg call-btn" type="button" aria-label="Preview call button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
            <span>Call</span>
          </button>
        </div>
      </article>
    `;
  }

  renderJson(record) {
    if (!this.jsonPreview) return;
    this.jsonPreview.value = JSON.stringify(this.getExportPayload(record), null, 2);
  }

  buildMessage(record) {
    const title = record.title || defaultTitle(record.gender);
    const mode = record.contactMode || (record.familyApproval ? "family" : "direct");
    const lines = [
      "Assalamu Alaikum,",
      "We have prepared a new InstaRishta profile ad and would like to post it.",
      "",
      `InstaRishta ID: LR ${record.id}`,
      `Title: ${title}`,
    ];

    if (record.age) lines.push(`Age: ${record.age}`);
    if (record.gender && record.gender !== "unknown") lines.push(`Gender: ${toTitleCase(record.gender)}`);
    if (record.education) lines.push(`Education: ${record.education}`);
    if (record.location) lines.push(`Location: ${record.location}`);
    if (record.phone) lines.push(`Phone: ${record.phone}`);
    if (record.whatsapp) lines.push(`WhatsApp: ${record.whatsapp}`);
    if (record.instagramPostId) lines.push(`Instagram: ${record.instagramPostId}`);
    if (record.values) lines.push(`Values: ${record.values}`);
    if (record.contactNotes) lines.push(`Contact notes: ${record.contactNotes}`);
    if (record.notes) lines.push(`Notes: ${record.notes}`);
    if (record.guardianName || record.guardianPhone) {
      lines.push(`Guardian: ${[record.guardianName, record.guardianPhone].filter(Boolean).join(" | ")}`);
    }
    if (record.verified) lines.push("Verification: Verified profile");
    if (record.familyApproval) lines.push("Family approval: Enabled");
    if (mode !== "direct") {
      lines.push(`Contact mode: ${mode === "family" ? "Guardian contact" : "Private contact"}`);
    }
    if (record.body) {
      lines.push("");
      lines.push("Profile description:");
      lines.push(record.body);
    }
    lines.push("");
    lines.push("JazakAllah Khair.");

    return lines.join("\n");
  }

  async loadSource() {
    const url = toSafeString(this.profileSourceUrl?.value);
    if (!url) {
      this.setStatus("Paste a Google Sheets or Telegram JSON URL first.", "error");
      return;
    }

    this.setStatus("Loading remote source through the same-origin proxy...");

    try {
      const response = await fetch("/api/proxy-json", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      const sourceData = typeof payload.data === "string"
        ? this.parseRemoteText(payload.data)
        : payload.data;

      const profiles = this.dataService.processUserData(sourceData);
      if (!profiles.length) {
        throw new Error("No valid profile records were found.");
      }

      this.state.importedProfiles = profiles.map((item) => cloneRecord(item)).filter(Boolean);
      this.state.selectedIndex = 0;
      this.setRecord(this.state.importedProfiles[0]);
      this.renderImportedProfiles();
      this.render();
      this.setStatus(`Loaded ${profiles.length} profile${profiles.length === 1 ? "" : "s"} from ${payload.source}`);
    } catch (error) {
      this.setStatus(`Import failed: ${error?.message || "Unknown error"}`, "error");
    }
  }

  parseRemoteText(text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  downloadJson() {
    const record = this.getCurrentRecord();
    const payload = this.getExportPayload(record);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const fileName = "jsdata.json";
    downloadBlob(blob, fileName);
    this.setStatus(`Downloaded ${fileName}.`);
  }

  async copyJson() {
    const record = this.getCurrentRecord();
    const payload = this.getExportPayload(record);
    const ok = await copyText(JSON.stringify(payload, null, 2));
    this.setStatus(ok ? "JSON copied to clipboard." : "Could not copy JSON.", ok ? "success" : "error");
  }

  async copyMessage() {
    const ok = await copyText(this.buildMessage(this.getCurrentRecord()));
    this.setStatus(ok ? "Message copied to clipboard." : "Could not copy message.", ok ? "success" : "error");
  }

  openTelegram() {
    const message = encodeURIComponent(this.buildMessage(this.getCurrentRecord()));
    window.open(`https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${message}`, "_blank", "noopener");
  }

  openWhatsApp() {
    const message = encodeURIComponent(this.buildMessage(this.getCurrentRecord()));
    window.open(`https://wa.me/?text=${message}`, "_blank", "noopener");
  }

  resetForm() {
    if (this.form) this.form.reset();
    this.state.importedProfiles = [];
    this.state.selectedIndex = -1;
    this.state.activeRecord = null;
    this.state.draftCreatedAt = new Date().toISOString();
    if (this.profileId) this.profileId.value = String(Date.now());
    if (this.profileGender) this.profileGender.value = "unknown";
    if (this.profileContactMode) this.profileContactMode.value = "direct";
    if (this.profileExpiresDays) this.profileExpiresDays.value = "30";
    if (this.profileSourceUrl) this.profileSourceUrl.value = "";
    this.renderImportedProfiles();
    this.render();
    this.saveDraft();
    this.setStatus("Form reset.");
  }
}
