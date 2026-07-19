import {
  test,
  expect,
  createDocumentViaUI,
  uniqueName,
  closeDocSheet,
} from "../fixtures.mjs";

/*
 * The Active Effect config sheet (CPRActiveEffectSheet) replaces Foundry's generic
 * "Changes" tab with CPR's modifier UI: a category select + a category-aware key
 * input, plus situational / on-by-default toggles. Drive the real UI to add a
 * modifier and assert the CPR row renders — this guards against the sheet falling
 * back to Foundry's default changes editor.
 */
test.describe("Active Effect sheet (ApplicationV2)", () => {
  test("adds a CPR modifier via the custom Changes tab", async ({ game }) => {
    const name = uniqueName("gear");
    const itemId = await createDocumentViaUI(game, {
      documentTab: "items",
      type: "gear",
      name,
    });
    expect(itemId).toBeTruthy();

    // The gear sheet opens on creation; open its Effects tab and add an effect.
    const itemSheet = game.locator(`#CPRItemSheet-Item-${itemId}`);
    await expect(itemSheet).toBeVisible();
    await itemSheet.locator('.navtabs-item [data-tab="item-effects"]').click();
    await itemSheet.locator('.effect-control[data-action="create"]').click();

    // Creating the effect opens its config (an ApplicationV2 active-effect-config).
    const aeConfig = game.locator(".application.active-effect-config");
    await expect(aeConfig).toBeVisible();

    // Switch to the CPR Changes tab and add a modifier.
    await aeConfig.locator('nav [data-tab="changes"]').click();
    await aeConfig.locator('[data-action="addMod"]').click();

    // The CPR row exposes a key-category select and a category-aware key input —
    // not Foundry's raw "Attribute Key" text field.
    const row = aeConfig.locator(".changes-list > li").first();
    await expect(row).toBeVisible();
    await expect(row.locator(".effect-key-category select")).toBeVisible();
    await expect(row.locator(".key-key, .key-input")).toHaveCount(1);

    await closeDocSheet(game, { collection: "items", id: itemId });
  });
});
