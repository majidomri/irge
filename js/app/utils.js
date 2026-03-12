export function $(id) {
  return document.getElementById(id);
}

export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function addClass(element, className) {
  if (element) element.classList.add(className);
}

export function removeClass(element, className) {
  if (element) element.classList.remove(className);
}

export function toggleClass(element, className, shouldHave) {
  if (!element) return;
  element.classList.toggle(className, Boolean(shouldHave));
}

export function debounce(fn, wait = 200) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}

export function toSafeString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

export function isArray(value) {
  return Array.isArray(value);
}

export function isObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function pickFirst(obj, keys) {
  if (!obj || !keys) return "";
  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(obj, key) &&
      obj[key] !== "" &&
      obj[key] !== null &&
      obj[key] !== undefined
    ) {
      return obj[key];
    }
  }
  return "";
}

export function getQueryParam(name) {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || "";
  } catch {
    return "";
  }
}

export function escapeHtml(value) {
  return toSafeString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatUserText(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

export function normalizeDate(value) {
  const fallback = new Date().toISOString();
  const dateText = toSafeString(value);
  if (!dateText) return fallback;

  const parsed = new Date(dateText);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  const numeric = Number(dateText);
  if (!Number.isNaN(numeric)) {
    const timestamp = numeric < 1e12 ? numeric * 1000 : numeric;
    const fromNumber = new Date(timestamp);
    if (!Number.isNaN(fromNumber.getTime())) {
      return fromNumber.toISOString();
    }
  }

  return fallback;
}

export function formatDate(value) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return toSafeString(value);
    return date.toLocaleDateString("en-GB");
  } catch {
    return toSafeString(value);
  }
}

export async function copyText(text) {
  const value = toSafeString(text);
  if (!value) return false;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  document.body.appendChild(textArea);
  textArea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textArea);
  return ok;
}

export function toTitleCase(value) {
  const text = toSafeString(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : "";
}

export function domReady(callback) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback);
  } else {
    callback();
  }
}
