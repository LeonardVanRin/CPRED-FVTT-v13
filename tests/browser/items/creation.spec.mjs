import {
  test,
  expect,
  ITEM_TYPES,
  createDocumentViaUI,
  expectSheetRendered,
  captureSheet,
  closeDocSheet,
  uniqueName,
} from "../fixtures.mjs";

/*
 * Create an item of each type through the Items directory UI; the test passes
 * when the item exists and its sheet renders (any error in the item's data or
 * sheet code would abort the render).
 */
test.describe("Item creation", () => {
  for (const type of ITEM_TYPES) {
    test(`creates a ${type} item and renders its sheet`, async ({ game }) => {
      const name = uniqueName(type);

      const id = await createDocumentViaUI(game, {
        documentTab: "items",
        type,
        name,
      });
      expect(id).toBeTruthy();

      const sheetId = await expectSheetRendered(game, {
        collection: "items",
        id,
      });
      await captureSheet(game, sheetId, `item-${type}`);

      await closeDocSheet(game, { collection: "items", id });
    });
  }
});
