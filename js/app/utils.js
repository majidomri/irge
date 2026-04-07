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

export function parseNumericAge(value) {
  const text = toSafeString(value);
  if (!text) return null;
  const match = text.match(/\d{1,2}/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseHeightInches(value) {
  const text = toSafeString(value).replace(/\s+/g, " ");
  if (!text) return null;

  const patterns = [
    /(\d)\s*['’]\s*(\d{1,2})/,
    /(\d)\s*[.\-]\s*(\d{1,2})/,
    /(\d)\s*ft\.?\s*(\d{1,2})?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const feet = Number(match[1]);
    const inches = Number(match[2] || 0);
    if (!Number.isFinite(feet) || !Number.isFinite(inches)) continue;
    if (feet < 3 || feet > 8 || inches > 11) continue;
    return feet * 12 + inches;
  }

  const compactMatch = text.match(/\b([4-7])([0-9])\b/);
  if (compactMatch) {
    const feet = Number(compactMatch[1]);
    const inches = Number(compactMatch[2]);
    if (inches <= 11) return feet * 12 + inches;
  }

  return null;
}

export function formatHeightFromInches(value) {
  const inches = Number(value);
  if (!Number.isFinite(inches) || inches <= 0) return "";
  const feet = Math.floor(inches / 12);
  const remainder = inches % 12;
  return `${feet}'${remainder}"`;
}

export function domReady(callback) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback);
  } else {
    callback();
  }
}
