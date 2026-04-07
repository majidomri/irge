import { $, addClass, removeClass } from "../utils.js";

export class DrawerController {
  constructor() {
    this.drawer = $("mobileDrawer");
    this.overlay = $("drawerOverlay");
    this.openButton = $("openDrawer");
    this.closeButton = $("closeDrawer");
    this.scrollContainer = this.drawer?.querySelector(".drawer-content") ?? null;
    this.isOpen = false;
    this.swipeState = {
      active: false,
      startX: 0,
      startY: 0,
      startTime: 0,
    };
    this.handleViewportResize = () => this.syncViewportHeight();
    this.handlePageShow = () => this.toggle(false, { restoreFocus: false });
  }

  init() {
    if (this.drawer) this.drawer.setAttribute("inert", "");
    this.openButton?.setAttribute("aria-controls", "mobileDrawer");
    this.openButton?.setAttribute("aria-expanded", "false");
    this.syncViewportHeight();

    this.openButton?.addEventListener("click", () => this.toggle(true));
    this.closeButton?.addEventListener("click", () => this.toggle(false));
    this.overlay?.addEventListener("click", () => this.toggle(false));
    this.bindSwipeToClose();
    window.addEventListener("resize", this.handleViewportResize, { passive: true });
    window.addEventListener("orientationchange", this.handleViewportResize, { passive: true });
    window.visualViewport?.addEventListener("resize", this.handleViewportResize, { passive: true });
    window.visualViewport?.addEventListener("scroll", this.handleViewportResize, { passive: true });
    window.addEventListener("pageshow", this.handlePageShow, { passive: true });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isOpen) {
        this.toggle(false);
      }
    });

    this.toggle(false, { restoreFocus: false });
  }

  toggle(open, options = {}) {
    if (!this.drawer || !this.overlay) return;
    const restoreFocus = options.restoreFocus !== false;
    this.isOpen = open;
    this.resetDrawerDrag();
    this.syncViewportHeight();

    if (open) {
      removeClass(this.drawer, "closed");
      addClass(this.drawer, "open");
      addClass(this.overlay, "show");
      this.drawer.removeAttribute("inert");
      this.drawer.setAttribute("aria-modal", "true");
      this.openButton?.setAttribute("aria-expanded", "true");
      if (this.openButton) {
        this.openButton.hidden = true;
        this.openButton.setAttribute("aria-hidden", "true");
      }
      document.body.style.overflow = "hidden";
      return;
    }

    removeClass(this.drawer, "open");
    addClass(this.drawer, "closed");
    removeClass(this.overlay, "show");
    this.drawer.setAttribute("inert", "");
    this.drawer.removeAttribute("aria-modal");
    this.openButton?.setAttribute("aria-expanded", "false");
    if (this.openButton) {
      this.openButton.hidden = false;
      this.openButton.setAttribute("aria-hidden", "false");
    }
    document.body.style.overflow = "";
    if (restoreFocus) {
      this.openButton?.focus();
    }
  }

  bindSwipeToClose() {
    if (!this.drawer) return;

    this.drawer.addEventListener(
      "touchstart",
      (event) => {
        if (!this.isOpen) return;
        if (this.getScrollTop() > 0) return;
        const touch = event.touches[0];
        if (!touch) return;

        this.swipeState.active = true;
        this.swipeState.startX = touch.clientX;
        this.swipeState.startY = touch.clientY;
        this.swipeState.startTime = Date.now();
      },
      { passive: true }
    );

    this.drawer.addEventListener(
      "touchmove",
      (event) => {
        if (!this.isOpen || !this.swipeState.active) return;
        if (this.getScrollTop() > 0) {
          this.swipeState.active = false;
          return;
        }

        const touch = event.touches[0];
        if (!touch) return;

        const deltaY = touch.clientY - this.swipeState.startY;
        const deltaX = Math.abs(touch.clientX - this.swipeState.startX);

        if (deltaY <= 0 || deltaX > Math.abs(deltaY)) return;

        // Prevent page from scrolling while dragging the open drawer.
        event.preventDefault();
        const offset = Math.min(deltaY, 220);
        this.drawer.style.transition = "none";
        this.drawer.style.transform = `translateY(${offset}px)`;
      },
      { passive: false }
    );

    this.drawer.addEventListener(
      "touchend",
      (event) => {
        if (!this.swipeState.active) {
          this.resetDrawerDrag();
          return;
        }

        const touch = event.changedTouches[0];
        const endY = touch ? touch.clientY : this.swipeState.startY;
        const deltaY = endY - this.swipeState.startY;
        const elapsed = Math.max(1, Date.now() - this.swipeState.startTime);
        const velocity = deltaY / elapsed;

        this.swipeState.active = false;
        this.resetDrawerDrag();

        if (deltaY > 90 || velocity > 0.65) {
          this.toggle(false);
        }
      },
      { passive: true }
    );

    this.drawer.addEventListener(
      "touchcancel",
      () => {
        this.swipeState.active = false;
        this.resetDrawerDrag();
      },
      { passive: true }
    );
  }

  resetDrawerDrag() {
    if (!this.drawer) return;
    this.drawer.style.transition = "";
    this.drawer.style.transform = "";
  }

  getScrollTop() {
    const contentScroll = this.scrollContainer?.scrollTop ?? 0;
    const drawerScroll = this.drawer?.scrollTop ?? 0;
    return Math.max(contentScroll, drawerScroll);
  }

  syncViewportHeight() {
    if (!this.drawer) return;

    const viewportHeight = Math.round(
      window.visualViewport?.height || window.innerHeight || 0
    );

    if (viewportHeight > 0) {
      this.drawer.style.setProperty("--drawer-viewport-height", `${viewportHeight}px`);
    }
  }
}
