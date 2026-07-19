import { test, expect } from "../fixtures.mjs";

/*
 * Deterministic tests for the CPR die modifiers (src/modules/rolls/cpr-die-extended.js):
 *
 *   - `red` — check-die crit: explode on max (>= threshold), implode on a natural 1, once each, no
 *     cascading; supersedes `x`/`xo`; composes with other modifiers by pipeline position.
 *   - `dmg` — non-mutating damage marker: flags a damage roll + a crit (2+ qualifying dice by default)
 *     without changing the total; `count 0` (`dmg0`) is the "no crit" sentinel.
 *   - `ab` / `cd` — non-mutating `dmg` companions: set armor ablation (`abN`) and crit bonus (`cdN`);
 *     require `dmg`; exercise CPRDie's fused-token re-split (`dmgab2` must not lose its `2`).
 *
 * No luck involved: every die face is forced. Foundry routes all randomness through
 * CONFIG.Dice.randomUniform, and a face is mapRandomFace(u) = ceil((1 - u) * faces); so to force face
 * `f` on a d{faces} we feed u = 1 - (f - 0.5)/faces (mid-bucket, rounding-safe). `forceRoll` installs a
 * queued stub for the duration of one evaluate() and restores it after. All dice in a given formula
 * share `faces`, so one mapping covers the whole roll (including the dice `red` adds).
 */

// Evaluate `formula` in-page with each die forced to the next face in `faces` (a flat sequence, in roll
// order). Returns the roll total plus the first dice term's results and CPR options for assertions.
async function forceRoll(page, formula, dieFaces, faces) {
  return page.evaluate(
    async ({ formula, dieFaces, faces }) => {
      const original = CONFIG.Dice.randomUniform;
      const queue = faces.map((f) => 1 - (f - 0.5) / dieFaces);
      let i = 0;
      CONFIG.Dice.randomUniform = () => (i < queue.length ? queue[i++] : 0.5);
      try {
        const roll = await new Roll(formula).evaluate();
        const [die] = roll.dice;
        return {
          total: roll.total,
          results: die.results.map((r) => ({
            result: r.result,
            active: r.active,
            count: r.count ?? null,
            exploded: !!r.exploded,
            cprSuccess: !!r.cprSuccess,
            cprFailure: !!r.cprFailure,
            cprDamageCrit: !!r.cprDamageCrit,
          })),
          cprDamage: !!die.options.cprDamage,
          cprDamageIsCrit: !!die.options.cprDamageIsCrit,
          cprAblation: die.options.cprAblation ?? null,
          cprCritBonus: die.options.cprCritBonus ?? null,
        };
      } finally {
        CONFIG.Dice.randomUniform = original;
      }
    },
    { formula, dieFaces, faces },
  );
}

test.describe("red modifier — check-die criticals", () => {
  test("explodes on a natural max: adds one positive bonus die", async ({
    game,
  }) => {
    const roll = await forceRoll(game, "1d10red", 10, [10, 7]);
    expect(roll.total).toBe(17);
    expect(roll.results).toHaveLength(2);
    expect(roll.results[0]).toMatchObject({ result: 10, exploded: true });
    expect(roll.results[1]).toMatchObject({ result: 7, cprSuccess: true });
  });

  test("implodes on a natural 1: adds one negatively-counted die", async ({
    game,
  }) => {
    const roll = await forceRoll(game, "1d10red", 10, [1, 6]);
    expect(roll.total).toBe(-5);
    expect(roll.results).toHaveLength(2);
    expect(roll.results[1]).toMatchObject({
      result: 6,
      cprFailure: true,
      count: -6,
    });
  });

  test("does nothing on a middling roll", async ({ game }) => {
    const roll = await forceRoll(game, "1d10red", 10, [5]);
    expect(roll.total).toBe(5);
    expect(roll.results).toHaveLength(1);
  });

  test("does not cascade: a bonus die that is also max never re-explodes", async ({
    game,
  }) => {
    const roll = await forceRoll(game, "1d10red", 10, [10, 10]);
    expect(roll.total).toBe(20);
    expect(roll.results).toHaveLength(2);
  });

  test("applies flat mods on top of the crit (1d10red+10)", async ({
    game,
  }) => {
    const roll = await forceRoll(game, "1d10red+10", 10, [10, 3]);
    expect(roll.total).toBe(23);
  });

  test("works on any die type — d6 and arbitrary d56", async ({ game }) => {
    expect((await forceRoll(game, "1d6red", 6, [6, 2])).total).toBe(8);
    expect((await forceRoll(game, "1d56red", 56, [56, 10])).total).toBe(66);
    expect((await forceRoll(game, "1d56red", 56, [1, 5])).total).toBe(-4);
  });

  test("redN lowers the explode threshold (1d10red5 explodes on a 5)", async ({
    game,
  }) => {
    const roll = await forceRoll(game, "1d10red5", 10, [5, 4]);
    expect(roll.total).toBe(9);
    expect(roll.results[1]).toMatchObject({ result: 4, cprSuccess: true });
  });

  test("a d1 is a no-op — its face is both max and 1, so neither rule fires", async ({
    game,
  }) => {
    const roll = await forceRoll(game, "1d1red", 1, [1]);
    expect(roll.total).toBe(1);
    expect(roll.results).toHaveLength(1); // no bonus/penalty die added
  });
});

