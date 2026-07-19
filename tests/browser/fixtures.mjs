import { test as base, expect } from "@playwright/test";
import {
  PLAYER_STORAGE_STATE,
  PLAYER_CHARACTER_NAME,
} from "../../tools/foundry-server/config.mjs";

/*
 * Shared test infrastructure for the UI-driven browser specs.
 *
 * Exports a custom `test` whose `game` fixture yields a page that is already
 * authenticated (via the saved GM storage state), loaded into the world, and
 * reset to an empty world. Specs use it as `async ({ game }) => { ... }` and
 * drive Foundry through `game` (the page) and the helper functions below — the
 * same controls a user would click. The only page.evaluate() calls read game
 * state for assertions or perform incidental cleanup, never the action under
 * test.
 */

// Authoritative creatable types, mirroring the DataModel registration in
// src/cpr.js (CONFIG.Actor.dataModels / CONFIG.Item.dataModels).
export const ACTOR_TYPES = [
  "blackIce",
  "character",
  "container",
  "demon",
  "mook",
];

export const ITEM_TYPES = [
  "ammo",
  "armor",
  "clothing",
  "criticalInjury",
  "cyberdeck",
  "cyberware",
  "drug",
  "gear",
  "itemUpgrade",
  "netarch",
  "program",
  "role",
  "skill",
  "vehicle",
  "weapon",
];

// Which character-sheet tab each item type renders under once embedded. Derived
// from the character sheet Handlebars: the gear tab iterates
// CONFIG.cyberpunk-red-core.inventoryCategories, while skill/role/criticalInjury
// have their own panes.
export const DROP_TAB_BY_TYPE = {
  ammo: "gear",
  armor: "gear",
  clothing: "gear",
  cyberdeck: "gear",
  cyberware: "gear",
  drug: "gear",
  gear: "gear",
  itemUpgrade: "gear",
  netarch: "gear",
  program: "gear",
  vehicle: "gear",
  weapon: "gear",
  skill: "skills",
  role: "role",
  criticalInjury: "fight",
};

let nameCounter = 0;

// Unique, human-readable names so created docs never collide or stack with each
// other or with a character's default skill set.
export function uniqueName(prefix) {
  nameCounter += 1;
  return `E2E ${prefix} ${Date.now().toString(36)}-${nameCounter}`;
}

// Open /game (the saved GM storage state keeps us authenticated), wait for the
// world to be ready, and dismiss any active onboarding tours that would
// otherwise intercept clicks.
export async function gotoGame(page) {
  await page.goto("/game");
  await page.waitForFunction(() => globalThis.game?.ready === true, null, {
    timeout: 60000,
  });
  await page.evaluate(async () => {
    // Clear any in-world onboarding tours: exit them programmatically, then strip
    // any lingering overlay DOM as a backstop so it can't intercept clicks.
    for (const tour of game.tours?.contents ?? []) {
      try {
        tour.exit();
      } catch {
        /* no active tour */
      }
    }
    document
      .querySelectorAll(".tour-overlay, .tour-center-step, .tour")
      .forEach((el) => el.remove());

    // Ensure the world is unpaused once ready — a freshly launched or reloaded
    // world can come up paused, which makes many driven interactions silently
    // miss. `broadcast: true` records it server-side so it persists. Idempotent.
    if (game.paused) {
      await game.togglePause(false, { broadcast: true });
    }
  });
}

// Delete every actor and item in the world. The `game` fixture runs this per
// test so each one starts from an empty, isolated world (and the world stays
// small, so the fresh page loads quickly).
export async function resetWorld(page) {
  // Keep the shop specs' player character (created once in globalSetup) — the
  // player owns it and the shop tests need game.user.character to persist.
  await page.evaluate(async (keepActorName) => {
    const actorIds = game.actors
      .filter((a) => a.name !== keepActorName)
      .map((a) => a.id);
    if (actorIds.length) await Actor.deleteDocuments(actorIds);
    if (game.items.size) {
      await Item.deleteDocuments(game.items.map((i) => i.id));
    }
  }, PLAYER_CHARACTER_NAME);
}

// Ensure a sidebar directory tab is expanded and active, returning its
// "Create <Document>" button. Clicking the collapsed tab icon both expands the
// sidebar and activates the tab; if it is already open this is a no-op.
export async function openSidebarTab(page, tab) {
  const createButton = page.locator(`#${tab} button.create-entry`);
  if (!(await createButton.isVisible())) {
    await page.locator(`#sidebar-tabs button[data-tab="${tab}"]`).click();
  }
  await expect(createButton).toBeVisible();
  return createButton;
}

