import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import JavaScriptObfuscator from "javascript-obfuscator";

const rootDir = process.cwd();
const preset = process.env.PROTECTED_PRESET === "local" ? "local" : "production";
const outDirName = process.env.PROTECTED_OUT_DIR || (preset === "local" ? "dist-protected-local" : "dist-protected");
const outDir = path.join(rootDir, outDirName);
const protectedDir = path.join(outDir, "protected");
const chunkDir = path.join(protectedDir, "chunks");
const buildId = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const secureRuntimeSource = "__secure_runtime__";
const presetHosts = preset === "local"
  ? ["localhost", "127.0.0.1"]
  : ["instarishta.me", "www.instarishta.me"];
const allowedHosts = [...new Set(presetHosts)];
const normalizedKeyHosts = [...new Set(allowedHosts.map(normalizeHost))];
const strictAntiDebug = preset === "production";
const buildSalt = crypto.randomBytes(16).toString("hex");
const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  disableConsoleOutput: true,
  identifierNamesGenerator: "hexadecimal",
  ignoreImports: true,
  selfDefending: true,
  rotateStringArray: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.85,
  transformObjectKeys: true,
  target: "browser",
  unicodeEscapeSequence: false,
};

function normalizeHost(host) {
  return String(host || "").trim().toLowerCase().replace(/^www\./, "");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Bytes(value) {
  return crypto.createHash("sha256").update(value).digest();
}

async function removeDir(target) {
  await fs.rm(target, { recursive: true, force: true });
}

async function fileExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolute)));
      continue;
    }
    files.push(absolute);
  }

  return files;
}

function splitCiphertext(value, size = 18000) {
  const parts = [];
  for (let index = 0; index < value.length; index += size) {
    parts.push(value.slice(index, index + size));
  }
  return parts;
}

function encryptAesGcm(buffer, keyBytes) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBytes, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
}

function wrapDataKey(dataKey, host) {
  const hostKey = sha256Bytes(normalizeHost(host) + ":" + buildSalt);
  const wrapped = encryptAesGcm(dataKey, hostKey);
  return {
    iv: wrapped.iv,
    tag: wrapped.tag,
    ciphertext: wrapped.ciphertext,
  };
}

function decryptAesGcmBuffer(payload, keyBytes) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBytes, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext;
}

function assertEncryptedDataset(encrypted, rawText) {
  for (const host of normalizedKeyHosts) {
    const hostKey = sha256Bytes(normalizeHost(host) + ":" + buildSalt);
    const dataKey = decryptAesGcmBuffer(encrypted.hostWraps[host], hostKey);
    const plaintext = decryptAesGcmBuffer(
      {
        iv: encrypted.iv,
        tag: encrypted.tag,
        ciphertext: encrypted.ciphertext,
      },
      dataKey,
    ).toString("utf8");

    if (plaintext !== rawText) {
      throw new Error("Encrypted dataset verification failed for host: " + host);
    }
  }
}

async function runStaticBuild() {
  await removeDir(outDir);
  const result = spawnSync(process.execPath, ["ci/build-static.mjs"], {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      OUT_DIR: outDirName,
    },
  });

  if (result.status !== 0) {
    throw new Error("build-static failed");
  }
}

async function encryptDataset() {
  const raw = await fs.readFile(path.join(rootDir, "jsdata.json"), "utf8");
  const dataKey = crypto.randomBytes(32);
  const dataset = encryptAesGcm(Buffer.from(raw, "utf8"), dataKey);
  const hostWraps = Object.fromEntries(
    normalizedKeyHosts.map((host) => [host, wrapDataKey(dataKey, host)]),
  );

  const encrypted = {
    iv: dataset.iv,
    tag: dataset.tag,
    ciphertext: dataset.ciphertext,
    hostWraps,
  };

  assertEncryptedDataset(encrypted, raw);
  return encrypted;
}

