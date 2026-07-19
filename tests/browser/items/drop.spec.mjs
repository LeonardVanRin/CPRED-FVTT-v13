import {
  test,
  expect,
  ITEM_TYPES,
  DROP_TAB_BY_TYPE,
  createDocumentViaUI,
  expectSheetRendered,
  reopenActorSheetViaUI,
  closeDocSheet,
  dragItemToActorSheet,
  uniqueName,
} from "../fixtures.mjs";

/*
 * Drag an item of each type from the Items directory onto a character sheet,
 * then CLOSE and RE-OPEN the character sheet. The re-open forces a fresh full
 * render of the actor, which is how a dropped item that breaks the sheet —
 * whether from bad item data or a code logic error — is detected; an
 * already-open sheet can mask it. The test passes only when, after re-opening,
 * the sheet renders AND the item is present both in the actor's data and
 * visually in its section.
 *
 * Each test runs against a fresh, reset world (the `game` fixture), so a break
 * is attributable to the one item type under test.
 */
test.describe("Item drop onto character sheet", () => {
  for (const type of ITEM_TYPES) {
    test(`drops a ${type} item onto a character and the sheet still renders`, async ({
      game,
    }) => {
      // Character to receive the drop.
      const actorId = await createDocumentViaUI(game, {
        documentTab: "actors",
        type: "character",
        name: uniqueName("char"),
      });
      const sheetId = await expectSheetRendered(game, {
        collection: "actors",
        id: actorId,
      });

      // Item to drop; close its sheet so it does not cover the drop target.
      const itemName = uniqueName(type);
      const itemId = await createDocumentViaUI(game, {
        documentTab: "items",
        type,
        name: itemName,
      });
      await closeDocSheet(game, { collection: "items", id: itemId });

      await dragItemToActorSheet(game, { itemId, sheetId, actorId });

      // Loaded in the actor's data.
      const embeddedId = await game.evaluate(
        ({ actorId, itemName }) =>
          game.actors.get(actorId).items.find((i) => i.name === itemName)?.id ??
          null,
        { actorId, itemName },
      );
      expect(embeddedId, "item should be embedded on the actor").toBeTruthy();

      // The actual failure mode: close and re-open the sheet so the actor
      // re-renders from scratch with the new item. If the item broke rendering
      // (bad data or a code error), the re-open throws and the sheet never
      // reaches rendered === true, failing here.
      await closeDocSheet(game, { collection: "actors", id: actorId });
      const reopenedSheetId = await reopenActorSheetViaUI(game, actorId);

      // Visually rendered in its section of the re-opened sheet. A single
      // embedded item renders its id on several nodes (e.g. a role's header and
      // sub-rows, or an item's name link plus hover-revealed edit/delete
      // controls), so assert that at least one node bearing that id is visible.
      const tab = DROP_TAB_BY_TYPE[type];
      await game.locator(`#${reopenedSheetId} a[data-tab="${tab}"]`).click();
      await expect(
        game
          .locator(`#${reopenedSheetId} [data-item-id="${embeddedId}"]:visible`)
          .first(),
      ).toBeVisible();
    });
  }
});
