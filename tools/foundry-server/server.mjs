import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import net from "net";
import {
  resolveConfig,
  resolveMainJs,
  writePid,
  readPid,
  clearPid,
  RUN_DIR,
} from "./config.mjs";

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/*
 * Poll until Foundry answers HTTP (any status — it may redirect to /license or
 * /setup) or we time out.
 */
async function waitForReady(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { redirect: "manual" });
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`Foundry did not become reachable at ${url} within ${timeoutMs}ms`);
}

/*
 * Spawn Foundry pointed at the configured data dir. Starts at the setup/license
 * screen (NOT --world, which cannot pass the license/EULA gate anyway). Records
 * the pid so teardown can stop it from a separate process invocation.
 *
 * The DB lock — not the HTTP port — is the real exclusivity constraint: a dev
 * instance on the same dataPath holds exclusive LevelDB locks. We fail fast on a
 * busy port to surface that early with a clear message.
 */
export async function startServer({ silent = false } = {}) {
  const config = resolveConfig();

  if (await portInUse(config.port)) {
    throw new Error(
      `Port ${config.port} is already in use. A Foundry instance may already be ` +
        `running on this dataPath — stop it first (the LevelDB lock is exclusive, ` +
        `so the browser tests and a dev instance cannot share a data dir). Override the port with ` +
        `FOUNDRY_TEST_PORT if you intend to run a second, separate data dir.`,
    );
  }

  const mainJs = resolveMainJs(config.appDir);
  // When silent (the Playwright suite), keep Foundry's chatty server log out of
  // the test reporter's stream — but capture it to a file so failures are still
  // debuggable — instead of inheriting the parent's stdio.
  let stdio = "inherit";
  if (silent) {
    fs.mkdirSync(RUN_DIR, { recursive: true });
    const logFd = fs.openSync(path.join(RUN_DIR, "foundry.log"), "a");
    stdio = ["ignore", logFd, logFd];
  }
  const child = spawn(
    "node",
    [mainJs, `--dataPath=${config.dataPath}`, `--port=${config.port}`, "--noupnp"],
    { stdio },
  );
  writePid(child.pid);

  await waitForReady(config.url);
  return { child, config };
}

/*
 * Clean, awaited shutdown so LevelDB locks release before we return — only then
 * is it safe to delete the world or run pack-touching gulp tasks. SIGKILL is a
 * last resort. Accepts a child handle (same process) or falls back to the pid
 * file (separate process, e.g. globalTeardown).
 */
export async function stopServer(child, { timeoutMs = 15000 } = {}) {
  const pid = child?.pid ?? readPid();
  if (!pid || !processAlive(pid)) {
    clearPid();
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    clearPid();
    return;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processAlive(pid)) {
      clearPid();
      return;
    }
    await sleep(250);
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already gone */
  }
  // Give the OS a beat to release file locks before callers touch the DB.
  await sleep(500);
  clearPid();
}
