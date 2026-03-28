import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const outDirName = process.env.PROTECTED_OUT_DIR || "dist-protected";
const outDir = path.join(rootDir, outDirName);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const required = [
  "index.html",
  "service-worker.js",
  path.join("protected", "bootstrap.js"),
  path.join("protected", "runtime-data.js"),
  path.join("protected", "integrity.json"),
];

for (const rel of required) {
  const abs = path.join(outDir, rel);
  if (!(await exists(abs))) {
    throw new Error("Missing protected build asset: " + rel);
  }
}

for (const leaked of ["jsdata.json", "jsdata.json.gz"]) {
  if (await exists(path.join(outDir, leaked))) {
    throw new Error(`Protected build still exposes ${leaked}`);
  }
}

for (const orphan of [
  path.join("styles", "profile-admin.css"),
  path.join("styles", "profile-admin.css.gz"),
  path.join("js", "app", "modules", "profile-admin-controller.js"),
  path.join("js", "app", "modules", "profile-admin-controller.js.gz"),
]) {
  if (await exists(path.join(outDir, orphan))) {
    throw new Error(`Protected build still exposes local-only asset: ${orphan}`);
  }
}

const html = await fs.readFile(path.join(outDir, "index.html"), "utf8");
if (!html.includes('src="protected/bootstrap.js"')) {
  throw new Error("Protected index does not boot from protected/bootstrap.js");
}

if (html.includes('src="js/app/main.js"')) {
  throw new Error("Protected index still references js/app/main.js directly");
}

const runtimeData = await fs.readFile(path.join(outDir, "protected", "runtime-data.js"), "utf8");
if (runtimeData.length < 500) {
  throw new Error("Protected runtime data looks incomplete");
}

const manifestText = await fs.readFile(path.join(outDir, "protected", "integrity.json"), "utf8");
const manifest = JSON.parse(manifestText);
if (!Array.isArray(manifest.targets) || !manifest.targets.length) {
  throw new Error("Integrity manifest has no targets");
}

console.log(`Protected build verification passed for ${outDirName}.`);
