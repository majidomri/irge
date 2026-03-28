import { $, $$, addClass, removeClass } from "../utils.js";

export class ThemeController {
  constructor(storage, storageKey) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.currentTheme = "system";
  }

  init() {
    this.currentTheme = this.storage.get(this.storageKey, "system") || "system";
    this.applyTheme(this.currentTheme);
    this.updateThemeUi();
    this.bindEvents();
  }

  bindEvents() {
    const themeToggle = $("themeToggle");
    const themeDropdown = $("themeDropdown");
    if (themeToggle) {
      themeToggle.setAttribute("aria-haspopup", "menu");
      themeToggle.setAttribute("aria-expanded", "false");
      themeToggle.setAttribute("aria-controls", "themeDropdown");
    }

    themeToggle?.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = !themeDropdown?.classList.contains("show");
      this.setDropdownOpen(open);
    });

    $$(".theme-option").forEach((option) => {
      option.setAttribute("role", "menuitemradio");
      option.addEventListener("click", () => {
        const theme = option.getAttribute("data-theme") || "system";
        this.setTheme(theme);
        this.setDropdownOpen(false);
      });
    });

    document.addEventListener("click", (event) => {
      if (!themeDropdown || !themeToggle) return;
      if (!themeDropdown.contains(event.target) && !themeToggle.contains(event.target)) {
        this.setDropdownOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      this.setDropdownOpen(false);
    });

    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener("change", () => {
      if (this.currentTheme === "system") this.applyTheme("system");
    });
  }

  setTheme(theme) {
    this.currentTheme = theme;
    this.storage.set(this.storageKey, theme);
    this.applyTheme(theme);
    this.updateThemeUi();
  }

  applyTheme(theme) {
    const body = document.body;
    body.removeAttribute("data-theme");

    if (theme === "system") {
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
      if (prefersDark) body.setAttribute("data-theme", "dark");
      return;
    }

    if (theme !== "light") {
      body.setAttribute("data-theme", theme);
    }
  }

  updateThemeUi() {
    $$(".theme-option").forEach((option) => {
      const isActive = option.getAttribute("data-theme") === this.currentTheme;
      option.classList.toggle("active", isActive);
      option.setAttribute("aria-checked", isActive ? "true" : "false");
    });

    const icon = $("themeIcon");
    if (icon) {
      icon.innerHTML = this.getThemeIcon(this.currentTheme);
    }

    this.refreshThemeOptionIcons();
  }

  setDropdownOpen(open) {
    const themeDropdown = $("themeDropdown");
    const themeToggle = $("themeToggle");
    if (!themeDropdown) return;
    themeDropdown.classList.toggle("show", open);
    themeToggle?.setAttribute("aria-expanded", open ? "true" : "false");
  }

  getThemeIcon(theme) {
    const icons = {
      system:
        '<rect x="3" y="4" width="18" height="12" rx="2"></rect><line x1="8" y1="20" x2="16" y2="20"></line><line x1="12" y1="16" x2="12" y2="20"></line>',
      dark:
        '<path d="M20.5 14.5A8.5 8.5 0 1 1 12 3.5a7 7 0 0 0 8.5 11z"></path><path d="M17.2 5.8h.01"></path><path d="M15.8 3.6h.01"></path>',
      light:
        '<circle cx="12" cy="12" r="4.5"></circle><line x1="12" y1="1.8" x2="12" y2="4"></line><line x1="12" y1="20" x2="12" y2="22.2"></line><line x1="4" y1="12" x2="1.8" y2="12"></line><line x1="22.2" y1="12" x2="20" y2="12"></line><line x1="5.2" y1="5.2" x2="3.7" y2="3.7"></line><line x1="20.3" y1="20.3" x2="18.8" y2="18.8"></line><line x1="18.8" y1="5.2" x2="20.3" y2="3.7"></line><line x1="3.7" y1="20.3" x2="5.2" y2="18.8"></line>',
      "for-you":
        '<path d="M12 21s-7.3-4.6-9.5-8.5A5.6 5.6 0 0 1 12 5a5.6 5.6 0 0 1 9.5 7.5C19.3 16.4 12 21 12 21z"></path><circle cx="18.2" cy="5.8" r="1.2"></circle>',
    };

    return icons[theme] || icons.system;
  }

  refreshThemeOptionIcons() {
    $$(".theme-option").forEach((option) => {
      const theme = option.getAttribute("data-theme") || "system";
      const iconWrap = option.querySelector(".theme-icon");
      if (!iconWrap) return;
      iconWrap.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          ${this.getThemeIcon(theme)}
        </svg>
      `;
    });
  }
}
