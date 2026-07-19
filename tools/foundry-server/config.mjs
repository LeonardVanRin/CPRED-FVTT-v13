import fs from "fs-extra";
import { rm } from "node:fs/promises";
import path from "path";
import crypto from "crypto";

// Where per-run state (saved GM auth, the ephemeral world id, the Foundry pid)
// lives. Collected under .playwright/ alongside the rest of the Playwright
// output; the suite reads the saved storage state from here via STORAGE_STATE.
export const RUN_DIR = path.resolve(".playwright", "auth");
const WORLD_ID_FILE = path.join(RUN_DIR, "world-id");
const PID_FILE = path.join(RUN_DIR, "foundry.pid");
export const STORAGE_STATE = path.join(RUN_DIR, "gm.json");

// A non-GM player and their assigned character, created by globalSetup so the
// shop specs can run as a real player (game.user.character set).
// PLAYER_STORAGE_STATE holds that player's authenticated session, mirroring
// STORAGE_STATE for the GM.
export const PLAYER_STORAGE_STATE = path.join(RUN_DIR, "player.json");
export const PLAYER_NAME = "E2E Player";
export const PLAYER_CHARACTER_NAME = "E2E Shopper";

// System id mirrors gulp/config.mjs SYSTEM_NAME. The built system is deployed to
// <dataPath>/Data/systems/<SYSTEM_NAME> by `gulp build`; the browser-test world selects it.
export const SYSTEM_NAME = process.env.SYSTEM_NAME || "cyberpunk-red-core";

function readLocalConfig() {
  const localConfigPath = path.resolve("foundryconfig.json");
  return fs.existsSync(localConfigPath) ? fs.readJSONSync(localConfigPath) : {};
}

/*
 * The Foundry version this system targets, read from src/system.json's
 * `compatibility.verified`. Developers keep a separate Foundry install per major
 * version; the version is used to expand the `{VERSION}` placeholder in
 * appPath/dataPath (see expandVersion). FOUNDRY_VERSION overrides it for ad-hoc
 * runs against another version.
 */
export function foundryVersion() {
  if (process.env.FOUNDRY_VERSION) return String(process.env.FOUNDRY_VERSION);
  const system = fs.readJSONSync(path.resolve("src", "system.json"));
  const verified = system?.compatibility?.verified;
  if (verified === undefined || verified === null) {
    throw new Error(
      "Could not determine the Foundry version: src/system.json has no " +
        "compatibility.verified. Set FOUNDRY_VERSION to override.",
    );
  }
  return String(verified);
}

// Default prefix prepended to the version when expanding a `{VERSION}`
// placeholder, overridable per config via `foundry.versionPrefix`.
export const DEFAULT_VERSION_PREFIX = "v";

/*
 * Expand a `{VERSION}` placeholder in a configured path so developers can place
 * the Foundry version anywhere their own directory layout needs it. `{VERSION}`
 * is replaced (everywhere it appears) by `<versionPrefix><version>` — e.g.
 * "/foundry/{VERSION}/data" -> "/foundry/v13/data", or "/foundry/13/data" when
 * versionPrefix is "". A path without the placeholder is returned unchanged, and
 * the version is only resolved when a placeholder is actually present.
 */
export function expandVersion(rawPath, { version, versionPrefix } = {}) {
  if (typeof rawPath !== "string" || !rawPath.includes("{VERSION}")) {
    return rawPath;
  }
  const prefix = versionPrefix ?? DEFAULT_VERSION_PREFIX;
  const resolved = version ?? foundryVersion();
  return rawPath.replaceAll("{VERSION}", `${prefix}${resolved}`);
}

/*
 * Resolve everything the launcher needs. Environment variables win over
 * foundryconfig.json so CI / one-off runs can override without editing the file.
 */
