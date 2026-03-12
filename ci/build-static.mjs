import { promises as fs } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const rootDir = process.cwd();
const outDir = path.join(rootDir, "dist");

const rootFiles = [
  "4.html",
  "manifest.webmanifest",
  "service-worker.js",
  "jsdata.json",
];

const rootDirs = [
  "assets",
  "styles",
  "src",
  path.join("js", "app"),
];

const textExtensions = new Set([
  ".html",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".webmanifest",
  ".svg",
  ".txt",
]);

function minifyCss(input) {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

function removeHtmlComments(input) {
  return input.replace(/<!--(?!\[if[\s\S]*?\]|<!|>)[\s\S]*?-->/g, "");
}

function minifyHtml(input) {
  const protectedBlocks = [];
  const marker = (idx) => `__HTML_BLOCK_${idx}__`;

  const withMarkers = input.replace(
    /<(script|style|pre|textarea)\b[\s\S]*?<\/\1>/gi,
    (match) => {
      const idx = protectedBlocks.push(match) - 1;
      return marker(idx);
    }
  );

  let html = removeHtmlComments(withMarkers)
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();

  protectedBlocks.forEach((block, idx) => {
    html = html.replace(marker(idx), block);
  });

  return html;
}

function minifyJs(input) {
  let i = 0;
  const len = input.length;
  let out = "";
  let state = "normal";
  let quote = "";

  while (i < len) {
    const char = input[i];
    const next = input[i + 1] || "";

    if (state === "normal") {
      if (char === "'" || char === '"') {
        state = "string";
        quote = char;
        out += char;
        i += 1;
        continue;
      }

      if (char === "`") {
        state = "template";
        out += char;
        i += 1;
        continue;
      }

      if (char === "/" && next === "/") {
        i += 2;
        while (i < len && input[i] !== "\n") i += 1;
        out += "\n";
        continue;
      }

      if (char === "/" && next === "*") {
        i += 2;
        while (i < len && !(input[i] === "*" && input[i + 1] === "/")) i += 1;
        i += 2;
        continue;
      }

      out += char;
      i += 1;
      continue;
    }

    if (state === "string") {
      out += char;
      if (char === "\\") {
        out += next;
        i += 2;
        continue;
      }
      if (char === quote) {
        state = "normal";
      }
      i += 1;
      continue;
    }

    if (state === "template") {
      out += char;
      if (char === "\\") {
        out += next;
        i += 2;
        continue;
      }
      if (char === "`") {
        state = "normal";
      }
      i += 1;
    }
  }

  return out
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function minifyJson(input) {
  const clean = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  return JSON.stringify(JSON.parse(clean));
}

function minifyByExt(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();
  const clean = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  if (ext === ".css") return minifyCss(clean);
  if (ext === ".html") return minifyHtml(clean);
  if (ext === ".js" || ext === ".mjs") return minifyJs(clean);
  if (ext === ".json" || ext === ".webmanifest") return minifyJson(clean);

  return clean;
}

async function collectFilesFromDir(dirPath) {
  const absDir = path.join(rootDir, dirPath);
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const rel = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFilesFromDir(rel)));
      continue;
    }
    files.push(rel);
  }

  return files;
}

async function gatherInputFiles() {
  const files = [];

  for (const file of rootFiles) {
    const abs = path.join(rootDir, file);
    try {
      await fs.access(abs);
      files.push(file);
    } catch {
      // optional root file missing
    }
  }

  for (const dir of rootDirs) {
    const abs = path.join(rootDir, dir);
    try {
      await fs.access(abs);
      files.push(...(await collectFilesFromDir(dir)));
    } catch {
      // optional directory missing
    }
  }

  return [...new Set(files)];
}

async function ensureCleanDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

async function writeOutputFile(relPath, content, shouldGzip) {
  const target = path.join(outDir, relPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");

  let gzBytes = 0;
  if (shouldGzip) {
    const gz = gzipSync(Buffer.from(content, "utf8"), { level: 9 });
    gzBytes = gz.length;
    await fs.writeFile(`${target}.gz`, gz);
  }

  return { target, gzBytes };
}

async function run() {
  await ensureCleanDir(outDir);
  const inputFiles = await gatherInputFiles();
  let totalOriginal = 0;
  let totalMinified = 0;
  let totalGzip = 0;

  for (const relPath of inputFiles) {
    const sourcePath = path.join(rootDir, relPath);
    const raw = await fs.readFile(sourcePath, "utf8");
    const minified = minifyByExt(relPath, raw);
    const shouldGzip = textExtensions.has(path.extname(relPath).toLowerCase());
    const { gzBytes } = await writeOutputFile(relPath, minified, shouldGzip);

    totalOriginal += Buffer.byteLength(raw);
    totalMinified += Buffer.byteLength(minified);
    totalGzip += gzBytes;
  }

  console.log("Build complete: dist/");
  console.log(`Files: ${inputFiles.length}`);
  console.log(`Original: ${formatKb(totalOriginal)}`);
  console.log(`Minified: ${formatKb(totalMinified)}`);
  console.log(`Gzip total: ${formatKb(totalGzip)}`);
}

run().catch((error) => {
  console.error("Build failed:", error.message);
  process.exit(1);
});