async function rewriteIndexHtml() {
  const indexPath = path.join(outDir, "index.html");
  let html = await fs.readFile(indexPath, "utf8");

  html = html.replace(/<link rel="modulepreload" href="js\/app\/main\.js">\s*/g, "");

  html = html.replace(
    /<script>\s*window\.INSTA_RISHTA_CONFIG = \{[\s\S]*?\(function primeDataPreload\(\) \{[\s\S]*?\}\(\)\);\s*<\/script>/,
    `<script>
      window.INSTA_RISHTA_CONFIG = {
        mode: "protected",
        debug: false,
        allowTestData: false,
        useTestData: false,
        secureMode: true,
        secureRuntimeSource: "${secureRuntimeSource}",
        allowedHosts: ${JSON.stringify(allowedHosts)},
        profileAdEndpoint: "https://instarishta-profile-relay.instarishtalead.workers.dev/api/submit-profile-ad"
      };
    </script>`,
  );

  html = html.replace(
    /<script type="module" src="js\/app\/main\.js"><\/script>/,
    '<script type="module" src="protected/bootstrap.js"></script>',
  );

  await fs.writeFile(indexPath, html, "utf8");
}

async function writeProtectedRuntime(encrypted) {
  await fs.mkdir(chunkDir, { recursive: true });
  const chunks = splitCiphertext(encrypted.ciphertext);
  const chunkImports = [];
  const chunkNames = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const name = "chunk" + index;
    const fileName = "chunk-" + (index + 1) + ".js";
    chunkImports.push(`import { chunk as ${name} } from "./chunks/${fileName}";`);
    chunkNames.push(name);
    await fs.writeFile(
      path.join(chunkDir, fileName),
      `export const chunk = "${chunks[index]}";\n`,
      "utf8",
    );
  }

  const runtimeDataSource = `${chunkImports.join("\n")}

const BUILD_SALT = "${buildSalt}";
const DATA_IV_BASE64 = "${encrypted.iv}";
const DATA_TAG_BASE64 = "${encrypted.tag}";
const CHUNK_PARTS = [${chunkNames.join(", ")}];
const HOST_WRAPS = ${JSON.stringify(encrypted.hostWraps, null, 2)};

function normalizeHost(host) {
  return String(host || "").trim().toLowerCase().replace(/^www\\./, "");
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256Bytes(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value || "")),
  );
  return digest;
}

async function sha256Text(value) {
  const digest = await sha256Bytes(value);
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

async function decryptAesGcm(payload, keyBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const ciphertext = base64ToBytes(payload.ciphertext);
  const tag = base64ToBytes(payload.tag);
  const sealed = new Uint8Array(ciphertext.length + tag.length);
  sealed.set(ciphertext);
  sealed.set(tag, ciphertext.length);
  return crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(payload.iv),
    },
    key,
    sealed,
  );
}

async function deriveHostKey(host) {
  return sha256Bytes(normalizeHost(host) + ":" + BUILD_SALT);
}

async function unwrapDataKey(host) {
  const normalized = normalizeHost(host);
  const payload = HOST_WRAPS[normalized];
  if (!payload) {
    throw new Error("host-wrap-missing:" + normalized);
  }
  const hostKey = await deriveHostKey(normalized);
  const dataKey = await decryptAesGcm(payload, hostKey);
  return dataKey;
}

export async function loadSecureData() {
  const host = normalizeHost(window.location.hostname);
  const dataKey = await unwrapDataKey(host);
  const plaintext = await decryptAesGcm(
    {
      iv: DATA_IV_BASE64,
      tag: DATA_TAG_BASE64,
      ciphertext: CHUNK_PARTS.join(""),
    },
    dataKey,
  );

  const hourBucket = Math.floor(Date.now() / 3600000);
  window.__INSTA_PROTECTED_SESSION__ = await sha256Text(
    [host, navigator.userAgent || "", String(hourBucket), BUILD_SALT].join("|"),
  );

  return JSON.parse(new TextDecoder().decode(plaintext));
}
`;

  const bootstrapSource = `const ALLOWED_HOSTS = ${JSON.stringify(allowedHosts)};
const STRICT_ANTI_DEBUG = ${strictAntiDebug ? "true" : "false"};
const MANIFEST_URL = "./integrity.json";
const EXPECTED_MANIFEST_HASH = "__INTEGRITY_HASH__";
const APP_ENTRY = "../js/app/main.js";

function normalizeHost(host) {
  return String(host || "").trim().toLowerCase().replace(/^www\\./, "");
}

function shutdown(reason) {
  document.documentElement.innerHTML = "";
  throw new Error("Protected boot halted: " + reason);
}

async function sha256Text(value) {
  const response = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value || "")),
  );
  return Array.from(new Uint8Array(response))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

function installTamperGuards() {
  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  if (!STRICT_ANTI_DEBUG) {
    return;
  }

  document.addEventListener("keydown", (event) => {
    const key = String(event.key || "").toUpperCase();
    const wantsInspect =
      key === "F12"
      || ((event.ctrlKey || event.metaKey) && event.shiftKey && ["I", "J", "C"].includes(key));

    if (!wantsInspect) return;
    event.preventDefault();
    shutdown("inspect-shortcut");
  });

  window.setInterval(() => {
    const desktopLike = Math.max(window.outerWidth, window.innerWidth) > 960;
    const widthGap = window.outerWidth - window.innerWidth;
    const heightGap = window.outerHeight - window.innerHeight;
    if (desktopLike && (widthGap > 160 || heightGap > 200)) {
      shutdown("devtools-detected");
    }
  }, 1500);
}

async function verifyIntegrity() {
  const manifestResponse = await fetch(MANIFEST_URL, { cache: "no-store" });
  if (!manifestResponse.ok) shutdown("manifest-missing");

  const manifestText = await manifestResponse.text();
  const manifestHash = await sha256Text(manifestText);
  if (manifestHash !== EXPECTED_MANIFEST_HASH) shutdown("manifest-tampered");

  const manifest = JSON.parse(manifestText);
  for (const entry of manifest.targets) {
    const assetUrl = new URL("../" + entry.path, import.meta.url);
    const assetResponse = await fetch(assetUrl, { cache: "no-store" });
    if (!assetResponse.ok) shutdown("asset-missing:" + entry.path);
    const assetText = await assetResponse.text();
    const assetHash = await sha256Text(assetText);
    if (assetHash !== entry.sha256) shutdown("asset-hash:" + entry.path);
  }
}

async function boot() {
  const host = normalizeHost(window.location.hostname);
  const allowed = ALLOWED_HOSTS.map(normalizeHost);
  if (!allowed.includes(host)) shutdown("domain-lock");

  installTamperGuards();
  await verifyIntegrity();

  const secureModule = await import("./runtime-data.js");
  window.__INSTA_SECURE_DATA__ = secureModule.loadSecureData();
  await import(APP_ENTRY);
}

boot().catch((error) => {
  console.error("Protected boot error", error);
  document.documentElement.innerHTML = "";
});
`;

  await fs.writeFile(path.join(protectedDir, "runtime-data.js"), runtimeDataSource, "utf8");
  await fs.writeFile(path.join(protectedDir, "bootstrap.js"), bootstrapSource, "utf8");

  return chunks.map((_, index) => "protected/chunks/chunk-" + (index + 1) + ".js");
}