// Create an Actor or Item through the directory's create dialog and return the
// new document's id. `documentTab` is "actors" or "items".
export async function createDocumentViaUI(page, { documentTab, type, name }) {
  const createButton = await openSidebarTab(page, documentTab);
  await createButton.click();

  const dialog = page
    .locator(".application.dialog")
    .filter({ has: page.locator('select[name="type"]') });
  await expect(dialog).toBeVisible();
  await dialog.locator('select[name="type"]').selectOption(type);
  await dialog.locator('input[name="name"]').fill(name);
  await dialog.locator('button[data-action="ok"]').click();

  // Wait for the create dialog to fully close — it animates out ("minimizing"),
  // and a subsequent create call would otherwise match this still-detaching
  // dialog alongside its own, tripping Playwright's strict-mode check.
  await expect(dialog).toHaveCount(0);

  await page.waitForFunction(
    ({ documentTab, name }) => {
      const collection = documentTab === "actors" ? game.actors : game.items;
      return !!collection.getName(name);
    },
    { documentTab, name },
    { timeout: 10000 },
  );

  return page.evaluate(
    ({ documentTab, name }) => {
      const collection = documentTab === "actors" ? game.actors : game.items;
      return collection.getName(name).id;
    },
    { documentTab, name },
  );
}

// Assert the document's sheet is open and visible, returning its DOM element id.
export async function expectSheetRendered(page, { collection, id }) {
  await page.waitForFunction(
    ({ collection, id }) => {
      const doc = (collection === "actors" ? game.actors : game.items).get(id);
      return doc?.sheet?.rendered === true;
    },
    { collection, id },
    { timeout: 15000 },
  );

  const elementId = await page.evaluate(
    ({ collection, id }) => {
      const doc = (collection === "actors" ? game.actors : game.items).get(id);
      return doc.sheet.element?.id ?? null;
    },
    { collection, id },
  );

  expect(elementId).toBeTruthy();
  await expect(page.locator(`#${elementId}`)).toBeVisible();
  return elementId;
}

// Clear Foundry's transient ui.notifications before a capture. They render as
// `.notification` toasts layered above the windows, and an element screenshot
// still includes whatever overlaps the element's box — so a toast sitting over
// the top of a sheet bleeds into the shot. Flush the queue (if this build
// supports it), let any active toast auto-expire, then strip any straggler.
async function dismissNotifications(page) {
  await page.evaluate(() => {
    try {
      globalThis.ui?.notifications?.clear?.();
    } catch {
      /* older build without clear(); the wait/strip below still handle it */
    }
  });
  // Toasts auto-dismiss after a few seconds; wait for that, bounded so a
  // permanent toast can't stall the capture.
  await page
    .waitForFunction(() => !document.querySelector(".notification"), null, {
      timeout: 6000,
    })
    .catch(() => {});
  // Final guarantee for this capture: remove anything still showing. Foundry may
  // re-render it a tick later, but the screenshot is taken immediately after.
  await page.evaluate(() => {
    document
      .querySelectorAll(".notification")
      .forEach((toast) => toast.remove());
  });
}

// Save an element-scoped screenshot of a rendered sheet (just that window, not
// the page) into the test-results so CI can attach it to the MR report.
export async function captureSheet(page, sheetId, name) {
  await dismissNotifications(page);
  await page.locator(`#${sheetId}`).screenshot({
    path: `.playwright/test-results/sheets/${name}.png`,
  });
}

// Re-open an actor's sheet from the Actors directory (double-click its entry)
// and assert it renders, returning its DOM element id. This forces a fresh full
// render — the way to detect an embedded item that breaks the actor's sheet
// rendering, which an already-open sheet can mask.
export async function reopenActorSheetViaUI(page, actorId) {
  await openSidebarTab(page, "actors");
  const entry = page.locator(`#actors [data-entry-id="${actorId}"]`);
  await expect(entry).toBeVisible();
  await entry.dblclick();

  await page.waitForFunction(
    (id) => game.actors.get(id)?.sheet?.rendered === true,
    actorId,
    { timeout: 15000 },
  );
  const elementId = await page.evaluate((id) => {
    const sheet = game.actors.get(id).sheet;
    return sheet.element?.id ?? null;
  }, actorId);

  expect(elementId).toBeTruthy();
  await expect(page.locator(`#${elementId}`)).toBeVisible();
  return elementId;
}

