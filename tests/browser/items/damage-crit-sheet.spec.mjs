import {
  test,
  expect,
  createDocumentViaUI,
  expectSheetRendered,
  closeDocSheet,
  uniqueName,
} from "../fixtures.mjs";

/*
 * The configurable damage-critical fields must be editable on the item sheets, not just present in the
 * datamodel. Verifies the weapon sheet renders the system.damageCrit inputs and the ammo sheet renders
 * the overrides.crit override toggle (with the value fields appearing once it is enabled).
 */

test("weapon sheet exposes the damageCrit config fields", async ({ game }) => {
  const id = await createDocumentViaUI(game, {
    documentTab: "items",
    type: "weapon",
    name: uniqueName("weapon"),
  });
  const sheetId = await expectSheetRendered(game, { collection: "items", id });

  for (const field of ["threshold", "count", "bonus"]) {
    await expect(
      game.locator(`#${sheetId} input[name="system.damageCrit.${field}"]`),
    ).toHaveCount(1);
  }

  await closeDocSheet(game, { collection: "items", id });
});

test("ammo sheet exposes the crit override control", async ({ game }) => {
  const id = await createDocumentViaUI(game, {
    documentTab: "items",
    type: "ammo",
    name: uniqueName("ammo"),
  });
  const sheetId = await expectSheetRendered(game, { collection: "items", id });

  await expect(
    game.locator(
      `#${sheetId} a.item-checkbox[data-target="system.overrides.crit.override"]`,
    ),
  ).toHaveCount(1);

  // Enabling the override reveals the threshold/count/bonus inputs.
  await game.evaluate(
    async (itemId) =>
      game.items.get(itemId).update({ "system.overrides.crit.override": true }),
    id,
  );
  for (const field of ["threshold", "count", "bonus"]) {
    await expect(
      game.locator(`#${sheetId} input[name="system.overrides.crit.${field}"]`),
    ).toHaveCount(1);
  }

  await closeDocSheet(game, { collection: "items", id });
});
