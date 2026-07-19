import {
  test,
  expect,
  createDocumentViaUI,
  expectSheetRendered,
  closeDocSheet,
  dragItemToActorSheet,
  uniqueName,
} from "../fixtures.mjs";

/*
 * Regression test for issue #1181: a secondary-weapon itemUpgrade's Attack
 * Modifier must be applied to the secondary weapon's attack roll.
 *
 * An `itemUpgrade` can be configured as a "secondary weapon" (e.g. an
 * under-barrel), which then shows up as its own weapon on the owner's Fight tab.
 * Rolling that secondary weapon's attack runs `_createAttackRoll` on the
 * itemUpgrade itself. The weapon's own `system.attackmod` used to be added only
 * inside an `if (hasMixin(type, "upgradable"))` gate, and an itemUpgrade has no
 * `upgradable` mixin, so the secondary weapon's Attack Modifier was silently
 * dropped. The fix moved that into `CPRAttackUtils.collectAttackmodMods`, called
 * unconditionally, so the modifier now applies to any attackable item.
 *
 * Driven entirely through the UI, mirroring a real user: the item fields are set
 * on the item sheets, the upgrade is installed via the actor sheet's install
 * flow, and the attack is rolled from the Fight tab. The proof is read off the
 * verify-roll dialog's Total Mods breakdown (its `data-tooltip` lists every
 * applied modifier by source and value) — never via the system API. page.evaluate
 * is used only to confirm setup persisted and to read state for assertions, never
 * to perform the action under test.
 */

// Ensure the item sheet's Settings tab is active, then return the sheet locator.
// The sheet re-renders (resetting to the Description tab) after every field
// change, so this is called again before each interaction.
async function openItemSettings(page, sheetId) {
  const sheet = page.locator(`#${sheetId}`);
  const tab = sheet.locator('a.tab-label[data-tab="item-settings"]');
  await tab.click();
  await expect(tab).toHaveClass(/active/);
  return sheet;
}

// Fill a number/text field on an item sheet and wait for the value to persist.
// The item sheet submits on change; press Tab to blur so the change fires, then
// confirm the document actually updated (passive read).
async function setItemField(page, { sheetId, itemId, name, path, value }) {
  const sheet = await openItemSettings(page, sheetId);
  const input = sheet.locator(`input[name="${name}"]`);
  await expect(input).toBeVisible();
  await input.fill(String(value));
  await input.press("Tab");
  await page.waitForFunction(
    ({ itemId, path, value }) =>
      foundry.utils.getProperty(game.items.get(itemId), path) === value,
    { itemId, path, value },
    { timeout: 10000 },
  );
}

// Click one of the sheet's pseudo-checkbox toggles (`a.item-checkbox`) and wait
// for the boolean it targets to flip to the expected value.
async function toggleItemCheckbox(page, { sheetId, itemId, target, expected }) {
  const sheet = await openItemSettings(page, sheetId);
  await sheet.locator(`a.item-checkbox[data-target="${target}"]`).click();
  await page.waitForFunction(
    ({ itemId, target, expected }) =>
      foundry.utils.getProperty(game.items.get(itemId), target) === expected,
    { itemId, target, expected },
    { timeout: 10000 },
  );
}

// Activate the character sheet's right-pane Gear tab (default is "skills") and
// return the *gear content* locator, so row lookups are scoped to the visible
// gear pane (the same item id also appears in the hidden Fight pane once
// equipped). Waits until the gear content is actually shown.
async function activateGearTab(page, actorSheetId) {
  const sheet = page.locator(`#${actorSheetId}`);
  await sheet.locator('.navtabs-right a[data-tab="gear"]').click();
  const content = sheet.locator(
    '.right-content-section div.tab.gear-tab[data-tab="gear"]',
  );
  await expect(content).toHaveClass(/active/);
  return content;
}

// Locate a gear-tab item row and hover it to reveal its (hover-hidden) action
// glyphs, returning the row locator. Waits for the row to be visible first.
async function hoverGearRow(gearContent, itemId) {
  const row = gearContent.locator(`li.item[data-item-id="${itemId}"]`).first();
  await expect(row).toBeVisible();
  await row.hover();
  return row;
}

// Cycle an embedded weapon's equip state up to "equipped" (owned → carried →
// equipped) via the Gear-tab equip glyph, waiting for each transition.
async function equipWeapon(page, { actorSheetId, actorId, itemId }) {
  for (const state of ["carried", "equipped"]) {
    const gear = await activateGearTab(page, actorSheetId);
    const row = await hoverGearRow(gear, itemId);
    await row.locator("a.equip").click();
    await page.waitForFunction(
      ({ actorId, itemId, state }) =>
        game.actors.get(actorId).items.get(itemId).system.equipped === state,
      { actorId, itemId, state },
      { timeout: 10000 },
    );
  }
}

