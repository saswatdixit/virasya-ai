const http = require("http");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

console.log("=== Virasya Frontend-Only Vercel Readiness Verification ===\n");

// 1. Verify static production build output
console.log("1. Inspecting production build artifacts in dist/...");
const distPath = path.resolve(__dirname, "../dist");
assert(fs.existsSync(distPath), "dist/ directory must exist after npm run build");
const indexHtml = path.join(distPath, "index.html");
assert(fs.existsSync(indexHtml), "dist/index.html must exist");
const indexContent = fs.readFileSync(indexHtml, "utf8");
assert(indexContent.includes("<title>Virasya — Preserve what matters.</title>"), "index.html must contain proper title");
console.log("   ✓ dist/index.html generated properly (" + indexContent.length + " bytes)");

// Check JS and CSS assets
const assetsDir = path.join(distPath, "assets");
assert(fs.existsSync(assetsDir), "dist/assets must exist");
const assetFiles = fs.readdirSync(assetsDir);
const jsFiles = assetFiles.filter(f => f.endsWith(".js"));
const cssFiles = assetFiles.filter(f => f.endsWith(".css"));
assert(jsFiles.length > 0, "Production JS bundle must exist");
assert(cssFiles.length > 0, "Production CSS bundle must exist");
console.log(`   ✓ Found ${jsFiles.length} JS bundle(s) and ${cssFiles.length} CSS bundle(s) in dist/assets`);

// 2. Verify public static assets needed in production
console.log("\n2. Checking public static assets...");
const geoJsonPath = path.resolve(__dirname, "../public/maps/india-states.geo.json");
assert(fs.existsSync(geoJsonPath), "india-states.geo.json must exist in public/maps");
const geoStats = fs.statSync(geoJsonPath);
console.log(`   ✓ public/maps/india-states.geo.json is present (${(geoStats.size / 1024 / 1024).toFixed(2)} MB)`);

// 3. Verify Vercel routing configuration
console.log("\n3. Inspecting vercel.json configuration...");
const vercelConfigPath = path.resolve(__dirname, "../vercel.json");
assert(fs.existsSync(vercelConfigPath), "vercel.json must exist");
const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, "utf8"));
assert(Array.isArray(vercelConfig.rewrites), "vercel.json must specify rewrites array");
const spaRewrite = vercelConfig.rewrites.find(r => r.source === "/(.*)" && r.destination === "/index.html");
assert(spaRewrite, "vercel.json must have SPA rewrite from /(.*) to /index.html");
console.log("   ✓ vercel.json contains SPA rewrite for clean direct routing and page refresh");

// 4. Verify .gitignore protects large binaries, venvs, and secrets
console.log("\n4. Checking .gitignore rules...");
const gitignorePath = path.resolve(__dirname, "../.gitignore");
const gitignore = fs.readFileSync(gitignorePath, "utf8");
const expectedRules = [
  "virasya-ai/.venv/",
  ".env",
  "data/audio/",
  "data/output/",
  "*.onnx",
  "*.safetensors",
  "dist"
];
for (const rule of expectedRules) {
  assert(gitignore.includes(rule), `.gitignore must include rule: ${rule}`);
  console.log(`   ✓ .gitignore contains: ${rule}`);
}

// 5. Test direct HTTP routing against Vite server or local dist server
console.log("\n5. Testing direct route resolution...");
const routesToTest = [
  "/",
  "/preserve-your-story",
  "/preserve-your-story/voice",
  "/preserve-your-story/review",
  "/preserve-your-story/vocabulary",
  "/preserve-your-story/punctuation",
  "/preserve-your-story/final-review",
  "/explore",
  "/login",
  "/profile",
  "/maps/india-states.geo.json"
];

function createStaticSpaServer(distDir) {
  return http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, "http://localhost");
    let pathname = parsedUrl.pathname;
    let filePath = path.join(distDir, pathname);
    
    // Check if directly points to public map file
    if (pathname.startsWith("/maps/")) {
      const publicMapPath = path.resolve(__dirname, "../public", pathname.slice(1));
      if (fs.existsSync(publicMapPath)) {
        res.writeHead(200, { "Content-Type": "application/json" });
        fs.createReadStream(publicMapPath).pipe(res);
        return;
      }
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200);
      fs.createReadStream(filePath).pipe(res);
    } else {
      // SPA fallback
      res.writeHead(200, { "Content-Type": "text/html" });
      fs.createReadStream(path.join(distDir, "index.html")).pipe(res);
    }
  });
}

function fetchRoute(port, route) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${route}`, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, length: data.length }));
    }).on("error", reject);
  });
}

(async () => {
  let server = null;
  let port = 5173;

  try {
    await fetchRoute(5173, "/");
    console.log("   (Using running dev server on port 5173)");
  } catch {
    // Start ephemeral server on random free port
    server = createStaticSpaServer(distPath);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
    console.log(`   (Using ephemeral static SPA server on port ${port})`);
  }

  try {
    for (const route of routesToTest) {
      const res = await fetchRoute(port, route);
      assert.strictEqual(res.status, 200, `Route ${route} returned status ${res.status}`);
      console.log(`   ✓ ${route.padEnd(36)} -> HTTP ${res.status} (${res.length} bytes)`);
    }

    console.log("\n=== SUCCESS: All frontend Vercel readiness checks passed! ===");
  } finally {
    if (server) {
      server.close();
    }
  }
})();
