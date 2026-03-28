import { toSafeString, toTitleCase } from "../utils.js";

export function applyFilters(users, filters) {
  let filtered = [...users];
  const appliedFilters = [];

  const search = toSafeString(filters.search).toLowerCase();
  const idFilter = toSafeString(filters.id);
  const gender = toSafeString(filters.gender).toLowerCase() || "all";
  const education = toSafeString(filters.education).toLowerCase();
  const sort = toSafeString(filters.sort) || "dateDesc";

  if (search) {
    filtered = filtered.filter((user) => {
      const searchText = [
        user.body,
        user.title,
        user.education,
        user.location,
        user.notes,
        user.values,
        user.guardianName,
        user.contactMode,
        user.instagramPostId,
      ]
        .map((value) => toSafeString(value).toLowerCase())
        .join(" ");
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
