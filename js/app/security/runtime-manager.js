import { TEST_USERS } from "./test-data.js";

function now() {
  return new Date().toISOString();
}

function createLogStore() {
  if (typeof window === "undefined") return [];
  if (!Array.isArray(window.__INSTA_ERROR_LOGS__)) {
    window.__INSTA_ERROR_LOGS__ = [];
  }
  return window.__INSTA_ERROR_LOGS__;
}

function pushLog(store, level, message, details) {
  store.push({
    level,
    message,
    details: details || null,
    at: now(),
  });
}

export function initRuntimeManager(config) {
  const mode = config.mode === "protected" ? "protected" : "dev";
  const debug = Boolean(config.debug);
  const store = createLogStore();

  const runtime = {
    mode,
    debug,
    log(message, details) {
      pushLog(store, "info", message, details);
      if (debug) {
        console.info("[InstaRishta:" + mode + "] " + message, details || "");
      }
    },
    warn(message, details) {
      pushLog(store, "warn", message, details);
      if (debug) {
        console.warn("[InstaRishta:" + mode + "] " + message, details || "");
      }
    },
    error(message, error, details = {}) {
      const payload = {
        ...details,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack || "" }
            : error || null,
      };
      pushLog(store, "error", message, payload);
      console.error("[InstaRishta:" + mode + "] " + message, error || "", details);
    },
    setTestData(users = TEST_USERS) {
      if (typeof window === "undefined") return;
      window.__INSTA_TEST_DATA__ = Array.isArray(users) ? users : TEST_USERS;
      runtime.log("Injected test data", {
        rows: window.__INSTA_TEST_DATA__.length,
      });
    },
    clearTestData() {
      if (typeof window === "undefined") return;
      delete window.__INSTA_TEST_DATA__;
      runtime.log("Cleared injected test data");
    },
  };

  if (typeof window !== "undefined") {
    window.__DEV__ = debug;
    window.__INSTA_MODE__ = mode;
    window.__INSTA_RUNTIME__ = runtime;

    window.addEventListener("error", (event) => {
      runtime.error("Unhandled error", event.error || new Error(event.message), {
        file: event.filename || "",
        line: event.lineno || 0,
        column: event.colno || 0,
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      runtime.error("Unhandled promise rejection", event.reason);
    });

    if (config.allowTestData && config.useTestData && !window.__INSTA_TEST_DATA__) {
      runtime.setTestData(TEST_USERS);
    }
  }

  runtime.log("Runtime diagnostics ready", {
    debug,
    mode,
    allowTestData: Boolean(config.allowTestData),
  });

  return runtime;
}
