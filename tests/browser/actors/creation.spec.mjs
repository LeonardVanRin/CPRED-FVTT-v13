import {
  test,
  expect,
  ACTOR_TYPES,
  createDocumentViaUI,
  expectSheetRendered,
  captureSheet,
  closeDocSheet,
  uniqueName,
} from "../fixtures.mjs";

/*
 * Create an actor of each type through the Actors directory UI; the test passes
 * when the actor exists and its sheet renders (any error on the actor or its
 * embedded items would abort the render).
 */
test.describe("Actor creation", () => {
  for (const type of ACTOR_TYPES) {
    test(`creates a ${type} actor and renders its sheet`, async ({ game }) => {
      const name = uniqueName(type);

      const id = await createDocumentViaUI(game, {
        documentTab: "actors",
        type,
        name,
      });
      expect(id).toBeTruthy();

      const sheetId = await expectSheetRendered(game, {
        collection: "actors",
        id,
      });
      await captureSheet(game, sheetId, `actor-${type}`);

      await closeDocSheet(game, { collection: "actors", id });
    });
  }
});
