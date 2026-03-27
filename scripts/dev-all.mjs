import fs from "node:fs";
import path from "node:path";
<<<<<<< Updated upstream
import { spawn } from "node:child_process";
=======
import { execSync, spawn } from "node:child_process";

// ── Constants ────────────────────────────────────────────────────

const DEFAULT_API_PORT = 8787;
const DEFAULT_CONSOLE_PORT = 5173;
const DEFAULT_DISCORD_ADAPTER_PORT = 8790;
const DEFAULT_SYMPHONY_PORT = 8800;
const GATEWAY_READY_TIMEOUT_MS = 30_000;
const GATEWAY_POLL_MS = 300;
const TAG_PAD = 14;

// ── TOML scanning ────────────────────────────────────────────────
// Intentionally minimal to avoid runtime dependencies in dev scripts.
>>>>>>> Stashed changes

function readFileMaybe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function parseBoolLike(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
  if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  return null;
}

/**
 * Minimal TOML scanner for: [adapters.discord] enabled = true|false
 * This is intentionally tiny to avoid introducing a runtime dependency in dev scripts.
 */
function scanDiscordEnabled(tomlText) {
  let section = "";
  for (const raw of String(tomlText ?? "").split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;

    // strip inline comments (best-effort; good enough for our simple keys)
    const hash = line.indexOf("#");
    if (hash >= 0) line = line.slice(0, hash).trim();
    if (!line) continue;

    const mSec = line.match(/^\[(.+?)\]\s*$/);
    if (mSec) {
      section = mSec[1].trim();
      continue;
    }

    if (section !== "adapters.discord") continue;

    const m = line.match(/^enabled\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    return parseBoolLike(m[1]);
  }
  return null;
}

function detectDiscordEnabled(rootDir) {
  const local = readFileMaybe(path.join(rootDir, "eclia.config.local.toml"));
  const base = readFileMaybe(path.join(rootDir, "eclia.config.toml"));

  const localVal = scanDiscordEnabled(local);
  const baseVal = scanDiscordEnabled(base);

  return (localVal ?? baseVal ?? false) === true;
}

 function pnpmCmd() {  return "pnpm"; }

function wirePrefix(stream, out, prefix) {
  let buf = "";
  stream.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    while (true) {
      const idx = buf.indexOf("\n");
      if (idx < 0) break;
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      out.write(`${prefix} ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buf.trim().length) out.write(`${prefix} ${buf}\n`);
    buf = "";
  });
}

<<<<<<< Updated upstream
function spawnDev(tag, args) {
  const child = spawn(pnpmCmd(), args, {
    cwd: process.cwd(),
=======
function spawnService(tag, args, opts = {}) {
  const critical = opts.critical !== false;
  const child = spawn("pnpm", args, {
    cwd: rootDir,
>>>>>>> Stashed changes
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    windowsHide: true
  });

  const prefix = `[${tag}]`;
  if (child.stdout) wirePrefix(child.stdout, process.stdout, prefix);
  if (child.stderr) wirePrefix(child.stderr, process.stderr, prefix);

<<<<<<< Updated upstream
  return child;
}

const rootDir = process.cwd();
const discordEnabled = detectDiscordEnabled(rootDir);
=======
  children.push(child);
  child.on("error", (err) => {
    if (shuttingDown) return;
    console.error(`[DEV] ${tag} spawn failed: ${String(err?.message ?? err)}`);
    if (critical) shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[DEV] ${tag} exited (code=${code} signal=${signal})`);
    if (critical) shutdown(typeof code === "number" ? code : 1);
  });

  return child;
}

// ── Gateway readiness ────────────────────────────────────────────

async function probeHealth(url, timeoutMs = 1_500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    return resp.ok;
  } catch { return false; }
  finally { clearTimeout(timer); }
}