export function resolveConfig() {
  const local = readLocalConfig();
  const versionPrefix = local.foundry?.versionPrefix;
  const rawAppPath = process.env.FOUNDRY_APP_PATH || local.foundry?.appPath;
  const rawDataPath = process.env.FOUNDRY_DATA_PATH || local.foundry?.dataPath;
  const licenseKey =
    process.env.FOUNDRY_LICENSE_KEY || local.foundry?.licenseKey || "";
  const port = Number(process.env.FOUNDRY_TEST_PORT || 30001);

  if (!rawAppPath) {
    throw new Error(
      "Foundry application path is not set. Add 'foundry.appPath' to " +
        "foundryconfig.json or set FOUNDRY_APP_PATH.",
    );
  }
  if (!rawDataPath) {
    throw new Error(
      "Foundry data path is not set. Add 'foundry.dataPath' to foundryconfig.json " +
        "or set FOUNDRY_DATA_PATH.",
    );
  }

  const version = foundryVersion();
  const appPath = expandVersion(rawAppPath, { version, versionPrefix });
  const dataPath = expandVersion(rawDataPath, { version, versionPrefix });

  // If the dev placed `{VERSION}` in appPath themselves, it already points at the
  // versioned install. Otherwise append `<versionPrefix><version>` as the
  // per-version subdirectory (the long-standing default layout).
  const appDir = rawAppPath.includes("{VERSION}")
    ? appPath
    : path.join(
        appPath,
        `${versionPrefix ?? DEFAULT_VERSION_PREFIX}${version}`,
      );

  return {
    appPath,
    version,
    appDir,
    dataPath,
    licenseKey,
    port,
    url: `http://localhost:${port}`,
  };
}

/*
 * Locate main.js within a version's install dir. v13's NodeJS package puts it
 * under resources/app; older/other layouts keep it at the application root.
 */
export function resolveMainJs(appDir) {
  const candidates = [
    path.join(appDir, "resources", "app", "main.js"),
    path.join(appDir, "main.js"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `Could not find Foundry main.js under '${appDir}'. Looked at:\n  ` +
        candidates.join("\n  ") +
        `\n(appPath may use a {VERSION} placeholder; if it omits one, the ` +
        `<versionPrefix><version> subdir from src/system.json is appended — ` +
        `set FOUNDRY_VERSION to target a different version.)`,
    );
  }
  return found;
}

// A fresh, unique world per run avoids any collision with the user's real worlds.
export function newWorldId() {
  const id = `cyberpunk-red-${crypto.randomBytes(4).toString("hex")}`;
  fs.ensureDirSync(RUN_DIR);
  fs.writeFileSync(WORLD_ID_FILE, id, "utf8");
  return id;
}

export function readWorldId() {
  return fs.existsSync(WORLD_ID_FILE)
    ? fs.readFileSync(WORLD_ID_FILE, "utf8").trim()
    : null;
}

export function clearWorldId() {
  fs.removeSync(WORLD_ID_FILE);
}

export function worldDir(dataPath, worldId) {
  return path.join(dataPath, "Data", "worlds", worldId);
}

/*
 * Delete an ephemeral world directory. Uses fs.rm with retries because Windows
 * cannot unlink a file another process still holds open: after Foundry stops,
 * its LevelDB pack handles (e.g. the world's combats DB) can take a moment to be
 * released, so a plain delete races and throws EBUSY. The retries ride that out.
 * (POSIX unlinks open files fine, so this only bites on Windows.)
 */
export async function removeWorld(dataPath, worldId) {
  await rm(worldDir(dataPath, worldId), {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 200,
  });
}

export function writePid(pid) {
  fs.ensureDirSync(RUN_DIR);
  fs.writeFileSync(PID_FILE, String(pid), "utf8");
}

export function readPid() {
  if (!fs.existsSync(PID_FILE)) return null;
  const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
  return Number.isInteger(pid) ? pid : null;
}

export function clearPid() {
  fs.removeSync(PID_FILE);
}
