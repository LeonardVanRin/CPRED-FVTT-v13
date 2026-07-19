import {
  test,
  expect,
  expectSheetRendered,
  closeDocSheet,
  uniqueName,
} from "../fixtures.mjs";

/*
 * The item sheet's Settings tab presents an editable, repeatable list of
 * `system.sources` ({ book, page }) rows:
 *   - each row binds a book text input and a page number input to that source;
 *   - a per-row delete control removes the source from the array;
 *   - an "Add source" control appends a new blank source ({ book: "", page: 0 });
 *   - an item with an empty `sources` array shows no rows, only the Add control.
 *
 * These specs drive the sheet the way a user would — clicking the add/delete
 * controls and typing into the row inputs on the Settings tab — and treat the
 * persisted `item.system.sources` (read back via game.evaluate) as the source of
 * truth, with a DOM row-count assertion per case. The controls are
 * `input[name="system.sources.<index>.book|page"]` and `a.source-action`
 * anchors carrying `data-action-type="create"|"delete"` (delete also carries
 * `data-index`). game.evaluate is used only for setup and for reading state to
 * assert, never for the action under test.
 */

// Selectors for the editable source list on the Settings tab.
const BOOK_INPUTS = 'input[name^="system.sources."][name$=".book"]';
const ADD_SOURCE = 'a.source-action[data-action-type="create"]';

// Create a world "gear" item with the given `sources`, render its sheet, and
// return its id and rendered-sheet element id.
async function createItemWithSources(game, sources, prefix) {
  const name = uniqueName(prefix);
  const id = await game.evaluate(
    async ({ name, sources }) => {
      const item = await Item.create({
        name,
        type: "gear",
        system: { sources },
      });
      await item.sheet.render(true);
      return item.id;
    },
    { name, sources },
  );
  const sheetId = await expectSheetRendered(game, { collection: "items", id });
  return { id, sheetId };
}

// Read the persisted sources back as plain { book, page } objects for assertion.
function readSources(game, id) {
  return game.evaluate(
    (id) =>
      game.items
        .get(id)
        .system.sources.map((s) => ({ book: s.book, page: s.page })),
    id,
  );
}

// Ensure the item sheet's Settings tab is active, then return the sheet locator.
// The sheet re-renders (resetting to the Description tab) after every change, so
// this is called again before each interaction.
async function openItemSettings(page, sheetId) {
  const sheet = page.locator(`#${sheetId}`);
  const tab = sheet.locator('a.tab-label[data-tab="item-settings"]');
  await tab.click();
  await expect(tab).toHaveClass(/active/);
  return sheet;
}

// Click the "Add source" control and wait for the new blank source to persist
// onto system.sources (the sheet re-renders on the resulting update).
async function clickAddSource(page, { sheetId, itemId }) {
  const before = (await readSources(page, itemId)).length;
  const sheet = await openItemSettings(page, sheetId);
  await sheet.locator(ADD_SOURCE).click();
  await page.waitForFunction(
    ({ itemId, target }) =>
      game.items.get(itemId).system.sources.length === target,
    { itemId, target: before + 1 },
    { timeout: 10000 },
  );
}

