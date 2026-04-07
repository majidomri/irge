import {
  $,
  addClass,
  removeClass,
  copyText,
  escapeHtml,
  formatDate,
  formatHeightFromInches,
  formatUserText,
  parseNumericAge,
  toSafeString,
  toTitleCase,
} from "../utils.js";

const LOCAL_URDU_FONT_FACE_CSS = `
  @font-face {
    font-family: "FaizResolved";
    src:
      local("Faiz Lahori Nastaleeq"),
      local("Faiz Nastaleeq"),
      local("Faiz Nastaliq"),
      local("Faiz Noori Nastaleeq"),
      local("Jameel Noori Nastaleeq");
    font-display: swap;
  }
`;

const URDU_FONT_STACK = [
  '"FaizResolved"',
  '"Faiz Lahori Nastaleeq"',
  '"Faiz Nastaleeq"',
  '"Faiz Nastaliq"',
  '"Jameel Noori Nastaleeq"',
  '"Noto Nastaliq Urdu"',
  '"Noto Naskh Arabic"',
  '"Arial"',
  "serif",
].join(", ");

const SNAPSHOT_URDU_SELECTOR = ".font-urdu, .card-title-urdu, .card-body-urdu";

export class Renderer {
  constructor(options) {
    this.options = options;
    this.statusRegion = $("ariaStatus");
    this.loadingTemplate = $("loading")?.innerHTML || "";
  }

  showLoading() {
    const loading = $("loading");
    const grid = $("userList");
    if (loading) {
      if (
        this.loadingTemplate &&
        !loading.innerHTML.includes("skeleton-card")
      ) {
        loading.innerHTML = this.loadingTemplate;
      }
      loading.classList.add("skeleton-grid");
      loading.classList.remove("text-center");
      removeClass(loading, "hidden");
    }
    if (grid) addClass(grid, "hidden");
  }

  hideLoading() {
    const loading = $("loading");
    if (loading) addClass(loading, "hidden");
  }

  showError(message) {
    const loading = $("loading");
    const grid = $("userList");
    const noResults = $("noResults");

    if (grid) addClass(grid, "hidden");
    if (noResults) addClass(noResults, "hidden");

    if (loading) {
      loading.classList.remove("skeleton-grid");
      loading.classList.add("text-center");
      removeClass(loading, "hidden");
      loading.innerHTML = `<p style="color:#ef4444;font-weight:500;">${escapeHtml(message)}</p>`;
    }
    if (this.statusRegion) this.statusRegion.textContent = message;
  }

  renderUsers(users) {
    const container = $("userList");
    const noResults = $("noResults");
    if (!container || !noResults) return;

    if (!users.length) {
      addClass(container, "hidden");
      removeClass(noResults, "hidden");
      return;
    }

    removeClass(container, "hidden");
    addClass(noResults, "hidden");
    container.innerHTML = "";

    users.forEach((user) => {
      container.appendChild(this.createUserCard(user));
    });
  }

  getCardTone(user) {
    const priority = toSafeString(user?.priority).toLowerCase();
    const urgent = Boolean(user?.urgent || priority === "urgent");
    const featured = Boolean(
      user?.featured ||
      user?.premium ||
      priority === "featured" ||
      priority === "premium",
    );
    const premium = urgent || featured;

    return {
      priority,
      urgent,
      featured,
      premium,
      tone: featured && !urgent ? "featured" : urgent ? "urgent" : "standard",
      badgeLabel: featured && !urgent ? "FEATURED" : "URGENT",
    };
  }

  getMetricItems(user) {
    const items = [];
    const age = Number(user?.ageValue) || parseNumericAge(user?.age);
    const heightLabel =
      formatHeightFromInches(user?.heightInches) || toSafeString(user?.height);
    const education = toSafeString(user?.education);

    if (Number.isFinite(age) && age > 0) {
      items.push({
        kind: "age",
        label: `Age ${age}`,
        icon: '<path d="M12 21a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z"></path><path d="M12 7.5v4.8l2.8 1.7"></path>',
      });
    }

    if (heightLabel) {
      items.push({
        kind: "height",
        label: `Height ${heightLabel}`,
        icon: '<path d="M12 3v18"></path><path d="M8.5 6.5 12 3l3.5 3.5"></path><path d="M8.5 17.5 12 21l3.5-3.5"></path>',
      });
    }

    if (education) {
      items.push({
        kind: "education",
        label: education,
        icon: '<path d="m4 9 8-4 8 4-8 4-8-4Z"></path><path d="M8 11.5v3.2c0 .9 1.9 1.8 4 1.8s4-.9 4-1.8v-3.2"></path>',
      });
    }

    return items;
  }

