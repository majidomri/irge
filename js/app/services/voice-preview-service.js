import { toSafeString } from "../utils.js";

const DEMO_VOICE_SAMPLES = [
  {
    id: "sample-a",
    path: new URL("../../../assets/voice/sample-voice-a.wav", import.meta.url)
      .href,
    durationSec: 2,
  },
  {
    id: "sample-b",
    path: new URL("../../../assets/voice/sample-voice-b.wav", import.meta.url)
      .href,
    durationSec: 2,
  },
  {
    id: "sample-c",
    path: new URL("../../../assets/voice/sample-voice-c.wav", import.meta.url)
      .href,
    durationSec: 2,
  },
];

const DEFAULT_STATE = Object.freeze({
  status: "idle",
  progress: 0,
  durationSec: 0,
  currentTime: 0,
  label: "0:00",
  active: false,
});

function hashValue(value) {
  const text = toSafeString(value) || "0";
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function isPremiumVoiceEligible(user) {
  const priority = toSafeString(user?.priority).toLowerCase();
  return Boolean(
    user?.urgent ||
    user?.premium ||
    user?.featured ||
    priority === "urgent" ||
    priority === "featured" ||
    priority === "premium",
  );
}

export class VoicePreviewService {
  constructor(options = {}) {
    this.onStateChange = typeof options.onStateChange === "function"
      ? options.onStateChange
      : () => {};
    this.sampleLibrary = Array.isArray(options.sampleLibrary) && options.sampleLibrary.length
      ? options.sampleLibrary
      : DEMO_VOICE_SAMPLES;
    this.enableDemoSamples = options.enableDemoSamples !== false;
    this.audio = new Audio();
    this.audio.preload = "none";
    this.audio.crossOrigin = "anonymous";
    this.objectUrlCache = new Map();
    this.stateByUserId = new Map();
    this.currentUserId = "";
    this.currentMeta = null;
    this.requestToken = 0;

    this.audio.addEventListener("play", () => this.emitCurrentState("playing"));
    this.audio.addEventListener("pause", () => {
      if (!this.currentUserId || this.audio.ended) return;
      this.emitCurrentState("paused");
    });
    this.audio.addEventListener("timeupdate", () => this.emitCurrentState("playing"));
    this.audio.addEventListener("loadedmetadata", () => {
      if (this.currentMeta && !this.currentMeta.durationSec && Number.isFinite(this.audio.duration)) {
        this.currentMeta.durationSec = Math.max(0, Math.round(this.audio.duration));
      }
      this.emitCurrentState(this.audio.paused ? "paused" : "playing");
    });
    this.audio.addEventListener("ended", () => {
      const finishedUserId = this.currentUserId;
      const durationSec = this.getCurrentDurationSec();
      this.audio.currentTime = 0;
      this.currentUserId = "";
      this.currentMeta = null;
      if (finishedUserId) {
        this.publishState(finishedUserId, {
          status: "idle",
          progress: 0,
          durationSec,
          currentTime: 0,
          label: this.formatDuration(durationSec),
          active: false,
        });
      }
    });
    this.audio.addEventListener("error", () => {
      if (!this.currentUserId) return;
      const userId = this.currentUserId;
      const durationSec = this.getCurrentDurationSec();
      this.audio.removeAttribute("src");
      try {
        this.audio.load();
      } catch {
        // noop
      }
      this.currentUserId = "";
      this.currentMeta = null;
      this.publishState(userId, {
        status: "error",
        progress: 0,
        durationSec,
        currentTime: 0,
        label: "Voice unavailable",
        active: false,
      });
    });
  }

  normalizeState(state = {}) {
    const durationSec = Math.max(
      0,
      Number.isFinite(state.durationSec)
        ? Math.round(state.durationSec)
        : DEFAULT_STATE.durationSec,
    );
    const currentTime = Math.max(
      0,
      Number.isFinite(state.currentTime) ? state.currentTime : 0,
    );
    const progress = Math.max(
      0,
      Math.min(1, Number.isFinite(state.progress) ? state.progress : 0),
    );

    return {
      ...DEFAULT_STATE,
      ...state,
      durationSec,
      currentTime,
      progress,
      label:
        toSafeString(state.label) || this.formatDuration(durationSec || 0),
      active: Boolean(state.active),
    };
  }

  publishState(userId, state = {}) {
    const key = String(userId || "");
    if (!key) return DEFAULT_STATE;
    const nextState = this.normalizeState(state);
    this.stateByUserId.set(key, nextState);
    this.onStateChange(key, nextState);
    return nextState;
  }

  getVoiceMeta(user) {
    if (!isPremiumVoiceEligible(user)) return null;

    const explicitId = toSafeString(user?.voiceId || user?.voice_id);
    const explicitSrc = toSafeString(user?.voiceSrc || user?.voicePath || user?.voiceUrl || user?.voice_url);
    const explicitDuration = Number(
      user?.voiceDurationSec || user?.voiceDuration || user?.voiceSeconds || 0,
    );

    if (explicitId || explicitSrc) {
      return {
        userId: String(user.id),
        key: explicitId || explicitSrc,
        src: explicitSrc || `/api/voice/${encodeURIComponent(explicitId)}`,
        durationSec: Number.isFinite(explicitDuration) ? explicitDuration : 0,
      };
    }

    if (!this.enableDemoSamples || !this.sampleLibrary.length) {
      return null;
    }

    const sample = this.sampleLibrary[hashValue(user.id) % this.sampleLibrary.length];
    return {
      userId: String(user.id),
      key: `demo:${sample.id}`,
      src: sample.path,
      durationSec: sample.durationSec,
    };
  }

  getPreviewMeta(user) {
    const meta = this.getVoiceMeta(user);
    if (!meta) return null;

    return {
      ...meta,
      voiceId: meta.key,
      label: "Voice intro",
      durationLabel: this.formatDuration(meta.durationSec || 0),
    };
  }

  getState(userId) {
    return this.stateByUserId.get(String(userId || "")) || DEFAULT_STATE;
  }

  getActionType(user) {
    const meta = this.getPreviewMeta(user);
    if (!meta) return "unavailable";

    const userId = String(user?.id || "");
    if (
      this.currentUserId === userId &&
      !this.audio.paused &&
      !this.audio.ended
    ) {
      return "pause";
    }

    if (this.currentUserId === userId && this.audio.paused && this.audio.src) {
      return "resume";
    }

    return "start";
  }

  formatDuration(seconds) {
    const safe = Math.max(0, Number.isFinite(seconds) ? Math.round(seconds) : 0);
    const minutes = Math.floor(safe / 60);
    const remainder = safe % 60;
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  getCurrentDurationSec() {
    if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
      return Math.round(this.audio.duration);
    }
    return this.currentMeta?.durationSec || 0;
  }

  emitCurrentState(status) {
    if (!this.currentUserId) return;
    const durationSec = this.getCurrentDurationSec();
    const currentTime = Math.max(0, this.audio.currentTime || 0);
    const progress = durationSec > 0
      ? Math.min(1, currentTime / durationSec)
      : 0;

    this.publishState(this.currentUserId, {
      status,
      progress,
      durationSec,
      currentTime,
      label: status === "playing"
        ? `${this.formatDuration(currentTime)} / ${this.formatDuration(durationSec)}`
        : this.formatDuration(durationSec),
      active: status === "playing" || status === "paused" || status === "loading",
    });
  }

  async ensureObjectUrl(meta) {
    if (this.objectUrlCache.has(meta.key)) {
      return this.objectUrlCache.get(meta.key);
    }

    const response = await fetch(meta.src, {
      method: "GET",
      cache: "default",
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error(`Voice preview HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    this.objectUrlCache.set(meta.key, objectUrl);
    return objectUrl;
  }

  async toggle(user) {
    const meta = this.getPreviewMeta(user);
    if (!meta) return;

    const userId = String(user.id);

    if (this.currentUserId === userId && !this.audio.paused && !this.audio.ended) {
      this.audio.pause();
      return;
    }

    if (this.currentUserId === userId && this.audio.paused && this.audio.src) {
      await this.audio.play();
      return;
    }

    const previousUserId = this.currentUserId;
    const previousDuration = this.getCurrentDurationSec();
    this.requestToken += 1;
    const token = this.requestToken;

    this.audio.pause();
    if (previousUserId) {
      this.publishState(previousUserId, {
        status: "idle",
        progress: 0,
        durationSec: previousDuration,
        currentTime: 0,
        label: this.formatDuration(previousDuration),
        active: false,
      });
    }

    this.currentUserId = userId;
    this.currentMeta = meta;
    this.publishState(userId, {
      status: "loading",
      progress: 0,
      durationSec: meta.durationSec,
      currentTime: 0,
      label: "Loading",
      active: true,
    });

    try {
      const objectUrl = await this.ensureObjectUrl(meta);
      if (token !== this.requestToken || this.currentUserId !== userId) return;
      this.audio.src = objectUrl;
      this.audio.currentTime = 0;
      await this.audio.play();
    } catch {
      if (token !== this.requestToken) return;
      this.audio.removeAttribute("src");
      try {
        this.audio.load();
      } catch {
        // noop
      }
      this.currentUserId = "";
      this.currentMeta = null;
      this.publishState(userId, {
        status: "error",
        progress: 0,
        durationSec: meta.durationSec,
        currentTime: 0,
        label: "Voice unavailable",
        active: false,
      });
    }
  }

  destroy() {
    this.audio.pause();
    this.audio.removeAttribute("src");
    try {
      this.audio.load();
    } catch {
      // noop
    }

    for (const objectUrl of this.objectUrlCache.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    this.objectUrlCache.clear();
  }
}
