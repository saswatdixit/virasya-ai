import { spawn, execSync } from "child_process";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// ANSI color helpers
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

function logDev(msg, color = colors.green) {
  console.log(`${color}${colors.bright}[dev]${colors.reset} ${msg}`);
}

function logError(msg) {
  console.error(`${colors.red}${colors.bright}[dev-error]${colors.reset} ${msg}`);
}

// 1. Locate Python executable in virasya-ai virtual environment
function getPythonPath() {
  const isWin = process.platform === "win32";
  const venvPythonWin = path.join(ROOT_DIR, "virasya-ai", ".venv", "Scripts", "python.exe");
  const venvPythonUnix = path.join(ROOT_DIR, "virasya-ai", ".venv", "bin", "python");

  if (fs.existsSync(venvPythonWin)) return venvPythonWin;
  if (fs.existsSync(venvPythonUnix)) return venvPythonUnix;

  // Fallback to system python
  logDev("Virtual environment python not found at virasya-ai/.venv, falling back to system 'python'", colors.yellow);
  return isWin ? "python.exe" : "python3";
}

// 2. Kill process tree cleanly across platforms
function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGTERM");
    }
  } catch {
    // Process already gone
  }
}

// 3. Check if a port is responding to HTTP
function checkHttpHealth(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    try {
      const req = http.get(url, { timeout: timeoutMs }, (res) => {
        res.resume(); // Drain stream to immediately free socket
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        try {
          req.destroy();
        } catch {}
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

// 4. Safely inspect and terminate only orphaned Virasya processes (python/node) on given port
function checkAndCleanPort(port) {
  if (process.platform !== "win32") return;
  try {
    const out = execSync("netstat -ano", { encoding: "utf8" });
    const lines = out.split("\n");
    for (const line of lines) {
      if (line.includes(`:${port}`) && line.includes("LISTENING")) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== "0" && pid !== String(process.pid)) {
          // Identify the process image name
          let procName = "unknown";
          try {
            const taskOut = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: "utf8" });
            const match = taskOut.match(/"([^"]+)"/);
            if (match) procName = match[1].toLowerCase();
          } catch {}

          const isVirasyaProcess = procName === "python.exe" || procName === "node.exe";

          if (isVirasyaProcess) {
            try {
              execSync(`taskkill /pid ${pid} /F`, { stdio: "ignore" });
              logDev(`Terminated stale Virasya ${procName} process on port ${port} (PID ${pid})`, colors.yellow);
            } catch {}
          } else {
            logError(
              `Port ${port} is occupied by unrelated process '${procName}' (PID ${pid}). ` +
              `Dev runner will not terminate unrelated software. Please free port ${port} and try again.`
            );
            throw new Error(`Port ${port} is occupied by unrelated process '${procName}' (PID ${pid}).`);
          }
        }
      }
    }
  } catch (err) {
    if (err.message.includes("occupied by unrelated process")) {
      throw err;
    }
    // Ignore harmless netstat syntax errors
  }
}

// Global process/server references
let flaskProc = null;
let viteServer = null;
let isShuttingDown = false;

let keepAliveTimer = null;

async function shutdown(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
  console.log("\n");
  logDev("Shutting down Virasya development services...", colors.yellow);

  if (viteServer) {
    try {
      await viteServer.close();
    } catch {}
    viteServer = null;
  }

  if (flaskProc) {
    killTree(flaskProc.pid);
    flaskProc = null;
  }

  logDev("All services stopped.", colors.gray);
  process.exit(exitCode);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("uncaughtException", (err) => {
  logError(`Uncaught exception in dev runner: ${err?.message || err}`);
});
process.on("unhandledRejection", (reason) => {
  logError(`Unhandled promise rejection: ${reason}`);
});

async function main() {
  console.log(`\n${colors.bright}${colors.cyan}══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}   Virasya — Preserving Oral Histories & Heritage${colors.reset}`);
  console.log(`${colors.cyan}══════════════════════════════════════════════════════════════${colors.reset}\n`);

  const pythonBin = getPythonPath();
  const flaskAppPath = path.join(ROOT_DIR, "virasya-ai", "src", "virasya_ai", "workbench", "app.py");

  // Clean stale listeners on port 5000 and start managed Flask process
  checkAndCleanPort(5000);

  logDev(`Starting Flask backend: ${pythonBin} ${flaskAppPath}`, colors.cyan);
  flaskProc = spawn(pythonBin, [flaskAppPath], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  flaskProc.on("error", (err) => {
    logError(`Failed to spawn Flask backend: ${err.message}`);
  });

  flaskProc.stdout.on("data", (data) => {
    const lines = data.toString("utf8").split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      console.log(`${colors.cyan}[flask]${colors.reset} ${line}`);
    }
  });

  let startupErrors = [];
  flaskProc.stderr.on("data", (data) => {
    const text = data.toString("utf8");
    startupErrors.push(text);
    const lines = text.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      console.error(`${colors.cyan}[flask]${colors.reset} ${line}`);
    }
  });

  flaskProc.on("exit", (code, signal) => {
    if (!isShuttingDown) {
      logError(`Flask backend process exited unexpectedly with code ${code ?? signal}`);
      if (startupErrors.length > 0) {
        console.error(`${colors.red}Startup error trace:\n${startupErrors.join("")}${colors.reset}`);
      }
      shutdown(1);
    }
  });

  // Clean up any stale listener on port 5173 and start Vite server via programmatic API
  checkAndCleanPort(5173);
  logDev("Starting Vite frontend server...", colors.magenta);

  try {
    viteServer = await createServer({
      root: ROOT_DIR,
      configFile: path.join(ROOT_DIR, "vite.config.ts"),
      server: {
        host: "127.0.0.1",
        port: 5173,
      },
    });

    if (viteServer.httpServer) {
      viteServer.httpServer.on("error", (err) => {
        logError(`Vite HTTP server error: ${err.message}`);
      });
    }

    await viteServer.listen();
    viteServer.printUrls();
  } catch (viteErr) {
    logError(`Failed to start Vite server: ${viteErr.message}`);
    await shutdown(1);
    return;
  }

  // Poll backend health until ready
  logDev("Waiting for backend services to report healthy...", colors.yellow);
  let backendReady = false;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 600));
    const healthy = await checkHttpHealth("http://127.0.0.1:5000/api/health");
    if (healthy) {
      backendReady = true;
      break;
    }
  }

  if (backendReady) {
    console.log(`\n${colors.bright}${colors.green}✔ All Virasya services active and healthy!${colors.reset}`);
    console.log(`  ${colors.bright}• Frontend:${colors.reset} http://127.0.0.1:5173/`);
    console.log(`  ${colors.bright}• Backend:${colors.reset}  http://127.0.0.1:5000/api/health (Port 5000)\n`);
  } else {
    logDev("Flask backend is taking longer than usual to initialize. Model warm-up may be in progress.", colors.yellow);
  }

  // Periodic keepalive and background health monitor
  keepAliveTimer = setInterval(async () => {
    if (!isShuttingDown) {
      const healthy = await checkHttpHealth("http://127.0.0.1:5000/api/health", 2500);
      if (!healthy) {
        logDev("Backend health ping missed. ASR service may be busy or reloading.", colors.yellow);
      }
    }
  }, 30000);
}

main().catch(async (err) => {
  logError(`Fatal runner error: ${err.message}`);
  await shutdown(1);
});