// The full interaction matrix: `red` must compose with every core Die modifier family, in both orders,
// by pipeline position (red acts on the dice active at its place in the formula). One+ cell per family.
test.describe("red × keep/drop (follow position)", () => {
  test("kh before red: red acts only on the kept die (2d10khred)", async ({
    game,
  }) => {
    // keep highest of {10, 3} = 10 (3 discarded), then red explodes the kept 10 with a +8 bonus.
    expect((await forceRoll(game, "2d10khred", 10, [10, 3, 8])).total).toBe(18);
  });

  test("red before kh: the explode is one grouped result, kept whole (2d10redkh)", async ({
    game,
  }) => {
    // red first: 10 explodes (+8), 3 nothing. kh ranks the 10 as its combined value (10 + 8 = 18) and
    // keeps the whole group — the bonus travels with its parent — so the total is 18, not a stranded 10.
    expect((await forceRoll(game, "2d10redkh", 10, [10, 3, 8])).total).toBe(18);
  });

  test("red before kh: an implode penalty never wins keepHighest (2d10redkh)", async ({
    game,
  }) => {
    // red first: 1 implodes (−3 penalty), 8 nothing. The 1's group ranks as its combined value (1 − 3 =
    // −2), so kh keeps the 8 and drops the imploded group whole — the penalty can't be "kept" as highest
    // and drag the total negative (the pre-grouping bug returned −3).
    expect((await forceRoll(game, "2d10redkh", 10, [1, 8, 3])).total).toBe(8);
  });

  test("red before kl: keepLowest keeps the imploded group by its combined value (2d10redkl)", async ({
    game,
  }) => {
    // red first: 1 implodes (−3), 8 nothing. kl ranks the 1's group as 1 − 3 = −2 (the lowest) and keeps
    // it whole → 1 + (−3) = −2; the 8 is dropped.
    expect((await forceRoll(game, "2d10redkl", 10, [1, 8, 3])).total).toBe(-2);
  });

  test("kl before red: red acts on the kept lowest, implode included (2d10klred)", async ({
    game,
  }) => {
    // keep lowest of {3, 10} = 3; red does nothing → 3.
    expect((await forceRoll(game, "2d10klred", 10, [3, 10])).total).toBe(3);
    // keep lowest of {1, 10} = 1; red implodes the kept 1 with a −6 → 1 + (−6) = −5.
    expect((await forceRoll(game, "2d10klred", 10, [1, 10, 6])).total).toBe(-5);
  });

  test("dh before red: drop highest, red acts on the rest (2d10dhred)", async ({
    game,
  }) => {
    // drop highest (10), keep 3; red does nothing → 3.
    expect((await forceRoll(game, "2d10dhred", 10, [10, 3])).total).toBe(3);
  });

  test("dl before red: drop lowest, red explodes the survivor (2d10dlred)", async ({
    game,
  }) => {
    // drop lowest (3), keep 10; red explodes it with +8 → 18.
    expect((await forceRoll(game, "2d10dlred", 10, [10, 3, 8])).total).toBe(18);
  });
});

