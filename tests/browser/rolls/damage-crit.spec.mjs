import { test, expect } from "../fixtures.mjs";

/*
 * Configurable damage criticals: CPRDamageRoll builds the `dmg` marker modifier from a crit config
 * (threshold/count/bonus) resolved from weapon/ammo data. RAW = 2 dice at the die's max face → +5.
 * Verifies the modifier builder and the crit/bonus behaviour for the homebrew dials (Expansive-style
 * lowered threshold, higher count, configurable bonus, and a no-crit weapon).
 */

async function damageRoll(page, formula, critConfig, dieFaces, faces) {
  return page.evaluate(
    async ({ formula, critConfig, dieFaces, faces }) => {
      const R = await import(
        `/systems/${game.system.id}/modules/rolls/cpr-rolls.js`
      );
      const original = CONFIG.Dice.randomUniform;
      const queue = faces.map((f) => 1 - (f - 0.5) / dieFaces);
      let i = 0;
      CONFIG.Dice.randomUniform = () => (i < queue.length ? queue[i++] : 0.5);
      try {
        const roll = R.CPRDamageRoll.create(
          "Test",
          formula,
          "pistol",
          critConfig,
        );
        await roll.roll();
        return {
          formula: roll._formula,
          isCrit: roll.wasCritSuccess(),
          bonus: roll.bonusDamage,
          total: roll.resultTotal,
        };
      } finally {
        CONFIG.Dice.randomUniform = original;
      }
    },
    { formula, critConfig, dieFaces, faces },
  );
}

test("dmgModifier builds the right modifier string from a config", async ({
  game,
}) => {
  const r = await game.evaluate(async () => {
    const R = await import(
      `/systems/${game.system.id}/modules/rolls/cpr-rolls.js`
    );
    const m = (cfg, faces) => R.CPRDamageRoll.dmgModifier(cfg, faces);
    return {
      raw: m({}, 6),
      threshold5: m({ threshold: 5 }, 6),
      count3: m({ count: 3 }, 6),
      noCrit: m({ count: 0 }, 6),
      d10raw: m({}, 10),
    };
  });
  expect(r).toEqual({
    raw: "dmg",
    threshold5: "dmg2>=5",
    count3: "dmg3>=6",
    noCrit: "dmg0",
    d10raw: "dmg",
  });
});

test("RAW config: crit on two 6s, +5 bonus", async ({ game }) => {
  const r = await damageRoll(game, "2d6", {}, 6, [6, 6]);
  expect(r.isCrit).toBe(true);
  expect(r.bonus).toBe(5);
  expect(r.total).toBe(12);
});

test("Expansive-style threshold 5: two 5s crit; configurable bonus", async ({
  game,
}) => {
  const r = await damageRoll(
    game,
    "2d6",
    { threshold: 5, count: 2, bonus: 10 },
    6,
    [5, 5],
  );
  expect(r.formula).toContain("dmg2>=5");
  expect(r.isCrit).toBe(true);
  expect(r.bonus).toBe(10);
  expect(r.total).toBe(10);
});

test("higher count: 5+4 does not crit at threshold 5 count 3", async ({
  game,
}) => {
  const r = await damageRoll(
    game,
    "3d6",
    { threshold: 5, count: 3 },
    6,
    [6, 5, 4],
  );
  // only two dice (6,5) are >=5, need 3 → no crit.
  expect(r.isCrit).toBe(false);
});

test("no-crit weapon (count 0): never crits even on two 6s", async ({
  game,
}) => {
  const r = await damageRoll(game, "2d6", { count: 0, bonus: 0 }, 6, [6, 6]);
  expect(r.formula).toContain("dmg0");
  expect(r.isCrit).toBe(false);
  expect(r.total).toBe(12);
});