async function waitForExistingService(url, timeoutMs = 8_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probeHealth(url)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function waitForGateway(apiChild, healthUrl) {
  const start = Date.now();
  while (Date.now() - start < GATEWAY_READY_TIMEOUT_MS) {
    if (shuttingDown) return;
    if (apiChild.exitCode !== null || apiChild.killed) {
      throw new Error("gateway exited before becoming ready");
    }
    if (await probeHealth(healthUrl)) return;
    await new Promise((r) => setTimeout(r, GATEWAY_POLL_MS));
  }
  throw new Error(`gateway health timed out after ${GATEWAY_READY_TIMEOUT_MS}ms (${healthUrl})`);
}

// ── Main ─────────────────────────────────────────────────────────

const rootDir = process.cwd();
const apiPort = detectPort(rootDir, "api", DEFAULT_API_PORT);
const healthUrl = `http://127.0.0.1:${apiPort}/api/health`;
const consolePort = detectPort(rootDir, "console", DEFAULT_CONSOLE_PORT);
const webUrl = `http://127.0.0.1:${consolePort}/`;
const symphonyPort = detectPort(rootDir, "symphony", DEFAULT_SYMPHONY_PORT);
const symphonyHealthUrl = `http://127.0.0.1:${symphonyPort}/health`;
const discordHealthUrl = `http://127.0.0.1:${DEFAULT_DISCORD_ADAPTER_PORT}/health`;
>>>>>>> Stashed changes

console.log(`[DEV] root: ${rootDir}`);
console.log(`[DEV] discord adapter: ${discordEnabled ? "enabled" : "disabled"}`);

<<<<<<< Updated upstream
const children = [];
children.push(spawnDev("WEB", ["-C", "apps/web-console", "dev"]));
children.push(spawnDev("API", ["-C", "apps/gateway", "dev"]));
if (discordEnabled) {
  children.push(spawnDev("DISCORD", ["-C", "apps/adapter/discord", "dev"]));
=======
async function main() {
  console.log(`[DEV] root: ${rootDir}`);
  console.log(`[DEV] api port: ${apiPort}`);
  for (const [name, on] of Object.entries(services)) {
    console.log(`[DEV] ${name}: ${on ? "enabled" : "disabled"}`);
  }

  // 1. Pre-build shared packages (must complete before any service imports them).
  console.log("[DEV] building shared packages...");
  execSync("pnpm build:shared", { cwd: rootDir, stdio: "inherit" });

  // 2. Start or reuse gateway.
  if (await probeHealth(healthUrl)) {
    console.log(`[DEV] gateway already healthy; reusing existing process`);
  } else {
    const apiChild = spawnService("API", ["-C", "apps/gateway", "dev"]);
    console.log(`[DEV] waiting for gateway...`);
    await waitForGateway(apiChild, healthUrl);
    if (shuttingDown) return;
  }

  // 3. Start remaining services.
  console.log("[DEV] gateway ready; launching services");

  if (services.memory)   spawnService("MEMORY",   ["-C", "apps/memory", "dev"], { critical: false });
  if (services.symphony) {
    if (await waitForExistingService(symphonyHealthUrl)) {
      console.log(`[DEV] symphony already healthy; reusing existing process`);
    } else {
      spawnService("SYMPHONY", ["-C", "apps/symphony", "dev"], { critical: false });
    }
  }
  if (await waitForExistingService(webUrl)) {
    console.log(`[DEV] web already healthy; reusing existing process`);
  } else {
    spawnService("WEB", ["-C", "apps/web-console", "dev"]);
  }
  if (services.discord) {
    if (await waitForExistingService(discordHealthUrl)) {
      console.log(`[DEV] discord already healthy; reusing existing process`);
    } else {
      spawnService("DISCORD", ["-C", "apps/adapter/discord", "dev"], { critical: false });
    }
  }
  if (services.telegram) spawnService("TELEGRAM", ["-C", "apps/adapter/telegram", "dev"], { critical: false });
>>>>>>> Stashed changes
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill();
    } catch {
      // ignore
    }
  }
  // Allow stdio flush.
  setTimeout(() => process.exit(code), 50);
}

for (const c of children) {
  c.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const exitCode = typeof code === "number" ? code : signal ? 1 : 0;
    shutdown(exitCode);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
