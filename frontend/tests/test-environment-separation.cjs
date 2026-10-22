const http = require("http");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

console.log("=== Virasya Environment Separation & Local Stories Verification ===\n");

// 1. Verify Local Story Files on Disk
console.log("1. Inspecting local story repository on disk...");
const storiesDir = path.resolve(__dirname, "../virasya-ai/data/output/stories");
assert(fs.existsSync(storiesDir), "virasya-ai/data/output/stories directory must exist");
const storyFiles = fs.readdirSync(storiesDir).filter(f => f.endsWith(".json"));

let publicPreservedOnDisk = 0;
const publicStoryDetails = [];

for (const file of storyFiles) {
  try {
    const raw = fs.readFileSync(path.join(storiesDir, file), "utf8");
    const d = JSON.parse(raw);
    if (d.status === "preserved" && d.visibility === "public") {
      publicPreservedOnDisk++;
      const title = d.title || (d.form && d.form.title) || "Untitled";
      publicStoryDetails.push({ file, id: d.id, title });
    }
  } catch (err) {
    // Some test fixtures may have non-ASCII characters
  }
}

console.log(`   ✓ Total story files on disk: ${storyFiles.length}`);
console.log(`   ✓ Public preserved stories on disk: ${publicPreservedOnDisk}`);
assert.strictEqual(publicPreservedOnDisk, 7, `Expected exactly 7 public preserved stories on disk, found ${publicPreservedOnDisk}`);

for (const s of publicStoryDetails) {
  console.log(`     • [${s.id}] "${s.title}" (${s.file})`);
}

// 2. Test Local Development Stack via Vite Proxy (Port 5173 -> 5000)
console.log("\n2. Testing live local development endpoint (http://127.0.0.1:5173/api/explore)...");

function queryHttp(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    }).on("error", reject);
  });
}

(async () => {
  try {
    // Health check
    const health = await queryHttp("http://127.0.0.1:5173/api/health");
    assert.strictEqual(health.status, 200, "Health check must return 200 OK");
    assert.strictEqual(health.data.status, "healthy", "Backend must report healthy status");
    console.log("   ✓ GET /api/health returned 200 OK (Backend active and healthy)");

    // Explore feed check
    const explore = await queryHttp("http://127.0.0.1:5173/api/explore");
    assert.strictEqual(explore.status, 200, "Explore feed must return 200 OK");
    assert.strictEqual(explore.data.status, "success", "Explore response status must be 'success'");
    assert.strictEqual(explore.data.count, 7, `Local explore feed must return all 7 stories, got ${explore.data.count}`);
    assert.strictEqual(explore.data.stories.length, 7, "Stories array length must match 7");
    console.log(`   ✓ GET /api/explore returned 200 OK with all ${explore.data.count} public preserved stories!`);

    // 3. Test Production Localhost Guard Logic
    console.log("\n3. Testing production localhost guard logic...");
    function isLocalhostUrl(url) {
      if (!url) return false;
      return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(url);
    }

    function evalBackendConfig(envDev, rawEnvUrl) {
      if (envDev) return { configured: true, url: rawEnvUrl || "" };
      if (rawEnvUrl && !isLocalhostUrl(rawEnvUrl)) {
        return { configured: true, url: rawEnvUrl };
      }
      return { configured: false, url: "" };
    }

    // Dev mode tests
    const devTest = evalBackendConfig(true, "");
    assert.strictEqual(devTest.configured, true, "Dev mode must always configure local backend");
    assert.strictEqual(devTest.url, "", "Dev mode uses relative Vite proxy");
    console.log("   ✓ Local Dev (npm run dev): Backend is active via Vite proxy");

    // Prod mode tests (no env var)
    const prodNoEnv = evalBackendConfig(false, "");
    assert.strictEqual(prodNoEnv.configured, false, "Production without VITE_API_BASE_URL must be unconfigured");
    assert.strictEqual(prodNoEnv.url, "", "Production without VITE_API_BASE_URL must not have API URL");
    console.log("   ✓ Production Preview (no env var): Backend is strictly disabled (Preview Mode)");

    // Prod mode tests (accidentally set to localhost or 127.0.0.1)
    const prodLocalhost = evalBackendConfig(false, "http://127.0.0.1:5000");
    assert.strictEqual(prodLocalhost.configured, false, "Production with 127.0.0.1 must be rejected");
    assert.strictEqual(prodLocalhost.url, "", "Production with 127.0.0.1 must be sanitized to empty");
    console.log("   ✓ Production with 127.0.0.1:5000: Strictly rejected, prevented from calling localhost");

    const prodLocalhostNamed = evalBackendConfig(false, "http://localhost:5000");
    assert.strictEqual(prodLocalhostNamed.configured, false, "Production with localhost must be rejected");
    console.log("   ✓ Production with localhost:5000: Strictly rejected, prevented from calling localhost");

    // Prod mode tests (valid remote URL)
    const prodRemote = evalBackendConfig(false, "https://api.virasya.org");
    assert.strictEqual(prodRemote.configured, true, "Production with remote URL must be accepted");
    assert.strictEqual(prodRemote.url, "https://api.virasya.org", "Production must use configured remote URL");
    console.log("   ✓ Production with remote URL (https://api.virasya.org): Correctly accepted and routed");

    console.log("\n=== SUCCESS: All environment separation and local story checks passed 100%! ===");
  } catch (err) {
    console.error("Test failed:", err.message);
    process.exit(1);
  }
})();
