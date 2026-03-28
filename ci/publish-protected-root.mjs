import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const outDirName = process.env.PROTECTED_OUT_DIR || "dist-protected";
const outDir = path.join(rootDir, outDirName);

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function replaceTarget(name) {
  const source = path.join(outDir, name);
  const dest = path.join(rootDir, name);
  if (!(await exists(source))) return;
  await fs.rm(dest, { recursive: true, force: true });
  await fs.cp(source, dest, { recursive: true, force: true });
}

const entries = await fs.readdir(outDir, { withFileTypes: true });
for (const entry of entries) {
  await replaceTarget(entry.name);
}

await fs.rm(path.join(rootDir, "jsdata.json"), { force: true });
await fs.rm(path.join(rootDir, "jsdata.json.gz"), { force: true });

console.log(`Published protected build from ${outDirName}/ to repo root.`);