// Install an embedded itemUpgrade into a target weapon via the Gear-tab install
// glyph and the "Select Install Target" dialog, waiting for the install to land.
async function installUpgrade(
  page,
  { actorSheetId, actorId, upgradeId, targetId },
) {
  const gear = await activateGearTab(page, actorSheetId);
  const row = await hoverGearRow(gear, upgradeId);
  await row.locator('a.item-action[data-action-type="install-item"]').click();

  const dialog = page
    .locator(".application")
    .filter({ has: page.locator('input[name="selectedTarget"]') });
  await expect(dialog).toBeVisible();
  await dialog
    .locator(`input[name="selectedTarget"][value="${targetId}"]`)
    .check();
  await dialog
    .locator('button.cpr-dialog-button[data-action="confirm"]')
    .click();

  await page.waitForFunction(
    ({ actorId, upgradeId }) =>
      game.actors.get(actorId).items.get(upgradeId).system.isInstalled === true,
    { actorId, upgradeId },
    { timeout: 10000 },
  );
}

// Read the applied-modifiers breakdown (source + value list) from an open
// verify-roll dialog's Total Mods tooltip.
async function readTotalModsTooltip(dialog) {
  const totalMods = dialog.locator(".total-mods .dialog-item-input");
  await expect(totalMods).toBeVisible();
  return totalMods.getAttribute("data-tooltip");
}

// Assert the Total Mods tooltip carries a modifier entry for `source` whose
// value is `value`. The tooltip lists one entry per mod, each "<source> (<key
// label>): <+value>" and delimited by "<br/>", so splitting on "<br/>" anchors
// the value to its own modifier — a value regression can't hide behind an
// unrelated modifier that happens to share the value.
function expectModEntry(tooltip, source, value) {
  const entry = tooltip.split("<br/>").find((e) => e.includes(source));
  expect(
    entry,
    `no mod entry for "${source}" in tooltip: ${tooltip}`,
  ).toBeTruthy();
  expect(entry, `mod entry for "${source}": ${entry}`).toContain(value);
}