test.describe("red × reroll (post-reroll face; red's extra dice exempt)", () => {
  test("r before red: red judges the rerolled face (1d10r1red)", async ({
    game,
  }) => {
    // reroll the 1 → 10, then red explodes that 10 with +7 → 17.
    expect((await forceRoll(game, "1d10r1red", 10, [1, 10, 7])).total).toBe(17);
    // reroll the 1 → 8; red does nothing → 8.
    expect((await forceRoll(game, "1d10r1red", 10, [1, 8])).total).toBe(8);
  });

  test("rr before red: recursive reroll resolves first (1d10rr1red)", async ({
    game,
  }) => {
    // rr1: 1 → 1 → 9 (stops); red sees 9, nothing → 9.
    expect((await forceRoll(game, "1d10rr1red", 10, [1, 1, 9])).total).toBe(9);
  });

  test("red before r: red's bonus die is NOT rerolled (1d10redr1)", async ({
    game,
  }) => {
    // red explodes the 10 with a bonus that happens to be a 1; r1 must not reroll that bonus die.
    const roll = await forceRoll(game, "1d10redr1", 10, [10, 1]);
    expect(roll.results).toHaveLength(2); // bonus survived (would be 3 if rerolled)
    expect(roll.total).toBe(11); // 10 + 1
    expect(roll.results[1]).toMatchObject({ result: 1, cprSuccess: true });
  });
});

test.describe("red supersedes explode (x / xo become no-ops)", () => {
  test("x before red: x is suppressed, only red's single bonus is added (1d10xred)", async ({
    game,
  }) => {
    const roll = await forceRoll(game, "1d10xred", 10, [10, 10, 10]);
    expect(roll.total).toBe(20);
    expect(roll.results).toHaveLength(2); // not a chain
  });

  test("xo before red: also suppressed (1d10xored)", async ({ game }) => {
    const roll = await forceRoll(game, "1d10xored", 10, [10, 10]);
    expect(roll.total).toBe(20);
    expect(roll.results).toHaveLength(2);
  });

  test("red before x: x still does nothing (1d10redx)", async ({ game }) => {
    const roll = await forceRoll(game, "1d10redx", 10, [10, 7]);
    expect(roll.total).toBe(17);
    expect(roll.results).toHaveLength(2);
  });
});

test.describe("red × clamp (red reads the rolled face, not the clamped count)", () => {
  test("max before red: a genuine max still crits but counts as the cap (1d10max8red)", async ({
    game,
  }) => {
    // `min`/`max` rewrite a result's `count`, never its rolled `result`.
    const crit = await forceRoll(game, "1d10max8red", 10, [10, 7]);
    expect(crit.results).toHaveLength(2);
    expect(crit.results[0]).toMatchObject({ result: 10, count: 8 }); // genuine 10, counts as 8
    expect(crit.results[1]).toMatchObject({ result: 7, cprSuccess: true });
    expect(crit.total).toBe(15); // 8 (clamped) + 7 (bonus)

    const noCrit = await forceRoll(game, "1d10max8red", 10, [9]);
    expect(noCrit.total).toBe(8); // 9 clamped to 8, not a crit
    expect(noCrit.results).toHaveLength(1);
  });

  test("min before red: a genuine 1 still implodes though it counts as the floor (1d10min2red)", async ({
    game,
  }) => {
    // min2 makes the rolled 1 count as 2; red still reads the face 1 and implodes (−6) → 2 + (−6) = −4.
    expect((await forceRoll(game, "1d10min2red", 10, [1, 6])).total).toBe(-4);
  });
});

test.describe("red × counting (allowed, pipeline order — counting tallies the expanded pool)", () => {
  // Use the parameter-free counting modifiers (even/odd): a parametrised one like `cs>=8` fused after
  // `red` loses its parameter to Foundry's compound-token matcher, which is a Foundry quirk, not ours.
  test("even after red counts the red-expanded pool (1d10redeven)", async ({
    game,
  }) => {
    // red explodes 10 → bonus 4; even tallies even dice across the expanded pool: 10 and 4 → 2.
    expect((await forceRoll(game, "1d10redeven", 10, [10, 4])).total).toBe(2);
  });

  test("odd after red counts the red-expanded pool (1d10redodd)", async ({
    game,
  }) => {
    // red explodes 10 → bonus 7; odd tallies odd dice: 10 (no) and 7 (yes) → 1.
    expect((await forceRoll(game, "1d10redodd", 10, [10, 7])).total).toBe(1);
  });
});