async function patchServiceWorker(chunkAssets) {
  const swPath = path.join(outDir, "service-worker.js");
  if (!(await fileExists(swPath))) return;

  let sw = await fs.readFile(swPath, "utf8");
  sw = sw.replace(
    /const CACHE_NAME = ".*?";/,
    `const CACHE_NAME = "instarishta-protected-${preset}-${buildId}";`,
  );
  sw = sw.replace(/\s*"\.\/jsdata\.json(?:\.gz)?",\n/g, "\n");

  const extraAssets = [
    "./protected/bootstrap.js",
    "./protected/runtime-data.js",
    "./protected/integrity.json",
    ...chunkAssets.map((asset) => "./" + asset),
  ];

  sw = sw.replace(
    '"./assets/icon.svg",',
    '"./assets/icon.svg",\n  ' + extraAssets.map((asset) => JSON.stringify(asset)).join(',\n  ') + ',',
  );

  sw = sw.replace(
    /  const isData = url\.pathname\.endsWith\("\/jsdata\.json"\)\n    \|\| url\.pathname\.endsWith\("jsdata\.json"\);\n  const isScriptLike = request\.destination === "script"\n    \|\| request\.destination === "worker";\n\n  if \(isData\) \{[\s\S]*?  }\n\n  if \(isScriptLike\) \{/,
    `  const isData = url.pathname.endsWith("/jsdata.json")
    || url.pathname.endsWith("jsdata.json")
    || url.pathname.endsWith("/jsdata.json.gz")
    || url.pathname.endsWith("jsdata.json.gz");
  const isScriptLike = request.destination === "script"
    || request.destination === "worker";

  if (isData) {
    event.respondWith(Promise.resolve(new Response("", {
      status: 404,
      statusText: "Not Found",
    })));
    return;
  }

  if (isScriptLike) {`,
  );

  await fs.writeFile(swPath, sw, "utf8");
}

async function obfuscateProtectedJs() {
  const files = await collectFiles(outDir);
  const jsFiles = files
    .filter((file) => file.endsWith(".js"))
    .filter((file) => path.relative(outDir, file).replace(/\\/g, "/") !== "protected/bootstrap.js");

  for (const file of jsFiles) {
    const source = await fs.readFile(file, "utf8");
    const result = JavaScriptObfuscator.obfuscate(source, obfuscatorOptions);
    await fs.writeFile(file, result.getObfuscatedCode(), "utf8");
  }
}

async function writeIntegrityManifest() {
  const files = await collectFiles(outDir);
  const targets = [];

  for (const file of files) {
    const relative = path.relative(outDir, file).replace(/\\/g, "/");
    const isTarget =
      (relative.endsWith(".js") && relative !== "protected/bootstrap.js")
      || relative === "styles/instarishta.css";

    if (!isTarget) continue;

    const content = await fs.readFile(file, "utf8");
    targets.push({
      path: relative,
      sha256: sha256Hex(content),
    });
  }

  const manifest = {
    buildId,
    preset,
    generatedAt: new Date().toISOString(),
    targets,
  };
  const manifestText = JSON.stringify(manifest, null, 2);
  const manifestPath = path.join(protectedDir, "integrity.json");
  await fs.writeFile(manifestPath, manifestText, "utf8");
  return sha256Hex(manifestText);
}

async function finalizeBootstrap(manifestHash) {
  const bootstrapPath = path.join(protectedDir, "bootstrap.js");
  let bootstrap = await fs.readFile(bootstrapPath, "utf8");
  bootstrap = bootstrap.replace("__INTEGRITY_HASH__", manifestHash);
  const result = JavaScriptObfuscator.obfuscate(bootstrap, obfuscatorOptions);
  await fs.writeFile(bootstrapPath, result.getObfuscatedCode(), "utf8");
}

async function removePlainDataset() {
  await Promise.all([
    fs.rm(path.join(outDir, "jsdata.json"), { force: true }),
    fs.rm(path.join(outDir, "jsdata.json.gz"), { force: true }),
  ]);
}

async function stripUnusedProtectedAssets() {
  await Promise.all([
    fs.rm(path.join(outDir, "styles", "profile-admin.css"), { force: true }),
    fs.rm(path.join(outDir, "styles", "profile-admin.css.gz"), { force: true }),
    fs.rm(path.join(outDir, "js", "app", "modules", "profile-admin-controller.js"), { force: true }),
    fs.rm(path.join(outDir, "js", "app", "modules", "profile-admin-controller.js.gz"), { force: true }),
  ]);
}

async function main() {
  await runStaticBuild();
  await removePlainDataset();
  await stripUnusedProtectedAssets();
  await rewriteIndexHtml();
  const encrypted = await encryptDataset();
  const chunkAssets = await writeProtectedRuntime(encrypted);
  await patchServiceWorker(chunkAssets);
  await obfuscateProtectedJs();
  const manifestHash = await writeIntegrityManifest();
  await finalizeBootstrap(manifestHash);
  console.log(`Protected build complete: ${outDirName}/`);
  console.log("Preset:", preset);
  console.log("Allowed hosts:", allowedHosts.join(", "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