  renderMetricChips(user) {
    const metrics = this.getMetricItems(user);
    if (!metrics.length) return "";

    return `<div class="card-quick-meta">${metrics
      .map(
        (item) => `
          <span class="card-metric-chip card-metric-chip-${item.kind}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${item.icon}</svg>
            <span>${escapeHtml(item.label)}</span>
          </span>
        `,
      )
      .join("")}</div>`;
  }

  formatVoiceDuration(totalSeconds) {
    const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  getVoiceStatusText(meta, state = {}) {
    const duration = this.formatVoiceDuration(
      state.durationSec || meta.durationSec || 0,
    );
    const current = this.formatVoiceDuration(state.currentTime || 0);

    switch (state.status) {
      case "loading":
        return "Loading voice note...";
      case "playing":
        return `${current} / ${duration}`;
      case "paused":
        return `Paused • ${duration}`;
      case "error":
        return "Voice preview unavailable";
      default:
        return `Tap to listen • ${duration}`;
    }
  }

  applyVoicePreviewStateToButton(button, meta, state = {}) {
    if (!button || !meta) return;

    const progress = Math.max(
      0,
      Math.min(100, Math.round((Number(state.progress) || 0) * 100)),
    );
    const voiceState = state.status || "idle";
    const statusText = this.getVoiceStatusText(meta, state);

    button.dataset.voiceState = voiceState;
    button.style.setProperty("--voice-progress", `${progress}%`);
    button.setAttribute(
      "aria-label",
      `${voiceState === "playing" ? "Pause" : "Play"} voice intro for profile ${meta.userId}. ${statusText}`,
    );
    button.setAttribute(
      "aria-pressed",
      voiceState === "playing" ? "true" : "false",
    );
  }

  setVoicePreviewState(userId, state = {}) {
    const key = String(userId || "");
    if (!key || typeof document === "undefined") return;

    document.querySelectorAll(".voice-preview-btn").forEach((button) => {
      if (button.dataset.voiceUserId !== key) return;
      const meta = {
        userId: key,
        label: button.dataset.voiceLabel || "Voice intro",
        durationSec: Number(button.dataset.voiceDurationSec) || 0,
      };
      this.applyVoicePreviewStateToButton(button, meta, state);
    });
  }

  createUserCard(user) {
    const tone = this.getCardTone(user);
    const card = document.createElement("div");
    card.className = `card card-hover fade-in relative${tone.premium ? " card-premium" : ""}`;
    card.setAttribute("role", "listitem");
    card.dataset.userId = String(user.id);
    card.dataset.cardTone = tone.premium ? tone.tone : "standard";

    const genderText =
      user.gender === "female" ? "لڑکی" : user.gender === "male" ? "لڑکا" : "";
    const displayTitle = user.title || `ضرورت رشتہ ${genderText}`;
    const bodyText = user.body || "";
    const normalizedBody = bodyText.replace(/\s+/g, " ").trim();
    const isLongBody =
      normalizedBody.length > 180 || bodyText.split(/\r?\n/).length > 3;
    const bodyId = `profileBody${String(user.id).replace(/[^a-zA-Z0-9_-]/g, "") || "item"}`;
    const contactMode =
      user.contactMode || (user.familyApproval ? "family" : "direct");
    const contactModeLabel =
      contactMode === "family"
        ? "Family contact"
        : contactMode === "private"
          ? "Private contact"
          : "Direct contact";
    const trustBadges = [
      user.verified
        ? '<span class="trust-badge trust-badge-verified">Verified</span>'
        : "",
      user.familyApproval
        ? '<span class="trust-badge trust-badge-family">Family approved</span>'
        : "",
      contactMode !== "direct"
        ? `<span class="trust-badge trust-badge-private">${escapeHtml(contactModeLabel)}</span>`
        : "",
      user.values
        ? '<span class="trust-badge trust-badge-values">Values-led</span>'
        : "",
    ]
      .filter(Boolean)
      .join("");
    const primaryActionLabel =
      contactMode !== "direct" || user.familyApproval
        ? "Contact safely"
        : "Contact";
    const premiumBadge = tone.premium
      ? `<div class="premium-badge premium-badge--${tone.tone}">${escapeHtml(tone.badgeLabel)}</div>`
      : "";
    const voiceMeta = this.options.getVoicePreviewMeta?.(user, tone) || null;
    const voiceState = voiceMeta
      ? this.options.getVoicePreviewState?.(user.id) || null
      : null;
    const titleHtml = `<h2 class="font-urdu text-lg font-semibold card-title-urdu">${formatUserText(displayTitle)}</h2>`;
    const metricHtml = this.renderMetricChips(user);
    const trustHtml = trustBadges
      ? `<div class="card-trust-row">${trustBadges}</div>`
      : "";
    const bodyHtml = `<p id="${bodyId}" class="font-urdu text-gray-700 card-body-urdu${isLongBody ? " is-trimmed" : ""}">${formatUserText(bodyText)}</p>`;
    const contactNoteHtml =
      user.contactMode || user.familyApproval || user.verified || user.values
        ? `<div class="card-contact-note">${escapeHtml(
            [
              user.verified ? "Verified profile" : "",
              contactMode !== "direct" ? contactModeLabel : "",
              user.values ? user.values : "",
            ]
              .filter(Boolean)
              .join(" | "),
          )}</div>`
        : "";
    const toggleHtml = isLongBody
      ? `<button class="card-toggle-btn" type="button" aria-controls="${bodyId}" aria-expanded="false">Read more</button>`
      : "";
    const resourceIconsHtml = [
      user.instagramPostId
        ? `
          <button class="card-resource-btn card-resource-btn-instagram" type="button" aria-label="Open Instagram post">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <rect x="3.5" y="3.5" width="17" height="17" rx="5"></rect>
              <circle cx="12" cy="12" r="4"></circle>
              <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none"></circle>
            </svg>
          </button>
        `
        : "",
      user.biodataUrl
        ? `
          <button class="card-resource-btn card-resource-btn-biodata" type="button" aria-label="Open biodata">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5z"></path>
              <path d="M14 3.5V8h4"></path>
              <path d="M9 12.5h6"></path>
              <path d="M9 16h6"></path>
            </svg>
          </button>
        `
        : "",
    ]
      .filter(Boolean)
      .join("");
    const voiceActionHtml = voiceMeta
      ? `
        <div class="voice-action-slot">
          <button class="voice-preview-btn" type="button" data-voice-user-id="${escapeHtml(String(voiceMeta.userId))}" data-voice-id="${escapeHtml(voiceMeta.voiceId)}" data-voice-label="${escapeHtml(voiceMeta.label)}" data-voice-duration-sec="${escapeHtml(String(voiceMeta.durationSec || 0))}" data-voice-state="idle" style="--voice-progress:0%">
            <span class="voice-preview-halo" aria-hidden="true"></span>
            <span class="voice-preview-ring" aria-hidden="true"></span>
            <span class="voice-preview-core" aria-hidden="true">
              <svg class="voice-icon voice-icon--play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 6.5v11l9-5.5z"></path></svg>
              <svg class="voice-icon voice-icon--pause" viewBox="0 0 24 24" fill="currentColor"><path d="M8 6h3v12H8zm5 0h3v12h-3z"></path></svg>
              <span class="voice-icon voice-icon--loader"></span>
            </span>
          </button>
        </div>
      `
      : "";
    const metaHtml = `
      <div class="card-meta">
        <small>IR ID: ${escapeHtml(String(user.id))}</small>
        <small>Date: ${escapeHtml(formatDate(user.date))}</small>
      </div>
    `;
    const actionsHtml = `
      <div class="card-actions card-actions-primary${voiceMeta ? " card-actions-with-voice" : ""}">
        <button class="action-btn action-btn-lg contact-btn" data-id="${escapeHtml(String(user.id))}" aria-label="${escapeHtml(primaryActionLabel)} on WhatsApp">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>
          </svg>
          <span>${escapeHtml(primaryActionLabel)}</span>
        </button>
        ${voiceActionHtml}
        <button class="action-btn action-btn-lg call-btn" data-id="${escapeHtml(String(user.id))}" aria-label="Call profile">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
          </svg>
          <span>Call</span>
        </button>
      </div>
    `;
    const utilityFooterHtml = `
      <div class="card-utility-footer">
        <div class="card-resource-links${resourceIconsHtml ? "" : " is-empty"}">
          ${resourceIconsHtml}
        </div>
        <div class="card-branding">instarishta.me</div>
      </div>
    `;

    if (tone.premium) {
      card.innerHTML = `
        <div class="card-premium-bar" aria-hidden="true"></div>
        <div class="card-premium-glow card-premium-glow-1" aria-hidden="true"></div>
        <div class="card-premium-glow card-premium-glow-2" aria-hidden="true"></div>
        <div class="card-premium-sheen" aria-hidden="true"></div>
        <div class="card-premium-content">
          <div class="card-premium-topline">
            <span class="card-premium-rule card-premium-rule--lead" aria-hidden="true"></span>
            ${premiumBadge}
            <span class="card-premium-rule card-premium-rule--tail" aria-hidden="true"></span>
          </div>
                ${titleHtml}
                ${metricHtml}
                ${trustHtml}
                ${bodyHtml}
                ${contactNoteHtml}
                ${toggleHtml}
                ${metaHtml}
                ${actionsHtml}
                ${utilityFooterHtml}
        </div>
      `;
    } else {
      card.innerHTML = `
        <h2 class="font-urdu text-lg font-semibold card-title-urdu">${formatUserText(displayTitle)}</h2>
        ${metricHtml}
        <div class="card-trust-row">${trustBadges}</div>
        ${bodyHtml}
        ${contactNoteHtml}
        ${toggleHtml}
        ${metaHtml}
        ${actionsHtml}
        ${utilityFooterHtml}
      `;
    }

    card.querySelector(".contact-btn")?.addEventListener("click", (event) => {
      event.preventDefault();
      this.options.onContact(user);
    });

    card.querySelector(".call-btn")?.addEventListener("click", (event) => {
      event.preventDefault();
      this.options.onCall(user);
    });

    card
      .querySelector(".card-resource-btn-instagram")
      ?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.options.onInstagram?.(user);
      });