test.describe("dmg modifier — damage marker + crit detection", () => {
  test("marks a damage roll and flags a crit on 2+ max, without changing the total", async ({
    game,
  }) => {
    const crit = await forceRoll(game, "2d6dmg", 6, [6, 6]);
    expect(crit.total).toBe(12);
    expect(crit.cprDamage).toBe(true);
    expect(crit.cprDamageIsCrit).toBe(true);
    expect(crit.results.every((r) => r.cprDamageCrit)).toBe(true);

    const noCrit = await forceRoll(game, "2d6dmg", 6, [6, 3]);
    expect(noCrit.total).toBe(9);
    expect(noCrit.cprDamage).toBe(true);
    expect(noCrit.cprDamageIsCrit).toBe(false);
  });

  test("threshold param: dmg5 lets 5s count toward the crit", async ({
    game,
  }) => {
    expect((await forceRoll(game, "2d6dmg5", 6, [5, 5])).cprDamageIsCrit).toBe(
      true,
    );
    expect((await forceRoll(game, "2d6dmg5", 6, [5, 4])).cprDamageIsCrit).toBe(
      false,
    );
  });

  test("count param: dmg3>=5 needs 3 qualifying dice", async ({ game }) => {
    expect(
      (await forceRoll(game, "4d6dmg3>=5", 6, [6, 6, 6, 2])).cprDamageIsCrit,
    ).toBe(true);
    expect(
      (await forceRoll(game, "4d6dmg3>=5", 6, [6, 6, 2, 2])).cprDamageIsCrit,
    ).toBe(false);
  });

  test("works on non-d6 damage dice (4d10dmg2>=9)", async ({ game }) => {
    expect(
      (await forceRoll(game, "4d10dmg2>=9", 10, [10, 9, 3, 3])).cprDamageIsCrit,
    ).toBe(true);
  });

  test("count-0 sentinel: dmg0 stays a damage roll but never crits", async ({
    game,
  }) => {
    const bare = await forceRoll(game, "2d6dmg0", 6, [6, 6]);
    expect(bare.cprDamage).toBe(true);
    expect(bare.cprDamageIsCrit).toBe(false);
    expect(bare.total).toBe(12);

    const explicit = await forceRoll(game, "2d6dmg0>=6", 6, [6, 6]);
    expect(explicit.cprDamage).toBe(true);
    expect(explicit.cprDamageIsCrit).toBe(false);
  });

  test("a plain roll without dmg is not marked a damage roll", async ({
    game,
  }) => {
    const roll = await forceRoll(game, "2d6", 6, [6, 6]);
    expect(roll.cprDamage).toBe(false);
    expect(roll.cprDamageIsCrit).toBe(false);
  });
});

// `ab` (ablation) and `cd` (critical bonus) are non-mutating companions to `dmg`. They set die options
// read by the apply-damage hook and never change the total. The tricky part is parsing: Foundry fuses
// letter-adjacent modifiers into one token (`dmgab2`) and core's compound splitter drops their numeric
// params, so CPRDie#_evaluateModifiers re-splits fused tokens first — both `dmgab2` and `dmg5ab3` must
// land the param. They also require `dmg`: on a plain roll they warn and no-op.
test.describe("ab / cd — damage-config markers (require dmg)", () => {
  test("fused `dmgab2` keeps the param the core splitter would drop", async ({
    game,
  }) => {
    const roll = await forceRoll(game, "2d6dmgab2", 6, [6, 6]);
    expect(roll.cprDamage).toBe(true);
    expect(roll.cprAblation).toBe(2);
  });

  test("un-fused `dmg5ab3` (dmg carries a number) also sets ablation", async ({
    game,
  }) => {
    const roll = await forceRoll(game, "2d6dmg5ab3", 6, [6, 6]);
    expect(roll.cprAblation).toBe(3);
  });

  test("a lone `ab` means 1; `ab0` means none", async ({ game }) => {
    expect((await forceRoll(game, "2d6dmgab", 6, [6, 6])).cprAblation).toBe(1);
    expect((await forceRoll(game, "2d6dmgab0", 6, [6, 6])).cprAblation).toBe(0);
  });

  test("fused `dmgcd10` sets the critical bonus; `cd0` means none", async ({
    game,
  }) => {
    expect((await forceRoll(game, "2d6dmgcd10", 6, [6, 6])).cprCritBonus).toBe(
      10,
    );
    expect((await forceRoll(game, "2d6dmgcd0", 6, [6, 6])).cprCritBonus).toBe(
      0,
    );
  });

  test("`ab` and `cd` compose on one roll (2d6dmgab2cd10)", async ({
    game,
  }) => {
    const roll = await forceRoll(game, "2d6dmgab2cd10", 6, [6, 6]);
    expect(roll.cprAblation).toBe(2);
    expect(roll.cprCritBonus).toBe(10);
  });

  test("all three params survive together (2d6dmg5ab3cd7)", async ({
    game,
  }) => {
    const roll = await forceRoll(game, "2d6dmg5ab3cd7", 6, [5, 5]);
    expect(roll.cprDamageIsCrit).toBe(true); // dmg5 → two 5s crit
    expect(roll.cprAblation).toBe(3);
    expect(roll.cprCritBonus).toBe(7);
  });

  test("without `dmg` they are inert (no option set)", async ({ game }) => {
    const ab = await forceRoll(game, "2d6ab2", 6, [6, 6]);
    expect(ab.cprDamage).toBe(false);
    expect(ab.cprAblation).toBe(null);
    const cd = await forceRoll(game, "2d6cd5", 6, [6, 6]);
    expect(cd.cprCritBonus).toBe(null);
  });
});

