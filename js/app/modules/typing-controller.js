import { $ } from "../utils.js";

export class TypingController {
  constructor(typingState) {
    this.state = typingState;
  }

  start() {
    const container = $("typingText");
    if (!container) return;

    if (this.state.disableAnimation) {
      const fallback = this.state.texts[0] || container.textContent || "";
      container.textContent = fallback;
      return;
    }

    const currentText = this.state.texts[this.state.textIndex] || "";
    const staticText = container?.textContent?.trim() || "";

    if (
      container
      && !this.state.timerId
      && this.state.charIndex === 0
      && staticText === currentText
    ) {
      this.state.charIndex = currentText.length;
      this.state.direction = "backward";
      this.state.timerId = setTimeout(() => this.tick(), this.state.pause);
      return;
    }

    this.tick();
  }

  stop() {
    if (this.state.timerId) {
      clearTimeout(this.state.timerId);
      this.state.timerId = null;
    }
  }

  tick() {
    const container = $("typingText");
    if (!container) return;

    const currentText = this.state.texts[this.state.textIndex] || "";

    if (this.state.direction === "forward") {
      this.state.charIndex += 1;
      if (this.state.charIndex > currentText.length) {
        this.state.direction = "backward";
        this.state.timerId = setTimeout(() => this.tick(), this.state.pause);
        return;
      }
    } else {
      this.state.charIndex -= 1;
      if (this.state.charIndex < 0) {
        this.state.charIndex = 0;
        this.state.direction = "forward";
        this.state.textIndex = (this.state.textIndex + 1) % this.state.texts.length;
      }
    }

    container.textContent = currentText.slice(0, this.state.charIndex);
    const speed = this.state.direction === "forward" ? this.state.speed : this.state.speed / 2;
    this.state.timerId = setTimeout(() => this.tick(), speed);
  }
}
