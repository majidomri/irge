import { spawn } from "node:child_process";

const BASE_URL = "http://127.0.0.1:3000";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/ping`);
      if (response.ok) return;
    } catch {
      // ignore until timeout
    }
    await wait(300);
  }
  throw new Error("Server did not become ready in time.");
}

async function fetchText(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.text();
}

async function run() {
  const server = spawn("node", ["server.js"], {
    stdio: "inherit",
    shell: true,
  });

  try {
    await waitForServer();

    const html = await fetchText("/4.html");
    if (!html.includes('type="module" src="js/app/main.js"')) {
      throw new Error("4.html is not wired to module entrypoint.");
    }

    if (!html.includes("manifest.webmanifest")) {
      throw new Error("Manifest link missing in 4.html.");
    }

    const mainJs = await fetchText("/js/app/main.js");
    if (!mainJs.includes("class InstaRishtaApp")) {
      throw new Error("main.js smoke check failed.");
    }

    const workerJs = await fetchText("/js/app/workers/filter-worker.js");
    if (!workerJs.includes("self.onmessage")) {
      throw new Error("filter worker smoke check failed.");
    }

    await fetchText("/styles/instarishta.css");
    await fetchText("/manifest.webmanifest");
    await fetchText("/service-worker.js");

    const jsonRaw = await fetchText("/jsdata.json");
    const json = JSON.parse(jsonRaw);
    if (!Array.isArray(json) || json.length === 0) {
      throw new Error("jsdata.json is empty or not an array.");
    }

    console.log("Smoke test passed.");
  } finally {
    server.kill();
  }
}

run().catch((error) => {
  console.error("Smoke test failed:", error.message);
  process.exit(1);
});