    card
      .querySelector(".card-resource-btn-biodata")
      ?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.options.onBiodata?.(user);
      });

    const toggleButton = card.querySelector(".card-toggle-btn");
    if (toggleButton) {
      const bodyElement = card.querySelector(".card-body-urdu");
      toggleButton.addEventListener("click", () => {
        if (!bodyElement) return;
        const expanded = bodyElement.classList.toggle("is-expanded");
        toggleButton.textContent = expanded ? "Read less" : "Read more";
        toggleButton.setAttribute("aria-expanded", expanded ? "true" : "false");
      });
    }

    if (voiceMeta) {
      const voiceButton = card.querySelector(".voice-preview-btn");
      this.applyVoicePreviewStateToButton(
        voiceButton,
        voiceMeta,
        voiceState || {},
      );
      card.querySelector(".voice-preview-btn")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.options.onVoicePreview?.(user);
      });
    }

    this.attachCardGestures(card, user);
    return card;
  }

  attachCardGestures(card, user) {
    const hasActionTarget = (target) =>
      Boolean(
        target &&
        target.closest &&
        target.closest(
          ".action-btn, .card-toggle-btn, .voice-preview-btn, .card-resource-btn",
        ),
      );

    let lastTapAt = 0;
    let longPressTimer = null;
    let longPressTriggered = false;
    let startX = 0;
    let startY = 0;
    let moved = false;

    const clearLongPress = () => {
      if (!longPressTimer) return;
      clearTimeout(longPressTimer);
      longPressTimer = null;
    };

    card.addEventListener(
      "touchstart",
      (event) => {
        if (hasActionTarget(event.target)) return;

        const touch = event.touches[0];
        if (!touch) return;
        startX = touch.clientX;
        startY = touch.clientY;
        moved = false;
        longPressTriggered = false;
        clearLongPress();

        longPressTimer = setTimeout(() => {
          longPressTriggered = true;
          if (navigator.vibrate) navigator.vibrate(18);
          this.options.onLongPress?.(user);
        }, 600);
      },
      { passive: true },
    );

    card.addEventListener(
      "touchmove",
      (event) => {
        if (!longPressTimer) return;
        const touch = event.touches[0];
        if (!touch) return;
        const deltaX = Math.abs(touch.clientX - startX);
        const deltaY = Math.abs(touch.clientY - startY);
        if (deltaX > 12 || deltaY > 12) {
          moved = true;
          clearLongPress();
        }
      },
      { passive: true },
    );

    card.addEventListener(
      "touchend",
      (event) => {
        if (hasActionTarget(event.target)) {
          clearLongPress();
          return;
        }

        clearLongPress();
        if (moved || longPressTriggered) return;

        const now = Date.now();
        if (now - lastTapAt < 320) {
          lastTapAt = 0;
          if (navigator.vibrate) navigator.vibrate(10);
          this.options.onShare?.(user, card);
          return;
        }

        lastTapAt = now;
      },
      { passive: true },
    );

    card.addEventListener(
      "touchcancel",
      () => {
        moved = false;
        longPressTriggered = false;
        clearLongPress();
      },
      { passive: true },
    );

    // Desktop fallback for quick testing.
    card.addEventListener("dblclick", (event) => {
      if (hasActionTarget(event.target)) return;
      event.preventDefault();
      this.options.onShare?.(user, card);
    });

    // Desktop long-press equivalent using context menu.
    card.addEventListener("contextmenu", (event) => {
      if (hasActionTarget(event.target)) return;
      event.preventDefault();
      this.options.onLongPress?.(user);
    });
  }

  async handleCopyId(id) {
    const ok = await copyText(`LR${id}`);
    this.showToast(ok ? "ID copied to clipboard!" : "Could not copy ID");
  }

  async shareUserCard(user, cardElement = null) {
    let blob;
    try {
      blob = await this.createUserCardImageBlob(user, cardElement);
    } catch (error) {
      console.warn(
        "Card snapshot failed, falling back to legacy poster",
        error,
      );
      blob = await this.createLegacyUserCardImageBlob(user);
    }
    const fileName = `InstaRishta-LR${user.id}.png`;

    const file =
      typeof File !== "undefined"
        ? new File([blob], fileName, { type: "image/png" })
        : null;

    if (
      navigator.share &&
      navigator.canShare &&
      file &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          title: `InstaRishta LR ${user.id}`,
          text: `IR ID: ${user.id}`,
          files: [file],
        });
        this.showToast("Card shared");
        return;
      } catch (error) {
        // If the user cancels native share, avoid noisy error toast.
        if (error && error.name === "AbortError") return;
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.showToast("Image downloaded for sharing");
  }

  async createLegacyUserCardImageBlob(user) {
    const canvas = document.createElement("canvas");
    const width = 1080;
    const height = 1350;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");

    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#4f46e5");
    background.addColorStop(1, "#7c3aed");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    this.drawRoundedRect(ctx, 70, 90, width - 140, height - 180, 34, "#ffffff");

    ctx.fillStyle = "#1f2937";
    ctx.font = "700 54px Inter, Arial, sans-serif";
    ctx.fillText("InstaRishta", 120, 190);

    ctx.fillStyle = "#4f46e5";
    ctx.font = "700 64px Inter, Arial, sans-serif";
    ctx.fillText(`IR ID: ${user.id}`, 120, 290);

    ctx.fillStyle = "#0f172a";
    ctx.font = "700 30px Inter, Arial, sans-serif";
    const trustFlags = [];
    if (user.verified) trustFlags.push("Verified");
    if (user.familyApproval) trustFlags.push("Family approved");
    if (user.contactMode && user.contactMode !== "direct")
      trustFlags.push(toTitleCase(user.contactMode));
    if (user.values) trustFlags.push("Values-led");
    if (trustFlags.length) {
      this.drawWrappedText(
        ctx,
        trustFlags.join(" | "),
        120,
        340,
        width - 240,
        36,
        2,
      );
    }

    ctx.fillStyle = "#111827";
    ctx.font = "600 42px Inter, Arial, sans-serif";
    let currentY = this.drawWrappedText(
      ctx,
      user.title || "Profile",
      120,
      trustFlags.length ? 400 : 380,
      width - 240,
      54,
      3,
    );

    ctx.fillStyle = "#374151";
    ctx.font = "400 34px Inter, Arial, sans-serif";
    currentY = this.drawWrappedText(
      ctx,
      user.body || "",
      120,
      currentY + 20,
      width - 240,
      46,
      12,
    );

    ctx.fillStyle = "#6b7280";
    ctx.font = "500 30px Inter, Arial, sans-serif";
    ctx.fillText(
      `Date: ${formatDate(user.date)}`,
      120,
      Math.min(currentY + 70, 1130),
    );

    ctx.fillStyle = "#111827";
    ctx.font = "600 28px Inter, Arial, sans-serif";
    ctx.fillText("instarishta.me", width - 330, height - 90);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not render share image"));
            return;
          }
          resolve(blob);
        },
        "image/png",
        0.95,
      );
    });
  }

  async createUserCardImageBlob(user, cardElement = null) {
    const sourceCard = cardElement || this.findRenderedCardElement(user);
    if (!sourceCard) {
      throw new Error("Rendered card unavailable");
    }

    await this.waitForFonts();

    const rect = sourceCard.getBoundingClientRect();
    const cardWidth = Math.max(1, Math.ceil(rect.width));
    const cardHeight = Math.max(1, Math.ceil(rect.height));
    const padding = this.getSnapshotPadding(sourceCard);
    const snapshotWidth = cardWidth + padding * 2;
    const snapshotHeight = cardHeight + padding * 2;

    const snapshotRoot = document.createElement("div");
    const bodyStyles = window.getComputedStyle(document.body);
    const backgroundColor =
      bodyStyles.backgroundColor &&
      bodyStyles.backgroundColor !== "rgba(0, 0, 0, 0)"
        ? bodyStyles.backgroundColor
        : "#f3f7fb";
    const backgroundImage =
      bodyStyles.backgroundImage && bodyStyles.backgroundImage !== "none"
        ? bodyStyles.backgroundImage
        : "";

    snapshotRoot.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    snapshotRoot.style.cssText = [
      "display:block",
      "position:relative",
      "box-sizing:border-box",
      `width:${snapshotWidth}px`,
      `height:${snapshotHeight}px`,
      `padding:${padding}px`,
      `background-color:${backgroundColor}`,
      backgroundImage ? `background-image:${backgroundImage}` : "",
      backgroundImage ? "background-repeat:no-repeat" : "",
      "overflow:visible",
      "isolation:isolate",
    ]
      .filter(Boolean)
      .join(";");

    snapshotRoot.appendChild(this.buildSnapshotStyleElement());
    const clonedCard = this.cloneNodeWithComputedStyles(sourceCard);
    snapshotRoot.appendChild(clonedCard);

    const image = await this.loadSvgImage(
      snapshotRoot,
      snapshotWidth,
      snapshotHeight,
    );
    const canvas = document.createElement("canvas");
    canvas.width = snapshotWidth;
    canvas.height = snapshotHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");

    ctx.drawImage(image, 0, 0, snapshotWidth, snapshotHeight);

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not render share image"));
            return;
          }
          resolve(blob);
        },
        "image/png",
        0.98,
      );
    });
  }

  findRenderedCardElement(user) {
    if (!user?.id || typeof document === "undefined") return null;
    const targetId = String(user.id);
    return (
      Array.from(document.querySelectorAll(".card[data-user-id]")).find(
        (card) => card.getAttribute("data-user-id") === targetId,
      ) || null
    );
  }

  getSnapshotPadding(cardElement) {
    const computed = window.getComputedStyle(cardElement);
    const shadow = computed.boxShadow || "";
    const shadowMatch = shadow.match(
      /(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px(?:\s+(\d+(?:\.\d+)?)px)?/,
    );
    if (!shadowMatch) return 40;

    const offsetX = Math.abs(Number(shadowMatch[1] || 0));
    const offsetY = Math.abs(Number(shadowMatch[2] || 0));
    const blur = Number(shadowMatch[3] || 0);
    const spread = Number(shadowMatch[4] || 0);
    return Math.max(
      32,
      Math.ceil(Math.max(offsetX, offsetY) + blur + spread + 12),
    );
  }

  cloneNodeWithComputedStyles(node) {
    const clone = node.cloneNode(true);
    const stack = [[node, clone]];

    while (stack.length) {
      const [source, target] = stack.pop();
      this.copyComputedStyles(source, target);

      const sourceChildren = Array.from(source.children || []);
      const targetChildren = Array.from(target.children || []);
      for (let index = 0; index < sourceChildren.length; index += 1) {
        const sourceChild = sourceChildren[index];
        const targetChild = targetChildren[index];
        if (sourceChild && targetChild) {
          stack.push([sourceChild, targetChild]);
        }
      }
    }

    return clone;
  }

  copyComputedStyles(source, target) {
    if (!(source instanceof Element) || !(target instanceof Element)) return;

    const computed = window.getComputedStyle(source);
    for (let index = 0; index < computed.length; index += 1) {
      const property = computed[index];
      const value = computed.getPropertyValue(property);
      const priority = computed.getPropertyPriority(property);
      target.style.setProperty(property, value, priority);
    }

    target.style.setProperty("animation", "none", "important");
    target.style.setProperty("transition", "none", "important");

    if (source.matches?.(SNAPSHOT_URDU_SELECTOR)) {
      target.style.setProperty("font-family", URDU_FONT_STACK, "important");
      target.style.setProperty("text-rendering", "geometricPrecision");
      target.style.setProperty("-webkit-font-smoothing", "antialiased");
      target.style.setProperty("font-feature-settings", '"liga" 1, "calt" 1');
    }
  }

  buildSnapshotStyleElement() {
    const style = document.createElement("style");
    style.textContent = `
      ${LOCAL_URDU_FONT_FACE_CSS}

      ${SNAPSHOT_URDU_SELECTOR} {
        font-family: ${URDU_FONT_STACK} !important;
        text-rendering: geometricPrecision;
        -webkit-font-smoothing: antialiased;
        font-feature-settings: "liga" 1, "calt" 1;
      }

      .card-title-urdu {
        text-align: center !important;
        text-align-last: center !important;
      }

      .card-body-urdu {
        direction: rtl !important;
        text-align: right !important;
        text-align-last: right !important;
        unicode-bidi: plaintext;
      }
    `;
    return style;
  }

  buildSvgSnapshotMarkup(node, width, height) {
    const svgNS = "http://www.w3.org/2000/svg";
    const xhtmlNS = "http://www.w3.org/1999/xhtml";
    const svg = document.createElementNS(svgNS, "svg");
    const foreignObject = document.createElementNS(svgNS, "foreignObject");
    const wrapper = document.createElementNS(xhtmlNS, "div");

    svg.setAttribute("xmlns", svgNS);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("overflow", "visible");

    foreignObject.setAttribute("x", "0");
    foreignObject.setAttribute("y", "0");
    foreignObject.setAttribute("width", String(width));
    foreignObject.setAttribute("height", String(height));

    wrapper.setAttribute("xmlns", xhtmlNS);
    wrapper.style.cssText = [
      "display:block",
      "box-sizing:border-box",
      `width:${width}px`,
      `height:${height}px`,
      "overflow:visible",
    ].join(";");
    wrapper.appendChild(node);
    foreignObject.appendChild(wrapper);
    svg.appendChild(foreignObject);

    return new XMLSerializer().serializeToString(svg);
  }

  loadSvgImage(node, width, height) {
    const svgMarkup = this.buildSvgSnapshotMarkup(node, width, height);
    const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;

    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => {
        const svgBlob = new Blob([svgMarkup], {
          type: "image/svg+xml;charset=utf-8",
        });
        const blobUrl = URL.createObjectURL(svgBlob);
        const fallbackImage = new Image();
        fallbackImage.decoding = "async";
        fallbackImage.onload = () => {
          URL.revokeObjectURL(blobUrl);
          resolve(fallbackImage);
        };
        fallbackImage.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          reject(new Error("Could not load snapshot image"));
        };
        fallbackImage.src = blobUrl;
      };
      image.src = encoded;
    });
  }

  async waitForFonts() {
    if (document.fonts?.load) {
      await Promise.allSettled([
        document.fonts.load('400 24px "FaizResolved"'),
        document.fonts.load(`400 24px ${URDU_FONT_STACK}`),
        document.fonts.load('400 24px "Noto Nastaliq Urdu"'),
        document.fonts.load('400 24px "Noto Naskh Arabic"'),
      ]);
    }

    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // Ignore font loading failures and proceed with available fallbacks.
      }
    }
  }

  drawRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ");
    const lines = [];
    let line = "";

    for (let i = 0; i < words.length; i += 1) {
      const word = words[i];
      const testLine = line ? `${line} ${word}` : word;
      const width = ctx.measureText(testLine).width;
      if (width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }

      if (lines.length === maxLines) break;
    }

    if (line && lines.length < maxLines) {
      lines.push(line);
    }

    if (words.length && lines.length === maxLines) {
      const last = lines[maxLines - 1];
      if (last && !last.endsWith("...")) {
        lines[maxLines - 1] =
          `${last.slice(0, Math.max(0, last.length - 3))}...`;
      }
    }

    lines.forEach((entry, index) => {
      ctx.fillText(entry, x, y + lineHeight * index);
    });

    return y + lineHeight * lines.length;
  }

  updateStatistics(filteredUsers) {
    const total = filteredUsers.length;
    const male = filteredUsers.filter((u) => u.gender === "male").length;
    const female = filteredUsers.filter((u) => u.gender === "female").length;
    const urgent = filteredUsers.filter((u) => u.urgent).length;
    const statMap = {
      total,
      male,
      female,
      urgent,
    };

    Object.entries(statMap).forEach(([key, value]) => {
      document
        .querySelectorAll(`[data-stat-key="${key}"]`)
        .forEach((node) => {
          node.textContent = String(value);
        });
    });
  }

  updateDashboardInsights(summary = {}) {
    const activityValue = $("activityMetricValue");
    const activityLabel = $("activityMetricLabel");
    const activityMeta = $("activityMetricMeta");
    const activityDial = $("activityGaugeFill");
    const speedValue = $("speedMetricValue");
    const speedLabel = $("speedMetricLabel");
    const speedMeta = $("speedMetricMeta");
    const speedDial = $("speedGaugeFill");
    const marqueeSpeedValue = $("marqueeSpeedValue");
    const marqueeActivityValue = $("marqueeActivityValue");

    if (activityValue) activityValue.textContent = String(summary.activityCount ?? 0);
    if (activityLabel) {
      activityLabel.textContent = summary.activityLabel || "Profiles active right now";
    }
    if (activityMeta) {
      activityMeta.textContent = summary.activityMeta || "Based on the current live feed";
    }
    if (activityDial) {
      activityDial.style.setProperty(
        "--gauge-progress",
        `${Math.max(0, Math.min(100, Number(summary.activityProgress) || 0))}%`,
      );
    }

    if (speedValue) speedValue.textContent = summary.speedText || "--";
    if (speedLabel) speedLabel.textContent = summary.speedLabel || "Checking network quality";
    if (speedMeta) speedMeta.textContent = summary.speedMeta || "Estimated from your current connection";
    if (speedDial) {
      speedDial.style.setProperty(
        "--gauge-progress",
        `${Math.max(0, Math.min(100, Number(summary.speedProgress) || 0))}%`,
      );
    }
    if (marqueeSpeedValue) {
      marqueeSpeedValue.textContent = String(summary.speedNumber ?? "--");
    }
    if (marqueeActivityValue) {
      marqueeActivityValue.textContent = String(summary.activityCount ?? 0);
    }
  }

  updateLiveClock(now = new Date()) {
    const dateNode = $("liveDateValue");
    const dayNode = $("liveDayValue");
    const timeNode = $("liveTimeValue");
    const metaNode = $("liveTimeMeta");
    const marqueeTimeNode = $("marqueeTimeValue");
    const marqueeDayNode = $("marqueeDayValue");
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) return;

    const dayText = now.toLocaleDateString("en-IN", { weekday: "long" });
    const timeText = now.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    if (dayNode) {
      dayNode.textContent = dayText;
    }
    if (dateNode) {
      dateNode.textContent = now.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    }
    if (timeNode) {
      timeNode.textContent = timeText;
    }
    if (metaNode) {
      metaNode.textContent = "Asia/Kolkata live time";
    }
    if (marqueeTimeNode) {
      marqueeTimeNode.textContent = timeText;
    }
    if (marqueeDayNode) {
      marqueeDayNode.textContent = dayText;
    }
  }

  updateFilterChips(appliedFilters, onRemove, onClearAll = null) {
    const container = $("filterChips");
    if (!container) return;

    container.querySelectorAll(".filter-chip").forEach((chip) => chip.remove());
    container.querySelectorAll(".filter-chip-clear").forEach((chip) => chip.remove());

    if (!appliedFilters.length) {
      container.style.display = "none";
      return;
    }

    container.style.display = "flex";

    appliedFilters.forEach((filter) => {
      const chip = document.createElement("div");
      chip.className = "filter-chip";
      chip.innerHTML = `
        <span class="chip-label">${escapeHtml(filter.name)}: ${escapeHtml(filter.value)}</span>
        <button class="chip-close" data-filter="${escapeHtml(filter.name)}">&times;</button>
      `;

      chip
        .querySelector(".chip-close")
        ?.addEventListener("click", () => onRemove(filter.name));
      container.appendChild(chip);
    });

    if (typeof onClearAll === "function" && appliedFilters.length > 1) {
      const clearButton = document.createElement("button");
      clearButton.className = "filter-chip-clear";
      clearButton.type = "button";
      clearButton.textContent = "Clear all";
      clearButton.addEventListener("click", onClearAll);
      container.appendChild(clearButton);
    }
  }

  applyLimitTone(element, remaining, resetText, maxAttempts) {
    if (!element) return;

    const ratio = maxAttempts > 0 ? remaining / maxAttempts : 0;

    if (remaining === 0) {
      element.style.setProperty("--limit-accent", "#dc2626");
      element.style.setProperty("--limit-accent-end", "#ef4444");
      element.style.setProperty("--limit-text-strong", "#dc2626");
      element.style.setProperty("--limit-text", "#991b1b");
      element.style.setProperty("--limit-border", "rgba(239, 68, 68, 0.28)");
    } else if (ratio <= 0.34) {
      element.style.setProperty("--limit-accent", "#d97706");
      element.style.setProperty("--limit-accent-end", "#f59e0b");
      element.style.setProperty("--limit-text-strong", "#d97706");
      element.style.setProperty("--limit-text", "#92400e");
      element.style.setProperty("--limit-border", "rgba(245, 158, 11, 0.28)");
    } else {
      element.style.setProperty("--limit-accent", "#0284c7");
      element.style.setProperty("--limit-accent-end", "#0ea5e9");
      element.style.setProperty("--limit-text-strong", "#0284c7");
      element.style.setProperty("--limit-text", "#0369a1");
      element.style.setProperty("--limit-border", "rgba(14, 165, 233, 0.24)");
    }

    const resetNode = element.querySelector(".contact-limit-reset");
    if (resetNode) {
      resetNode.textContent =
        remaining === maxAttempts ? "Resets every hour" : `Resets in ${resetText}`;
    }
  }

  updateContactLimitIndicator(limitState) {
    const indicator = $("contactLimitIndicator");
    const remainingElement = $("remainingContacts");
    const audioRemainingElement = $("remainingAudioPreviews");
    const contactStat = $("contactLimitStat");
    const audioStat = $("audioLimitStat");

    if (!indicator || !remainingElement || !audioRemainingElement) return;

    const contact = limitState?.contact || {};
    const audio = limitState?.audio || {};

    remainingElement.textContent = String(contact.remaining ?? 0);
    audioRemainingElement.textContent = String(audio.remaining ?? 0);

    this.applyLimitTone(
      contactStat,
      Number(contact.remaining ?? 0),
      contact.resetText || "every hour",
      Number(contact.maxAttempts || 0),
    );
    this.applyLimitTone(
      audioStat,
      Number(audio.remaining ?? 0),
      audio.resetText || "every hour",
      Number(audio.maxAttempts || 0),
    );
  }

  showToast(message) {
    const toast = document.createElement("div");
    toast.style.cssText =
      "position:fixed;top:20px;right:20px;background:#333;color:#fff;padding:12px 16px;border-radius:8px;z-index:10000;font-size:14px;";
    toast.textContent = message;
    document.body.appendChild(toast);
    if (this.statusRegion) this.statusRegion.textContent = message;

    setTimeout(() => {
      toast.remove();
    }, 2200);
  }
}
