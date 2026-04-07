let users = [];

function toSafeString(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function toTitleCase(value) {
  const text = toSafeString(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : "";
}

function parseNumericAge(value) {
  const text = toSafeString(value);
  if (!text) return null;
  const match = text.match(/\d{1,2}/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseHeightInches(value) {
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

function formatHeightFromInches(value) {
  const inches = Number(value);
  if (!Number.isFinite(inches) || inches <= 0) return "";
  const feet = Math.floor(inches / 12);
  const remainder = inches % 12;
  return `${feet}'${remainder}"`;
}

function applyFilters(sourceUsers, filters) {
  let filtered = [...sourceUsers];
  const appliedFilters = [];

  const search = toSafeString(filters.search).toLowerCase();
  const idFilter = toSafeString(filters.id);
  const gender = toSafeString(filters.gender).toLowerCase() || "all";
  const education = toSafeString(filters.education).toLowerCase();
  const sort = toSafeString(filters.sort) || "dateDesc";
  const ageMin = Number(filters.ageMin || 18);
  const ageMax = Number(filters.ageMax || 60);
  const heightMin = Number(filters.heightMin || 54);
  const heightMax = Number(filters.heightMax || 78);

  if (search) {
    filtered = filtered.filter((user) => {
      const searchText = `${toSafeString(user.body)} ${toSafeString(user.title)} ${toSafeString(user.education)} ${toSafeString(user.location)} ${toSafeString(user.values)}`.toLowerCase();
      return searchText.includes(search);
    });
    appliedFilters.push({ name: "Search", value: filters.search });
  }

  if (idFilter) {
    filtered = filtered.filter((user) => String(user.id).includes(idFilter));
    appliedFilters.push({ name: "ID", value: idFilter });
  }

  if (gender !== "all") {
    filtered = filtered.filter((user) => user.gender === gender);
    appliedFilters.push({ name: "Gender", value: toTitleCase(gender) });
  }

  if (education) {
    filtered = filtered.filter((user) =>
      toSafeString(user.education).toLowerCase().includes(education)
    );
    appliedFilters.push({ name: "Education", value: filters.education });
  }

  if (ageMin > 18 || ageMax < 60) {
    filtered = filtered.filter((user) => {
      const age = Number(user.ageValue) || parseNumericAge(user.age);
      if (!Number.isFinite(age)) return false;
      return age >= ageMin && age <= ageMax;
    });
    appliedFilters.push({ name: "Age", value: `${ageMin}-${ageMax}` });
  }

  if (heightMin > 54 || heightMax < 78) {
    filtered = filtered.filter((user) => {
      const height = Number(user.heightInches) || parseHeightInches(user.height);
      if (!Number.isFinite(height)) return false;
      return height >= heightMin && height <= heightMax;
    });
    appliedFilters.push({
      name: "Height",
      value: `${formatHeightFromInches(heightMin)} - ${formatHeightFromInches(heightMax)}`,
    });
  }

  filtered.sort((a, b) => {
    const aTime = Date.parse(a.date) || 0;
    const bTime = Date.parse(b.date) || 0;

    switch (sort) {
      case "dateAsc":
        return aTime - bTime;
      case "userUrgent":
        if (a.urgent && !b.urgent) return -1;
        if (!a.urgent && b.urgent) return 1;
        return bTime - aTime;
      case "relevance":
        return bTime - aTime;
      case "dateDesc":
      default:
        return bTime - aTime;
    }
  });

  return { filtered, appliedFilters };
}

self.onmessage = (event) => {
  const payload = event.data || {};

  if (payload.type === "setUsers") {
    users = Array.isArray(payload.users) ? payload.users : [];
    self.postMessage({
      type: "users-set",
      requestId: payload.requestId,
      count: users.length,
    });
    return;
  }

  if (payload.type === "filter") {
    try {
      const result = applyFilters(users, payload.filters || {});
      self.postMessage({
        type: "filter-result",
        requestId: payload.requestId,
        result,
      });
    } catch (error) {
      self.postMessage({
        type: "filter-error",
        requestId: payload.requestId,
        error: error?.message || "Worker filter failed",
      });
    }
  }
};
