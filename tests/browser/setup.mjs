import { chromium } from "@playwright/test";
import { startServer } from "../../tools/foundry-server/server.mjs";
import {
  driveSetup,
  joinAsGM,
  joinAsUser,
  createPlayerWithCharacter,
} from "../../tools/foundry-server/setup.mjs";
import {
  newWorldId,
  STORAGE_STATE,
  PLAYER_STORAGE_STATE,
  PLAYER_NAME,
  PLAYER_CHARACTER_NAME,
} from "../../tools/foundry-server/config.mjs";

// Disable Foundry's WebGL canvas for a session. The specs only touch sheets and
// the sidebar (never the board), so initialising PIXI/WebGL under software
// rendering is pure overhead. It's a client setting (localStorage), so saving it
// into the storage state makes every spec's browser context inherit it.
const disableCanvas = (page) =>
  page.evaluate(() => game.settings.set("core", "noCanvas", true));

/*
 * Runs once before the suite. Starts Foundry, drives whatever startup gates are
 * pending, creates + launches a fresh ephemeral world, signs in as the GM, and
 * saves the authenticated storage state for the specs to reuse. It then creates
 * a non-GM player with an assigned character (for the shop specs) and saves that
 * player's authenticated state too. The Foundry process is left running (tracked
 * by pid file) and stopped in teardown.
 */
export default async function globalSetup() {
  const { config } = await startServer({ silent: true });
  const worldId = newWorldId();

  // --no-sandbox so this launch also works on root CI runners (the test
  // browsers get the same via chromiumSandbox:false in the Playwright config).
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await driveSetup(page, { config, worldId });
    await joinAsGM(page, config);
    await disableCanvas(page);
    // Create the test player + assigned character (as GM) before saving state.
    await createPlayerWithCharacter(page, {
      userName: PLAYER_NAME,
      characterName: PLAYER_CHARACTER_NAME,
    });
    await page.context().storageState({ path: STORAGE_STATE });

    // Authenticate as that player in a fresh context and save its state too.
    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    await joinAsUser(playerPage, config, PLAYER_NAME);
    await disableCanvas(playerPage);
    await playerContext.storageState({ path: PLAYER_STORAGE_STATE });
    await playerContext.close();
  } finally {
    await browser.close();
  }
}