// Close a document's sheet (cleanup, so it does not cover other windows).
// Disable submit-on-close on AppV1 sheets: this is teardown, not a form
// submission, and an ApplicationV1 sheet whose form has not finished registering
// throws from _getSubmitData if close() tries to submit it. ApplicationV2 freezes
// `options` (and has no submitOnClose), so guard the assignment.
export async function closeDocSheet(page, { collection, id }) {
  await page.evaluate(
    ({ collection, id }) => {
      const doc = (collection === "actors" ? game.actors : game.items).get(id);
      const sheet = doc?.sheet;
      if (!sheet) return undefined;
      try {
        sheet.options.submitOnClose = false;
      } catch {
        /* AppV2 options are frozen and have no submitOnClose; close() is safe */
      }
      return sheet.close();
    },
    { collection, id },
  );
}

async function waitForItemCount(page, actorId, target, timeout) {
  try {
    await page.waitForFunction(
      ({ actorId, target }) => game.actors.get(actorId).items.size >= target,
      { actorId, target },
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

// Drag an item from the Items directory onto an open character sheet. Attempts a
// real HTML5 drag first (faithful UI interaction); if the embedded copy does not
// appear, falls back to dispatching a genuine `drop` event carrying Foundry's
// drag payload onto the sheet form, which still runs the sheet's _onDrop handler
// (never the document API directly). The fallback is guarded so it cannot
// double-drop if the real drag landed.
export async function dragItemToActorSheet(page, { itemId, sheetId, actorId }) {
  await openSidebarTab(page, "items");
  const entry = page.locator(`#items [data-entry-id="${itemId}"]`);
  await expect(entry).toBeVisible();
  // ApplicationV2 document sheets render the <form> as the root element, so the
  // sheet element itself is the drop target (no nested form to query).
  const sheetEl = page.locator(`#${sheetId}`);
  await expect(sheetEl).toBeVisible();

  const before = await page.evaluate(
    (id) => game.actors.get(id).items.size,
    actorId,
  );

  // Bounded so a real HTML5 drag that never settles (Foundry's DnD simulation
  // is flaky) fails fast into the synthetic-drop fallback below, instead of
  // waiting out the whole test timeout.
  await entry.dragTo(sheetEl, { timeout: 5000 }).catch(() => {});
  // A dragTo that times out mid-drag leaves the mouse button held down, which
  // then swallows every later click; release it before continuing.
  await page.mouse.up().catch(() => {});

  if (await waitForItemCount(page, actorId, before + 1, 3000)) return;

  const uuid = await page.evaluate((id) => game.items.get(id).uuid, itemId);
  await page.evaluate(
    ({ uuid, sheetId, actorId, before }) => {
      // Re-check the count and dispatch in the same (synchronous) browser turn:
      // if the real drag already added an item, skip the synthetic drop so it
      // can never produce a duplicate.
      if (game.actors.get(actorId).items.size > before) return;
      const sheetEl = document.getElementById(sheetId);
      const data = new DataTransfer();
      data.setData("text/plain", JSON.stringify({ type: "Item", uuid }));
      sheetEl.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
        }),
      );
    },
    { uuid, sheetId, actorId, before },
  );

  if (!(await waitForItemCount(page, actorId, before + 1, 5000))) {
    throw new Error(`Item ${itemId} was not embedded on actor ${actorId}`);
  }
}

// Custom `test` exposing:
//  - `game`: a fresh, GM-authenticated page in a ready, empty world (built on
//    Playwright's per-test `page` fixture, so each test gets an isolated context).
//  - `player`: a page authenticated as the non-GM test player (with an assigned
//    character) from globalSetup, in its own context with the player's saved
//    storage state. It does NOT reset the world — that would delete the player's
//    character — so player specs use relative (before/after) assertions.
export const test = base.extend({
  game: async ({ page }, use) => {
    await gotoGame(page);
    await resetWorld(page);
    await use(page);
  },

  player: async ({ browser, baseURL }, use) => {
    const context = await browser.newContext({
      storageState: PLAYER_STORAGE_STATE,
      baseURL,
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    await gotoGame(page);
    await use(page);
    await context.close();
  },
});

export { expect };
