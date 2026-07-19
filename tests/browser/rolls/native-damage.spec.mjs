import { test, expect } from "../fixtures.mjs";

/*
 * The `dmg` die modifier drives the apply-damage affordance on a bare native roll (e.g. `/r 2d6dmg`) via
 * the add-damage-application hook. These specs post such rolls to chat and assert the injected button and
 * its data — the RAW crit +5 on a crit (0 otherwise) and the RAW ablation of 1, plus the `ab`/`cd`
 * overrides — and the two guards: a plain roll gets nothing, and a message that already carries an
 * apply-damage button (a weapon/program card) is not double-injected.
 *
 * Dice faces are forced through CONFIG.Dice.randomUniform (see red-dmg-modifiers.spec.mjs) so crits are
 * deterministic. The roll/message is built in-page; the button and its attributes are then read from the
 * rendered chat DOM through Playwright locators.
 */

// Post `formula` to chat with each die forced to the next face in `faces`, and return the message id.
async function postRoll(page, formula, dieFaces, faces) {
  return page.evaluate(
    async ({ formula, dieFaces, faces }) => {
      const original = CONFIG.Dice.randomUniform;
      const queue = faces.map((f) => 1 - (f - 0.5) / dieFaces);
      let i = 0;
      CONFIG.Dice.randomUniform = () => (i < queue.length ? queue[i++] : 0.5);
      try {
        const roll = await new Roll(formula).evaluate();
        const msg = await roll.toMessage({}, { create: true });
        return msg.id;
      } finally {
        CONFIG.Dice.randomUniform = original;
      }
    },
    { formula, dieFaces, faces },
  );
}

test.describe("native dmg roll — apply-damage injection", () => {
  test("2d6dmg crit posts an apply-damage button carrying the +5 bonus", async ({
    game,
  }) => {
    const id = await postRoll(game, "2d6dmg", 6, [6, 6]);
    const button = game.locator(
      `[data-message-id="${id}"] [data-action="applyDamage"]`,
    );
    await expect(button).toHaveCount(1);
    await expect(button).toHaveAttribute("data-total-damage", "12");
    await expect(button).toHaveAttribute("data-bonus-damage", "5");
    await expect(button).toHaveAttribute("data-damage-location", "body");
    // RAW default ablation of 1 (overridable with `abN`).
    await expect(button).toHaveAttribute("data-ablation", "1");
  });

  test("`ab`/`cd` override the RAW ablation and crit bonus (2d6dmgab2cd10)", async ({
    game,
  }) => {
    const id = await postRoll(game, "2d6dmgab2cd10", 6, [6, 6]);
    const button = game.locator(
      `[data-message-id="${id}"] [data-action="applyDamage"]`,
    );
    await expect(button).toHaveCount(1);
    await expect(button).toHaveAttribute("data-ablation", "2");
    await expect(button).toHaveAttribute("data-bonus-damage", "10");
  });

  test("`ab0` applies no ablation", async ({ game }) => {
    const id = await postRoll(game, "2d6dmgab0", 6, [6, 6]);
    const button = game.locator(
      `[data-message-id="${id}"] [data-action="applyDamage"]`,
    );
    await expect(button).toHaveCount(1);
    await expect(button).toHaveAttribute("data-ablation", "0");
  });

  test("2d6dmg without a crit posts the button with no bonus", async ({
    game,
  }) => {
    const id = await postRoll(game, "2d6dmg", 6, [6, 3]);
    const button = game.locator(
      `[data-message-id="${id}"] [data-action="applyDamage"]`,
    );
    await expect(button).toHaveCount(1);
    await expect(button).toHaveAttribute("data-total-damage", "9");
    await expect(button).toHaveAttribute("data-bonus-damage", "0");
  });

  test("a plain 2d6 roll gets no apply-damage button", async ({ game }) => {
    const id = await postRoll(game, "2d6", 6, [6, 6]);
    await expect(
      game.locator(`[data-message-id="${id}"] [data-action="applyDamage"]`),
    ).toHaveCount(0);
  });

  test("a message that already has an apply-damage button is not double-injected", async ({
    game,
  }) => {
    // Simulate a bespoke weapon/program damage card: content already carries an apply-damage button, and
    // the attached roll carries the `dmg` marker. The hook must leave it alone (exactly one button).
    const id = await game.evaluate(async () => {
      const original = CONFIG.Dice.randomUniform;
      CONFIG.Dice.randomUniform = () => 0.5;
      try {
        const roll = await new Roll("2d6dmg").evaluate();
        const content =
          '<div class="rollcard"><a class="clickable" data-action="applyDamage" data-scope="global"><i class="fas fa-bolt"></i></a></div>';
        const msg = await ChatMessage.create({ content, rolls: [roll] });
        return msg.id;
      } finally {
        CONFIG.Dice.randomUniform = original;
      }
    });
    await expect(
      game.locator(`[data-message-id="${id}"] [data-action="applyDamage"]`),
    ).toHaveCount(1);
  });
});
