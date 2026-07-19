import { test, expect, openSidebarTab, uniqueName } from "../fixtures.mjs";

/*
 * UI-driven tests for the document browser's source handling — the citation line
 * shown on each result row and the "Source Book" tristate filter's any-match
 * semantics. Items now carry `system.sources` (an array of {book,page}); a row's
 * citation comma-joins ALL of them, and the book filter treats an item as
 * belonging to a book if ANY of its sources cites it (not just the first).
 *
 * Each test runs against a fresh, reset world (the `game` fixture, GM-authed) and
 * drives the browser the way a user would. Items are created programmatically
 * with unique names and known `sources` arrays so a name search isolates them
 * from the (many) compendium entries the browser also indexes, and the assertions
 * only read visible result rows — never the action under test. Cleanup deletes
 * every world item after each test.
 */

// Launch the browser in Item mode and wait for results to start rendering.
async function openItemBrowser(page) {
  await openSidebarTab(page, "items");
  const launch = page.locator('#items .cpr-browser-launch[data-mode="item"]');
  await expect(launch).toBeVisible();
  await launch.click();

  const browser = page.locator("#cpr-document-browser");
  await expect(browser).toBeVisible();
  await expect(browser.locator(".cpr-browser-results-list")).toBeVisible();
  await expect(
    browser.locator(".cpr-browser-entry, .cpr-browser-empty").first(),
  ).toBeVisible();
  return browser;
}

// Create a world gear item with a known name and `sources` array; return its id.
function createGear(page, name, sources) {
  return page.evaluate(
    async ({ name, sources }) => {
      const doc = await Item.create({
        name,
        type: "gear",
        system: { sources },
      });
      return doc.id;
    },
    { name, sources },
  );
}

// The result row whose name matches exactly one of our unique item names.
function rowByName(page, browser, name) {
  return browser.locator(".cpr-browser-entry").filter({
    has: page.locator(".item-header-name", { hasText: name }),
  });
}

// The "Source Book" filter fieldset and one of its book options (located by the
// book's label text so the test does not depend on how the value is encoded).
function bookFilter(browser) {
  return browser.locator('.cpr-browser-filter-tristate[data-filter-id="book"]');
}
function bookOption(browser, book) {
  return bookFilter(browser)
    .locator(".cpr-browser-tristate-row")
    .filter({ hasText: book })
    .locator(".cpr-browser-tristate");
}

// The book filter fieldset may render collapsed; expand it so its options can be
// clicked. Idempotent — only expands when currently collapsed.
async function expandBookFilter(browser) {
  const fs = bookFilter(browser);
  await expect(fs).toBeVisible();
  if (
    await fs.evaluate((el) => el.classList.contains("cpr-browser-collapsed"))
  ) {
    await fs.locator("legend").click();
  }
  await expect(bookOption(browser, "").first()).toBeVisible();
}

// Click a tristate span until it reports the wanted state. The control cycles
// through its states on repeated clicks, so a bounded loop reaches any of them.
async function cycleTo(locator, target) {
  for (let i = 0; i < 4; i += 1) {
    if ((await locator.getAttribute("data-state")) === target) return;
    await locator.click();
  }
  await expect(locator).toHaveAttribute("data-state", target);
}