test.describe("Secondary-weapon upgrade attack modifier (#1181)", () => {
  test("applies a secondary-weapon itemUpgrade's Attack Modifier to its attack roll", async ({
    game,
  }) => {
    // 1. Character to own the weapon + upgrade.
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("char"),
    });
    const actorSheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    // 2. A ranged weapon (Assault Rifle) to host the secondary-weapon upgrade.
    const weaponName = uniqueName("rifle");
    const weaponId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "weapon",
      name: weaponName,
    });
    const weaponSheetId = await expectSheetRendered(game, {
      collection: "items",
      id: weaponId,
    });
    const weaponSheet = await openItemSettings(game, weaponSheetId);
    await weaponSheet
      .locator('select[name="system.weaponType"]')
      .selectOption("assaultRifle");
    await game.waitForFunction(
      (id) => game.items.get(id).system.weaponType === "assaultRifle",
      weaponId,
    );
    await toggleItemCheckbox(game, {
      sheetId: weaponSheetId,
      itemId: weaponId,
      target: "system.isRanged",
      expected: true,
    });
    await closeDocSheet(game, { collection: "items", id: weaponId });

    // 3. A weapon-type itemUpgrade configured as a secondary weapon with an
    //    Attack Modifier of +1. The secondaryWeapon checkbox reveals the
    //    attackable settings (where the attackmod input lives).
    const upgradeName = uniqueName("underbarrel");
    const upgradeId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "itemUpgrade",
      name: upgradeName,
    });
    const upgradeSheetId = await expectSheetRendered(game, {
      collection: "items",
      id: upgradeId,
    });
    // itemUpgrade.system.type defaults to "weapon"; confirm before proceeding.
    expect(
      await game.evaluate((id) => game.items.get(id).system.type, upgradeId),
    ).toBe("weapon");
    await toggleItemCheckbox(game, {
      sheetId: upgradeSheetId,
      itemId: upgradeId,
      target: "system.modifiers.secondaryWeapon.configured",
      expected: true,
    });
    await setItemField(game, {
      sheetId: upgradeSheetId,
      itemId: upgradeId,
      name: "system.attackmod",
      path: "system.attackmod",
      value: 1,
    });
    await closeDocSheet(game, { collection: "items", id: upgradeId });

    // 4. Put both on the character.
    await dragItemToActorSheet(game, {
      itemId: weaponId,
      sheetId: actorSheetId,
      actorId,
    });
    await dragItemToActorSheet(game, {
      itemId: upgradeId,
      sheetId: actorSheetId,
      actorId,
    });

    const embeddedWeaponId = await game.evaluate(
      ({ actorId, weaponName }) =>
        game.actors.get(actorId).items.find((i) => i.name === weaponName).id,
      { actorId, weaponName },
    );
    const embeddedUpgradeId = await game.evaluate(
      ({ actorId, upgradeName }) =>
        game.actors.get(actorId).items.find((i) => i.name === upgradeName).id,
      { actorId, upgradeName },
    );

    // 5. Equip the weapon and install the upgrade into it. A secondary-weapon
    //    upgrade only surfaces on the Fight tab when its host weapon is equipped.
    await equipWeapon(game, {
      actorSheetId,
      actorId,
      itemId: embeddedWeaponId,
    });
    await installUpgrade(game, {
      actorSheetId,
      actorId,
      upgradeId: embeddedUpgradeId,
      targetId: embeddedWeaponId,
    });

    // 6. Roll the SECONDARY weapon's attack from the Fight tab. The secondary
    //    weapon renders as its own weapon row keyed by the upgrade's id.
    const sheet = game.locator(`#${actorSheetId}`);
    await sheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
    const attack = sheet
      .locator(
        `.bottom-content-section a.rollable[data-roll-type="attack"][data-item-id="${embeddedUpgradeId}"]`,
      )
      .first();
    await expect(attack).toBeVisible();
    await attack.click();

    // 7. The verify-roll dialog's Total Mods breakdown must list the upgrade's
    //    +1. This is the exact modifier the #1181 fix restores.
    const dialog = game
      .locator(".application")
      .filter({ has: game.locator(".total-mods") });
    await expect(dialog).toBeVisible();
    const tooltip = await readTotalModsTooltip(dialog);
    expectModEntry(tooltip, upgradeName, "+1");

    // Cancel the roll and tidy up.
    await dialog
      .locator('button.cpr-dialog-button[data-action="cancel"]')
      .click();
    await closeDocSheet(game, { collection: "actors", id: actorId });
  });

  test("still applies a plain weapon's own Attack Modifier to its attack roll", async ({
    game,
  }) => {
    // Regression guard for the non-upgrade path: a plain weapon's own attackmod
    // must continue to appear on its attack roll.
    const actorId = await createDocumentViaUI(game, {
      documentTab: "actors",
      type: "character",
      name: uniqueName("char"),
    });
    const actorSheetId = await expectSheetRendered(game, {
      collection: "actors",
      id: actorId,
    });

    const weaponName = uniqueName("pistol");
    const weaponId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "weapon",
      name: weaponName,
    });
    const weaponSheetId = await expectSheetRendered(game, {
      collection: "items",
      id: weaponId,
    });
    const weaponSheet = await openItemSettings(game, weaponSheetId);
    await weaponSheet
      .locator('select[name="system.weaponType"]')
      .selectOption("assaultRifle");
    await game.waitForFunction(
      (id) => game.items.get(id).system.weaponType === "assaultRifle",
      weaponId,
    );
    await toggleItemCheckbox(game, {
      sheetId: weaponSheetId,
      itemId: weaponId,
      target: "system.isRanged",
      expected: true,
    });
    await setItemField(game, {
      sheetId: weaponSheetId,
      itemId: weaponId,
      name: "system.attackmod",
      path: "system.attackmod",
      value: 3,
    });
    await closeDocSheet(game, { collection: "items", id: weaponId });

    await dragItemToActorSheet(game, {
      itemId: weaponId,
      sheetId: actorSheetId,
      actorId,
    });
    const embeddedWeaponId = await game.evaluate(
      ({ actorId, weaponName }) =>
        game.actors.get(actorId).items.find((i) => i.name === weaponName).id,
      { actorId, weaponName },
    );

    await equipWeapon(game, {
      actorSheetId,
      actorId,
      itemId: embeddedWeaponId,
    });

    const sheet = game.locator(`#${actorSheetId}`);
    await sheet.locator('.navtabs-bottom a[data-tab="fight"]').click();
    const attack = sheet
      .locator(
        `.bottom-content-section a.rollable[data-roll-type="attack"][data-item-id="${embeddedWeaponId}"]`,
      )
      .first();
    await expect(attack).toBeVisible();
    await attack.click();

    const dialog = game
      .locator(".application")
      .filter({ has: game.locator(".total-mods") });
    await expect(dialog).toBeVisible();
    const tooltip = await readTotalModsTooltip(dialog);
    expectModEntry(tooltip, weaponName, "+3");

    await dialog
      .locator('button.cpr-dialog-button[data-action="cancel"]')
      .click();
    await closeDocSheet(game, { collection: "actors", id: actorId });
  });
});
