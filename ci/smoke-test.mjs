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

    const html = await fetchText("/");
    if (!html.includes('type="module" src="js/app/main.js"')) {
      throw new Error("index route is not wired to module entrypoint.");
    }

    if (!html.includes("manifest.webmanifest")) {
      throw new Error("Manifest link missing on index route.");
    }
    if (!html.includes("trustHighlights")) {
      throw new Error("Trust highlights section missing on index route.");
    }
    if (!html.includes("contactFlowModal")) {
      throw new Error("Contact flow modal missing on index route.");
    }
    if (!html.includes("seoFaqTitle")) {
      throw new Error("FAQ section missing on index route.");
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
    await fetchText("/styles/profile-admin.css");
    await fetchText("/manifest.webmanifest");
    await fetchText("/service-worker.js");
    await fetchText("/llms.txt");
    await fetchText("/robots.txt");
    await fetchText("/sitemap.xml");
    const adminHtml = await fetchText("/profile-admin.html");
    if (!adminHtml.includes("profile-admin-controller.js")) {
      throw new Error("profile-admin.html is not wired to its controller.");
    }

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
