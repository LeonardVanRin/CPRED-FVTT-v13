import { chromium } from "@playwright/test";
import { startServer, stopServer } from "./server.mjs";
import { driveSetup, joinAsGM } from "./setup.mjs";
import {
  newWorldId,
  readWorldId,
  clearWorldId,
  removeWorld,
} from "./config.mjs";

/*
 * `npm run browser:serve` — brings Foundry up with a fresh ephemeral world launched
 * and ready, then stays in the foreground so it can be driven live (e.g. via the
 * Playwright MCP at the printed URL). Ctrl-C stops Foundry cleanly and removes
 * the ephemeral world, mirroring teardown.
 */
const { child, config } = await startServer();
const worldId = newWorldId();

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await driveSetup(page, { config, worldId });
  // Join once as GM so the world is brought to "ready" and unpaused before we
  // hand off — pause is server-side session state, so it stays unpaused for the
  // live driver (e.g. the Playwright MCP) that connects next.
  await joinAsGM(page, config);
} finally {
  await browser.close();
}

/* eslint-disable no-console */
console.log(`\nFoundry is up at ${config.url} (world: ${worldId}).`);
console.log(
  "Drive it live (e.g. via the Playwright MCP). Press Ctrl-C to stop.\n",
);
/* eslint-enable no-console */

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await stopServer(child);
  const id = readWorldId();
  if (id) {
    await removeWorld(config.dataPath, id);
    clearWorldId();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
