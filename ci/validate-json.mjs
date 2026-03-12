import { readFileSync } from "node:fs";

const raw = readFileSync("jsdata.json", "utf8");
let data;

try {
  data = JSON.parse(raw);
} catch (error) {
  console.error("Invalid JSON:", error.message);
  process.exit(1);
}

if (!Array.isArray(data)) {
  console.error("jsdata.json must be an array.");
  process.exit(1);
}

const requiredFields = [
  ["id", ["string", "number"]],
  ["title", ["string"]],
  ["body", ["string"]],
  ["gender", ["string"]],
  ["date", ["string", "number"]],
];

const errors = [];
const warnings = [];
const idSet = new Set();

for (let index = 0; index < data.length; index += 1) {
  const row = data[index];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    errors.push(`Row ${index}: must be an object.`);
    continue;
  }

  for (const [field, types] of requiredFields) {
    const value = row[field];
    const valueType = typeof value;
    if (value === undefined || value === null || !types.includes(valueType)) {
      errors.push(`Row ${index}: field '${field}' must be ${types.join(" or ")}.`);
    }
  }

  if (row.id !== undefined && row.id !== null) {
    const id = String(row.id);
    if (idSet.has(id)) {
      warnings.push(`Row ${index}: duplicate id '${id}'.`);
    }
    idSet.add(id);
  }

  if (row.date !== undefined && Number.isNaN(Date.parse(String(row.date)))) {
    errors.push(`Row ${index}: invalid date '${row.date}'.`);
  }

  if (row.gender !== undefined) {
    const gender = String(row.gender).toLowerCase();
    if (!["male", "female", "unknown"].includes(gender)) {
      errors.push(`Row ${index}: unsupported gender '${row.gender}'.`);
    }
  }
}

if (errors.length) {
  console.error(`Validation failed with ${errors.length} issue(s):`);
  console.error(errors.slice(0, 25).join("\n"));
  if (errors.length > 25) {
    console.error(`...and ${errors.length - 25} more`);
  }
  process.exit(1);
}

if (warnings.length) {
  console.warn(`Validation warnings (${warnings.length}):`);
  console.warn(warnings.slice(0, 25).join("\n"));
  if (warnings.length > 25) {
    console.warn(`...and ${warnings.length - 25} more`);
  }
}

console.log(`jsdata.json validation passed. Rows: ${data.length}`);
