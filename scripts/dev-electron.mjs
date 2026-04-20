// Dev orchestrator for the Electron wrapper.
//
// Spawns two long-running children:
//   1. `bun run dev`            — Nuxt dev server (lets Vite choose the port)
//   2. Electron binary          — points at dist-electron/main.cjs with NUXT_DEV_URL set
//
// When dist-electron/main.cjs changes on disk (tsdown --watch rebuilds it), the
// electron child is SIGTERMed (1.5s grace → SIGKILL) and respawned. Nuxt itself
// handles HMR for the renderer and server, so it's never restarted here.
//
// Requires tsdown --watch to also be running — typically kicked off in parallel by
// the package.json "app:dev" script.

import { spawn, spawnSync } from "node:child_process";
import { watch } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(scriptDir, "..");
const mainCjs = join(repoDir, "dist-electron", "main.cjs");
const forcedShutdownTimeoutMs = 1_500;
const restartDebounceMs = 120;
const localUrlPattern = /(https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+\/?)/i;

const require = createRequire(import.meta.url);
function resolveElectronBinary() {
  const electronPath = require("electron");
  if (typeof electronPath !== "string") {
    throw new Error("Could not resolve electron binary path");
  }
  return electronPath;
}

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function extractLocalUrl(line) {
  return stripAnsi(line).match(localUrlPattern)?.[1] ?? null;
}

function createLineForwarder(writer, onLine) {
  let pending = "";

  return (chunk) => {
    const text = chunk.toString();
    writer.write(text);
    pending += text;

    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";

    for (const line of lines) {
      onLine(line);
    }
  };
}

let shuttingDown = false;
let nuxtProcess = null;
let electronProcess = null;
let restartTimer = null;
let restartQueue = Promise.resolve();
let nuxtDevUrl = null;
let mainCjsReady = false;
const expectedExits = new WeakSet();

function startTsdown() {
  const child = spawn("bun", ["x", "tsdown", "--watch"], {
    cwd: repoDir,
    stdio: "inherit",
    env: process.env,
  });

  child.once("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[tsdown] exited unexpectedly code=${code} signal=${signal}`);
    void shutdown(1);
  });

  return child;
}

function maybeStartElectron() {
  if (shuttingDown || electronProcess !== null || !mainCjsReady || !nuxtDevUrl) {
    return;
  }

  startElectron();
}

function handleNuxtLine(line) {
  if (!stripAnsi(line).includes("Local:")) {
    return;
  }

  const nextUrl = extractLocalUrl(line);
  if (!nextUrl) {
    return;
  }

  const urlChanged = nuxtDevUrl !== nextUrl;
  nuxtDevUrl = nextUrl;

  if (urlChanged && electronProcess !== null) {
    scheduleElectronRestart();
    return;
  }

  maybeStartElectron();
}

function startNuxt() {
  const child = spawn("bun", ["run", "dev"], {
    cwd: repoDir,
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  });

  child.stdout?.on("data", createLineForwarder(process.stdout, handleNuxtLine));
  child.stderr?.on("data", createLineForwarder(process.stderr, handleNuxtLine));

  child.once("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[nuxt] exited unexpectedly code=${code} signal=${signal}`);
    void shutdown(1);
  });

  return child;
}

function startElectron() {
  if (shuttingDown || electronProcess !== null || !nuxtDevUrl) return;

  // Strip ELECTRON_RUN_AS_NODE from the child env. Our parent process may have it set
  // (Claude Code's shell, VS Code's terminal, etc. — anything that itself runs inside
  // an Electron-based tool sets this so nested `node`-ish invocations don't launch a
  // full browser process). If it leaks through to our spawn, Electron starts up in
  // plain-Node mode: `process.type` is undefined, `require("electron")` returns the
  // path string (from node_modules/electron/index.js) instead of the runtime API, and
  // main.ts throws on `app.whenReady()`.
  const childEnv = { ...process.env, NUXT_DEV_URL: nuxtDevUrl };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(resolveElectronBinary(), [mainCjs], {
    cwd: repoDir,
    stdio: "inherit",
    env: childEnv,
  });

  electronProcess = child;

  child.once("error", () => {
    if (electronProcess === child) electronProcess = null;
    if (!shuttingDown) scheduleElectronRestart();
  });

  child.once("exit", (code, signal) => {
    if (electronProcess === child) electronProcess = null;
    const abnormal = signal !== null || code !== 0;
    if (!shuttingDown && !expectedExits.has(child) && abnormal) {
      scheduleElectronRestart();
    }
  });
}

function stopElectron() {
  return new Promise((resolvePromise) => {
    const child = electronProcess;
    if (!child) {
      resolvePromise();
      return;
    }

    electronProcess = null;
    expectedExits.add(child);

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolvePromise();
    };

    child.once("exit", finish);

    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }

    setTimeout(() => {
      if (settled) return;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      finish();
    }, forcedShutdownTimeoutMs).unref();
  });
}

function scheduleElectronRestart() {
  if (shuttingDown) return;

  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    restartQueue = restartQueue
      .catch(() => undefined)
      .then(async () => {
        await stopElectron();
        if (!shuttingDown) startElectron();
      });
  }, restartDebounceMs);
}

function watchMainCjs() {
  const dir = dirname(mainCjs);
  try {
    return watch(dir, { persistent: true }, (_event, filename) => {
      if (filename === "main.cjs") scheduleElectronRestart();
    });
  } catch {
    // Directory doesn't exist yet — tsdown will create it shortly. We still
    // need to wait for the first build before launching electron.
    return null;
  }
}

async function waitForMainCjs() {
  const { existsSync } = await import("node:fs");
  while (!shuttingDown && !existsSync(mainCjs)) {
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  await stopElectron();

  for (const child of [nuxtProcess, tsdownProcess]) {
    if (!child || child.exitCode !== null) continue;
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }

  setTimeout(() => {
    spawnSync("pkill", ["-TERM", "-P", String(process.pid)], { stdio: "ignore" });
    process.exit(exitCode);
  }, 500).unref();
}

const tsdownProcess = startTsdown();
nuxtProcess = startNuxt();
await waitForMainCjs();
mainCjsReady = true;
const watcher = watchMainCjs();
if (watcher) watcher.unref?.();
maybeStartElectron();

process.once("SIGINT", () => void shutdown(130));
process.once("SIGTERM", () => void shutdown(143));
process.once("SIGHUP", () => void shutdown(129));
