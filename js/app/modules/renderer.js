import {
  $, addClass, removeClass, copyText, escapeHtml, formatDate, formatUserText, toTitleCase,
} from "../utils.js";

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
      if (this.loadingTemplate && !loading.innerHTML.includes("skeleton-card")) {
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

  createUserCard(user) {
    const card = document.createElement("div");
    card.className = `card card-hover fade-in relative${user.urgent ? " urgent" : ""}`;
    card.setAttribute("role", "listitem");
    card.dataset.userId = String(user.id);

    const urgentBadge = user.urgent ? '<div class="urgent-badge">URGENT</div>' : "";
    const genderText = user.gender === "female" ? "لڑکی" : user.gender === "male" ? "لڑکا" : "";
    const displayTitle = user.title || `ضرورت رشتہ ${genderText}`;
    const bodyText = user.body || "";
    const normalizedBody = bodyText.replace(/\s+/g, " ").trim();
    const isLongBody = normalizedBody.length > 180 || bodyText.split(/\r?\n/).length > 3;
    const bodyId = `profileBody${String(user.id).replace(/[^a-zA-Z0-9_-]/g, "") || "item"}`;
    const contactMode = user.contactMode || (user.familyApproval ? "family" : "direct");
    const contactModeLabel = contactMode === "family"
      ? "Family contact"
      : contactMode === "private"
        ? "Private contact"
        : "Direct contact";
    const trustBadges = [
      user.verified ? '<span class="trust-badge trust-badge-verified">Verified</span>' : "",
      user.familyApproval ? '<span class="trust-badge trust-badge-family">Family approved</span>' : "",
      contactMode !== "direct" ? `<span class="trust-badge trust-badge-private">${escapeHtml(contactModeLabel)}</span>` : "",
      user.values ? '<span class="trust-badge trust-badge-values">Values-led</span>' : "",
    ].filter(Boolean).join("");
    const primaryActionLabel = contactMode !== "direct" || user.familyApproval
      ? "Contact safely"
      : "Contact";

    card.innerHTML = `
      ${urgentBadge}
      <h2 class="font-urdu text-lg font-semibold card-title-urdu">${formatUserText(displayTitle)}</h2>
      <div class="card-trust-row">${trustBadges}</div>
      <p id="${bodyId}" class="font-urdu text-gray-700 card-body-urdu${isLongBody ? " is-trimmed" : ""}">${formatUserText(bodyText)}</p>
      ${
      user.contactMode || user.familyApproval || user.verified || user.values
          ? `<div class="card-contact-note">${escapeHtml([
              user.verified ? "Verified profile" : "",
              contactMode !== "direct" ? contactModeLabel : "",
              user.values ? user.values : "",
            ].filter(Boolean).join(" | "))}</div>`
          : ""
      }
      ${
        isLongBody
          ? `<button class="card-toggle-btn" type="button" aria-controls="${bodyId}" aria-expanded="false">Read more</button>`
          : ""
      }
      <div class="card-meta">
        <small>LR ID: ${escapeHtml(String(user.id))}</small>
        <small>Date: ${escapeHtml(formatDate(user.date))}</small>
      </div>
      <div class="card-actions card-actions-primary">
        <button class="action-btn action-btn-lg contact-btn" data-id="${escapeHtml(String(user.id))}" aria-label="${escapeHtml(primaryActionLabel)} on WhatsApp">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>
          </svg>
          <span>${escapeHtml(primaryActionLabel)}</span>
        </button>
        <button class="action-btn action-btn-lg call-btn" data-id="${escapeHtml(String(user.id))}" aria-label="Call profile">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
          </svg>
          <span>Call</span>
        </button>
      </div>
    `;

    card.querySelector(".contact-btn")?.addEventListener("click", (event) => {
      event.preventDefault();
      this.options.onContact(user);
    });

    card.querySelector(".call-btn")?.addEventListener("click", (event) => {
      event.preventDefault();
      this.options.onCall(user);
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

    this.attachCardGestures(card, user);
    return card;
  }

  attachCardGestures(card, user) {
    const hasActionTarget = (target) =>
      Boolean(target && target.closest && target.closest(".action-btn, .card-toggle-btn"));

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
      { passive: true }
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
      { passive: true }
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
      { passive: true }
    );

    card.addEventListener(
      "touchcancel",
      () => {
        moved = false;
        longPressTriggered = false;
        clearLongPress();
      },
      { passive: true }
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
      console.warn("Card snapshot failed, falling back to legacy poster", error);
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
          text: `LR ID: ${user.id}`,
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
    ctx.fillText(`LR ID: ${user.id}`, 120, 290);

    ctx.fillStyle = "#0f172a";
    ctx.font = "700 30px Inter, Arial, sans-serif";
    const trustFlags = [];
    if (user.verified) trustFlags.push("Verified");
    if (user.familyApproval) trustFlags.push("Family approved");
    if (user.contactMode && user.contactMode !== "direct") trustFlags.push(toTitleCase(user.contactMode));
    if (user.values) trustFlags.push("Values-led");
    if (trustFlags.length) {
      this.drawWrappedText(ctx, trustFlags.join(" | "), 120, 340, width - 240, 36, 2);
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
      3
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
      12
    );

    ctx.fillStyle = "#6b7280";
    ctx.font = "500 30px Inter, Arial, sans-serif";
    ctx.fillText(`Date: ${formatDate(user.date)}`, 120, Math.min(currentY + 70, 1130));

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
        0.95
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
    const backgroundColor = bodyStyles.backgroundColor && bodyStyles.backgroundColor !== "rgba(0, 0, 0, 0)"
      ? bodyStyles.backgroundColor
      : "#f3f7fb";
    const backgroundImage = bodyStyles.backgroundImage && bodyStyles.backgroundImage !== "none"
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
    ].filter(Boolean).join(";");

    const clonedCard = this.cloneNodeWithComputedStyles(sourceCard);
    snapshotRoot.appendChild(clonedCard);

    const svgMarkup = this.buildSvgSnapshotMarkup(snapshotRoot, snapshotWidth, snapshotHeight);
    const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const image = await this.loadImage(svgUrl);
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
          0.98
        );
      });
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  findRenderedCardElement(user) {
    if (!user?.id || typeof document === "undefined") return null;
    const targetId = String(user.id);
    return Array.from(document.querySelectorAll(".card[data-user-id]")).find(
      (card) => card.getAttribute("data-user-id") === targetId
    ) || null;
  }

  getSnapshotPadding(cardElement) {
    const computed = window.getComputedStyle(cardElement);
    const shadow = computed.boxShadow || "";
    const shadowMatch = shadow.match(/(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px(?:\s+(\d+(?:\.\d+)?)px)?/);
    if (!shadowMatch) return 40;

    const offsetX = Math.abs(Number(shadowMatch[1] || 0));
    const offsetY = Math.abs(Number(shadowMatch[2] || 0));
    const blur = Number(shadowMatch[3] || 0);
    const spread = Number(shadowMatch[4] || 0);
    return Math.max(32, Math.ceil(Math.max(offsetX, offsetY) + blur + spread + 12));
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

    foreignObject.setAttribute("x", "0");
    foreignObject.setAttribute("y", "0");
    foreignObject.setAttribute("width", "100%");
    foreignObject.setAttribute("height", "100%");

    wrapper.setAttribute("xmlns", xhtmlNS);
    wrapper.style.cssText = [
      "display:block",
      "box-sizing:border-box",
      "width:100%",
      "height:100%",
      "overflow:visible",
    ].join(";");
    wrapper.appendChild(node);
    foreignObject.appendChild(wrapper);
    svg.appendChild(foreignObject);

    return new XMLSerializer().serializeToString(svg);
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load snapshot image"));
      image.src = src;
    });
  }

  async waitForFonts() {
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
    const words = String(text || "").replace(/\s+/g, " ").trim().split(" ");
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
        lines[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 3))}...`;
      }
    }

    lines.forEach((entry, index) => {
      ctx.fillText(entry, x, y + lineHeight * index);
    });

    return y + lineHeight * lines.length;
  }

  updateStatistics(filteredUsers) {
    const totalElement = $("totalAds");
    const maleElement = $("maleProfiles");
    const femaleElement = $("femaleProfiles");
    const urgentElement = $("urgentAds");

    const total = filteredUsers.length;
    const male = filteredUsers.filter((u) => u.gender === "male").length;
    const female = filteredUsers.filter((u) => u.gender === "female").length;
    const urgent = filteredUsers.filter((u) => u.urgent).length;

    if (totalElement) totalElement.textContent = String(total);
    if (maleElement) maleElement.textContent = String(male);
    if (femaleElement) femaleElement.textContent = String(female);
    if (urgentElement) urgentElement.textContent = String(urgent);
  }

  updateFilterChips(appliedFilters, onRemove) {
    const container = $("filterChips");
    if (!container) return;

    container.querySelectorAll(".filter-chip").forEach((chip) => chip.remove());

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

      chip.querySelector(".chip-close")?.addEventListener("click", () => onRemove(filter.name));
      container.appendChild(chip);
    });
  }

  updateContactLimitIndicator(remaining, resetText) {
    const indicator = $("contactLimitIndicator");
    const remainingElement = $("remainingContacts");
    const timerElement = $("resetTimer");

    if (!indicator || !remainingElement || !timerElement) return;

    remainingElement.textContent = String(remaining);

    if (remaining === 0) {
      timerElement.textContent = `Resets in ${resetText}`;
      indicator.style.background = "linear-gradient(135deg, #fef2f2, #fee2e2)";
      indicator.style.borderColor = "#ef4444";
      remainingElement.style.color = "#dc2626";
    } else if (remaining <= 3) {
      timerElement.textContent = `Resets in ${resetText}`;
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


