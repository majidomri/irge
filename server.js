const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const STATIC_ROOT = process.env.STATIC_ROOT
  ? path.resolve(__dirname, process.env.STATIC_ROOT)
  : __dirname;

const GZIP_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".webmanifest",
  ".svg",
  ".txt",
  ".xml",
]);

const LONG_CACHE_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".mjs",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
]);

const SHORT_CACHE_EXTENSIONS = new Set([
  ".json",
  ".xml",
  ".txt",
]);

const NO_CACHE_EXTENSIONS = new Set([
  ".html",
  ".webmanifest",
]);

function setCacheHeaders(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath).toLowerCase();

  if (fileName === "service-worker.js" || NO_CACHE_EXTENSIONS.has(ext)) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return;
  }

  if (SHORT_CACHE_EXTENSIONS.has(ext)) {
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    return;
  }

  if (LONG_CACHE_EXTENSIONS.has(ext)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=3600");
}

app.disable("x-powered-by");
app.use(cors());

app.get("/", (req, res, next) => {
  const indexPath = path.join(STATIC_ROOT, "index.html");
  const fallbackPath = path.join(STATIC_ROOT, "4.html");
  const landingPath = fs.existsSync(indexPath) ? indexPath : fallbackPath;
  if (!fs.existsSync(landingPath)) return next();

  setCacheHeaders(res, landingPath);
  res.sendFile(landingPath);
});

app.use((req, res, next) => {
  if (req.method !== "GET") return next();

  const acceptEncoding = req.headers["accept-encoding"] || "";
  if (!acceptEncoding.includes("gzip")) return next();

  const reqPath = req.path || "/";
  const normalizedRel = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, "");
  const absolute = path.resolve(STATIC_ROOT, `.${normalizedRel}`);

  if (!absolute.startsWith(STATIC_ROOT)) return next();

  const ext = path.extname(absolute).toLowerCase();
  if (!GZIP_EXTENSIONS.has(ext)) return next();

  const gzPath = `${absolute}.gz`;
  if (!fs.existsSync(gzPath)) return next();

  res.setHeader("Content-Encoding", "gzip");
  res.setHeader("Vary", "Accept-Encoding");
  setCacheHeaders(res, absolute);
  res.type(ext);
  res.sendFile(gzPath);
});
app.use(express.static(STATIC_ROOT, {
  setHeaders: (res, filePath) => {
    setCacheHeaders(res, filePath);
  },
}));

// simple health endpoint
app.get("/ping", (req, res) => res.json({ ok: true, time: Date.now() }));

app.listen(PORT, () => {
  console.log(`Static server running: http://localhost:${PORT}`);
  console.log("Serving files from", STATIC_ROOT);
});
