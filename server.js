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
]);

app.use(cors());
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
  res.type(ext);
  res.sendFile(gzPath);
});
app.use(express.static(STATIC_ROOT));

// simple health endpoint
app.get("/ping", (req, res) => res.json({ ok: true, time: Date.now() }));

app.listen(PORT, () => {
  console.log(`Static server running: http://localhost:${PORT}`);
  console.log("Serving files from", STATIC_ROOT);
});