// Fill a source row field (book/page) and wait for it to persist. The sheet
// submits on change; press Tab to blur so the change fires, then confirm the
// document actually updated (passive read).
async function setSourceField(page, { sheetId, itemId, name, path, value }) {
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

test.describe("Item sheet source list", () => {
  test("Add source appends a blank row that the row inputs then populate", async ({
    game,
  }) => {
    const { id, sheetId } = await createItemWithSources(
      game,
      [],
      "gear-src-add",
    );

    // An empty sources array shows no rows on the Settings tab, only the Add
    // control.
    const sheet = await openItemSettings(game, sheetId);
    await expect(sheet.locator(BOOK_INPUTS)).toHaveCount(0);
    await expect(sheet.locator(ADD_SOURCE)).toBeVisible();

    // Add a blank row, then fill in its book and page.
    await clickAddSource(game, { sheetId, itemId: id });
    await setSourceField(game, {
      sheetId,
      itemId: id,
      name: "system.sources.0.book",
      path: "system.sources.0.book",
      value: "TestBook",
    });
    await setSourceField(game, {
      sheetId,
      itemId: id,
      name: "system.sources.0.page",
      path: "system.sources.0.page",
      value: 42,
    });

    // Persisted state is the source of truth; plus one DOM row-count assertion.
    expect(await readSources(game, id)).toEqual([
      { book: "TestBook", page: 42 },
    ]);
    await expect(
      (await openItemSettings(game, sheetId)).locator(BOOK_INPUTS),
    ).toHaveCount(1);

    await closeDocSheet(game, { collection: "items", id });
    await game.evaluate((id) => game.items.get(id).delete(), id);
  });

  test("editing an existing row's page input updates that source", async ({
    game,
  }) => {
    const { id, sheetId } = await createItemWithSources(
      game,
      [{ book: "Core", page: 10 }],
      "gear-src-edit",
    );

    const sheet = await openItemSettings(game, sheetId);
    await expect(sheet.locator(BOOK_INPUTS)).toHaveCount(1);

    await setSourceField(game, {
      sheetId,
      itemId: id,
      name: "system.sources.0.page",
      path: "system.sources.0.page",
      value: 20,
    });

    expect((await readSources(game, id))[0]).toEqual({
      book: "Core",
      page: 20,
    });

    await closeDocSheet(game, { collection: "items", id });
    await game.evaluate((id) => game.items.get(id).delete(), id);
  });

  test("the per-row delete control removes that source from the array", async ({
    game,
  }) => {
    const { id, sheetId } = await createItemWithSources(
      game,
      [
        { book: "Core", page: 10 },
        { book: "MwtU", page: 20 },
      ],
      "gear-src-del",
    );

    const sheet = await openItemSettings(game, sheetId);
    await expect(sheet.locator(BOOK_INPUTS)).toHaveCount(2);

    // Delete the FIRST row — a confirmation dialog now guards the delete.
    await sheet
      .locator('a.source-action[data-action-type="delete"][data-index="0"]')
      .click();
    const confirmDialog = game.locator(".application.dialog");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.locator('button[data-action="yes"]').click();
    await game.waitForFunction(
      (itemId) => game.items.get(itemId).system.sources.length === 1,
      id,
      { timeout: 10000 },
    );

    // The surviving source is the second one.
    expect(await readSources(game, id)).toEqual([{ book: "MwtU", page: 20 }]);
    await expect(
      (await openItemSettings(game, sheetId)).locator(BOOK_INPUTS),
    ).toHaveCount(1);

    await closeDocSheet(game, { collection: "items", id });
    await game.evaluate((id) => game.items.get(id).delete(), id);
  });

  test("the read-only citation lists only book-having sources with no trailing comma", async ({
    game,
  }) => {
    // A filled source FOLLOWED by a blank-book source: the blank must not leak a
    // stray/trailing comma into the read-only `.item-header-sources` citation.
    const { id, sheetId } = await createItemWithSources(
      game,
      [
        { book: "FilledBook", page: 1 },
        { book: "", page: 0 },
      ],
      "gear-src-cite",
    );

    const citation = game.locator(`#${sheetId} .item-header-sources`);
    await expect(citation).toBeVisible();

    const text = (await citation.textContent()).trim();
    // Only the book-having source is cited, with its "pg." label...
    expect(text).toBe("FilledBook pg. 1");
    // ...and defensively: starts with the filled book, no trailing comma, no
    // stray/double comma from the trailing blank-book source.
    expect(text.startsWith("FilledBook")).toBe(true);
    expect(text).not.toMatch(/,\s*$/);
    expect(text).not.toMatch(/,\s*,/);

    await closeDocSheet(game, { collection: "items", id });
    await game.evaluate((id) => game.items.get(id).delete(), id);
  });
});