test.describe("Document browser — sources", () => {
  test.afterEach(async ({ game }) => {
    await game.evaluate(() => {
      if (game.items.size) {
        return Item.deleteDocuments(game.items.map((i) => i.id));
      }
      return undefined;
    });
  });

  test("a row's citation joins ALL its sources, and empty sources render blank", async ({
    game,
  }) => {
    const token = uniqueName("cite");
    const nameB = `${token} bravo`;
    const nameEmpty = `${token} empty`;
    // bravo cites two books (page > 0); the empty item has no sources at all.
    await createGear(game, nameB, [
      { book: "BBBBook", page: 5 },
      { book: "AAABook", page: 99 },
    ]);
    await createGear(game, nameEmpty, []);

    const browser = await openItemBrowser(game);
    await browser.locator(".cpr-browser-name-input").fill(token);
    await expect(browser.locator(".cpr-browser-entry")).toHaveCount(2);

    // bravo's citation shows both sources, comma-joined, each as "BOOK pg. PAGE".
    const bravoSource = rowByName(game, browser, nameB).locator(
      ".item-header-sources",
    );
    await expect(bravoSource).toHaveCount(1);
    await expect(bravoSource).toContainText("BBBBook pg. 5");
    await expect(bravoSource).toContainText("AAABook pg. 99");
    await expect(bravoSource).toContainText(",");

    // The item with an empty sources array shows a blank citation (the shared
    // header always renders the sources slot; it is simply empty).
    await expect(
      rowByName(game, browser, nameEmpty).locator(".item-header-sources"),
    ).toHaveText("");
  });

  test("book filter 'only' matches items where the book is a SECONDARY source", async ({
    game,
  }) => {
    const token = uniqueName("only");
    const nameA = `${token} alpha`;
    const nameB = `${token} bravo`;
    const nameC = `${token} charlie`;
    // AAABook is alpha's sole source, but bravo's SECOND (secondary) source.
    await createGear(game, nameA, [{ book: "AAABook", page: 10 }]);
    await createGear(game, nameB, [
      { book: "BBBBook", page: 5 },
      { book: "AAABook", page: 99 },
    ]);
    await createGear(game, nameC, [{ book: "CCCBook", page: 1 }]);

    const browser = await openItemBrowser(game);
    await browser.locator(".cpr-browser-name-input").fill(token);
    await expect(browser.locator(".cpr-browser-entry")).toHaveCount(3);

    await expandBookFilter(browser);
    await cycleTo(bookOption(browser, "AAABook"), "only");

    // alpha (primary) AND bravo (secondary) match; charlie (no AAABook) does not.
    await expect(browser.locator(".cpr-browser-entry")).toHaveCount(2);
    await expect(rowByName(game, browser, nameA)).toBeVisible();
    await expect(rowByName(game, browser, nameB)).toBeVisible();
    await expect(rowByName(game, browser, nameC)).toHaveCount(0);
  });

  test("book filter 'exclude' hides every item that cites the book anywhere", async ({
    game,
  }) => {
    const token = uniqueName("excl");
    const nameA = `${token} alpha`;
    const nameB = `${token} bravo`;
    const nameC = `${token} charlie`;
    await createGear(game, nameA, [{ book: "AAABook", page: 10 }]);
    await createGear(game, nameB, [
      { book: "BBBBook", page: 5 },
      { book: "AAABook", page: 99 },
    ]);
    await createGear(game, nameC, [{ book: "CCCBook", page: 1 }]);

    const browser = await openItemBrowser(game);
    await browser.locator(".cpr-browser-name-input").fill(token);
    await expect(browser.locator(".cpr-browser-entry")).toHaveCount(3);

    await expandBookFilter(browser);
    await cycleTo(bookOption(browser, "AAABook"), "exclude");

    // Both alpha and bravo cite AAABook (even as a secondary) → both hidden.
    await expect(browser.locator(".cpr-browser-entry")).toHaveCount(1);
    await expect(rowByName(game, browser, nameC)).toBeVisible();
    await expect(rowByName(game, browser, nameA)).toHaveCount(0);
    await expect(rowByName(game, browser, nameB)).toHaveCount(0);
  });

  test("two books set to 'only' show items having EITHER (OR semantics)", async ({
    game,
  }) => {
    const token = uniqueName("or");
    const nameA = `${token} alpha`;
    const nameB = `${token} bravo`;
    const nameC = `${token} charlie`;
    await createGear(game, nameA, [{ book: "AAABook", page: 10 }]);
    await createGear(game, nameB, [
      { book: "BBBBook", page: 5 },
      { book: "AAABook", page: 99 },
    ]);
    await createGear(game, nameC, [{ book: "CCCBook", page: 1 }]);

    const browser = await openItemBrowser(game);
    await browser.locator(".cpr-browser-name-input").fill(token);
    await expect(browser.locator(".cpr-browser-entry")).toHaveCount(3);

    await expandBookFilter(browser);
    await cycleTo(bookOption(browser, "AAABook"), "only");
    await cycleTo(bookOption(browser, "CCCBook"), "only");

    // AAABook OR CCCBook covers all three (alpha+bravo via AAABook, charlie via CCC).
    await expect(browser.locator(".cpr-browser-entry")).toHaveCount(3);
    await expect(rowByName(game, browser, nameA)).toBeVisible();
    await expect(rowByName(game, browser, nameB)).toBeVisible();
    await expect(rowByName(game, browser, nameC)).toBeVisible();
  });

  test("Refresh Index re-indexes edited items: a corrected field updates the row and filter without a reopen", async ({
    game,
  }) => {
    const name = uniqueName("misconfigured");
    // The user's scenario: an item created with the wrong source book, spotted
    // and corrected while the browser is open.
    const wrongBook = uniqueName("WrongBook");
    const fixedBook = uniqueName("FixedBook");
    const id = await createGear(game, name, [{ book: wrongBook, page: 1 }]);

    const browser = await openItemBrowser(game);
    await browser.locator(".cpr-browser-name-input").fill(name);
    const row = rowByName(game, browser, name);
    await expect(row.locator(".item-header-sources")).toContainText(wrongBook);
    await expandBookFilter(browser);
    await expect(bookOption(browser, wrongBook)).toBeVisible();

    // Fix the misconfiguration on the item itself. The index tracks the edit in
    // its cache, but nothing re-renders the open browser — row and filter stay
    // stale until a refresh.
    await game.evaluate(
      ({ id, fixedBook }) =>
        game.items
          .get(id)
          .update({ "system.sources": [{ book: fixedBook, page: 1 }] }),
      { id, fixedBook },
    );
    await expect(row.locator(".item-header-sources")).toContainText(wrongBook);

    // Refresh re-indexes all data and re-renders both results and sidebar: the
    // row now shows the corrected book and the filter list swaps wrong→fixed —
    // no close/reopen.
    await browser.locator('button[data-action="refreshIndex"]').click();
    await expect(row.locator(".item-header-sources")).toContainText(fixedBook);
    await expect(row.locator(".item-header-sources")).not.toContainText(
      wrongBook,
    );
    await expandBookFilter(browser);
    await expect(bookOption(browser, fixedBook)).toBeVisible();
    await expect(bookOption(browser, wrongBook)).toHaveCount(0);
  });
});