// dmg is a non-mutating marker, so it composes by pipeline position too: it counts the dice active at
// its place in the formula and never changes the total.
test.describe("dmg × other modifiers (pipeline position, total unchanged)", () => {
  test("dmg before kh: crit detected on the full pool, then kh selects (2d6dmgkh)", async ({
    game,
  }) => {
    // dmg sees both 6s (crit), then kh keeps one 6. Total is the kept die; crit stays flagged.
    const roll = await forceRoll(game, "2d6dmgkh", 6, [6, 6]);
    expect(roll.cprDamageIsCrit).toBe(true);
    expect(roll.total).toBe(6);
  });

  test("kh before dmg: only the kept die remains, so 2+ can't be met (2d6khdmg)", async ({
    game,
  }) => {
    // kh keeps a single 6; dmg then needs 2 qualifying dice and finds only 1 → no crit.
    const roll = await forceRoll(game, "2d6khdmg", 6, [6, 6]);
    expect(roll.cprDamage).toBe(true);
    expect(roll.cprDamageIsCrit).toBe(false);
  });

  test("kh2 before dmg: two kept maxes still crit (3d10kh2dmg)", async ({
    game,
  }) => {
    const roll = await forceRoll(game, "3d10kh2dmg", 10, [10, 10, 3]);
    expect(roll.cprDamageIsCrit).toBe(true);
    expect(roll.total).toBe(20);
  });

  test("dmg reads the rolled face, not the clamped count (2d6max5dmg)", async ({
    game,
  }) => {
    // max5 makes each 6 count as 5; dmg checks the face (6) so it still crits, total is the clamped 10.
    const roll = await forceRoll(game, "2d6max5dmg", 6, [6, 6]);
    expect(roll.cprDamageIsCrit).toBe(true);
    expect(roll.total).toBe(10);
  });
});

// The programmatic paths refuse a red+dmg formula at assembly, but a raw `/r` chat roll builds a native
// Foundry roll that skips them. The `chatMessage` hook (hooks/chat/enforce-red-dmg-exclusive.js) closes
// that gap: it vetoes such a message before it is rolled. `Hooks.call` returns false when any handler
// vetoes, so it is the deterministic probe for "this message would be blocked".
test.describe("red/dmg chat guard (manual /r rolls)", () => {
  async function chatVetoed(game, message) {
    return game.evaluate(
      (msg) => Hooks.call("chatMessage", ui.chat, msg, {}) === false,
      message,
    );
  }

  test("blocks a /r roll that pairs red with dmg", async ({ game }) => {
    expect(await chatVetoed(game, "/r 1d6red4dmg")).toBe(true);
    expect(await chatVetoed(game, "/r 1d10red + 4d6dmg")).toBe(true);
    expect(await chatVetoed(game, "[[1d6red4dmg]]")).toBe(true);
  });

  test("allows a /r roll carrying only one marker, and plain prose", async ({
    game,
  }) => {
    expect(await chatVetoed(game, "/r 1d10red")).toBe(false);
    expect(await chatVetoed(game, "/r 2d6dmg")).toBe(false);
    expect(await chatVetoed(game, "red and dmg are exclusive")).toBe(false);
  });

  test("does not conflate two separate valid inline rolls in one message", async ({
    game,
  }) => {
    expect(await chatVetoed(game, "[[1d10red]] and [[2d6dmg]]")).toBe(false);
  });
});
