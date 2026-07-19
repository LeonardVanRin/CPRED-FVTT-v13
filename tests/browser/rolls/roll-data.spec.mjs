import { test, expect } from "../fixtures.mjs";

/*
 * Verifies @-references resolve in roll formulas via the actor's roll data. `CPRActor#getRollData`
 * exposes single-value stats as plain numbers (`@stats.ref`) and value+max stats (LUCK, EMP, derived
 * HP/Humanity) as `{ value, total }` (`@stats.luck.value` / `@stats.luck.total`). Skills come from the
 * `system.skills` getter as `level + Active Effect mods`. Derived stats are also under `@derivedStats.*`.
 */

test("@stats (flat + value/total), @skills, and @derivedStats resolve in roll formulas", async ({
  game,
}) => {
  const result = await game.evaluate(async () => {
    const actor = await Actor.create({ name: "rd-test", type: "character" });
    await actor.update({
      "system.stats.ref.value": 7,
      "system.stats.luck.value": 3,
      "system.stats.luck.max": 6,
    });
    await actor.createEmbeddedDocuments("Item", [
      { name: "Handgun", type: "skill", system: { level: 5, stat: "ref" } },
    ]);

    const rd = actor.getRollData();
    const walkValue = actor.system.derivedStats.walk.value;

    const checkRoll = await new Roll(
      "1d10 + @stats.ref + @skills.handgun",
      rd,
    ).evaluate();
    const luckRoll = await new Roll(
      "@stats.luck.value + @stats.luck.total",
      rd,
    ).evaluate();
    const derivedRoll = await new Roll("@derivedStats.walk", rd).evaluate();

    const out = {
      ref: rd.stats?.ref, // single-value stat → flat number
      handgun: rd.skills?.handgun, // level + mods
      luckValue: rd.stats?.luck?.value, // value+max stat → { value, total }
      luckTotal: rd.stats?.luck?.total,
      walkValue,
      rdStatsWalk: rd.stats?.walk, // single-value derived → flat
      rdDerivedWalk: rd.derivedStats?.walk,
      checkTotal: checkRoll.total,
      diceTotal: checkRoll.dice[0].total,
      luckTotalRoll: luckRoll.total,
      derivedTotalRoll: derivedRoll.total,
    };
    await actor.delete();
    return out;
  });

  // Single-value stat stays flat; skill is level + mods.
  expect(result.ref).toBe(7);
  expect(result.handgun).toBe(5);
  expect(result.checkTotal).toBe(result.diceTotal + 12);
  // Value+max stat exposes value (current) and total (max), both usable in a formula.
  expect(result.luckValue).toBe(3);
  expect(result.luckTotal).toBe(6);
  expect(result.luckTotalRoll).toBe(9);
  // Derived stats resolve under both @stats.* and @derivedStats.*.
  expect(result.rdStatsWalk).toBe(result.walkValue);
  expect(result.rdDerivedWalk).toBe(result.walkValue);
  expect(result.derivedTotalRoll).toBe(result.walkValue);
});
