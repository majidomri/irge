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

function applyFilters(sourceUsers, filters) {
  let filtered = [...sourceUsers];
  const appliedFilters = [];

  const search = toSafeString(filters.search).toLowerCase();
  const idFilter = toSafeString(filters.id);
  const gender = toSafeString(filters.gender).toLowerCase() || "all";
  const education = toSafeString(filters.education).toLowerCase();
  const sort = toSafeString(filters.sort) || "dateDesc";

  if (search) {
    filtered = filtered.filter((user) => {
      const searchText = `${toSafeString(user.body)} ${toSafeString(user.title)}`.toLowerCase();
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
