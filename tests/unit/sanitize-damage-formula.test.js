import { describe, it, expect } from "vitest";

import {
  sanitizeDamageFormula,
  stripDamageMarkers,
} from "../../src/modules/rolls/sanitize-damage-formula.js";

/**
 * Tier-1: `sanitizeDamageFormula` has no top-level imports and is a pure string transform, so it runs in
 * bare Node with no Foundry stubs. It removes the `dmg`/`ab`/`cd`/`red` markers an attackable item's
 * Damage field must not carry (they come from the item's crit/ablation settings; `red` conflicts with
 * the auto-appended `dmg`), preserves every other modifier, and reports which markers were removed.
 */
describe("stripDamageMarkers (cleaned formula)", () => {
  it("leaves a plain dice formula untouched", () => {
    expect(stripDamageMarkers("3d6")).toBe("3d6");
    expect(stripDamageMarkers("2d6+2")).toBe("2d6+2");
  });

  it("removes a bare `dmg`", () => {
    expect(stripDamageMarkers("2d6dmg")).toBe("2d6");
  });

  it("removes `dmg` with its parameters", () => {
    expect(stripDamageMarkers("2d6dmg5")).toBe("2d6");
    expect(stripDamageMarkers("4d6dmg3>=5")).toBe("4d6");
    expect(stripDamageMarkers("2d6dmg0>=6")).toBe("2d6");
  });

  it("removes `ab` and `cd` with their values", () => {
    expect(stripDamageMarkers("2d6dmgab2")).toBe("2d6");
    expect(stripDamageMarkers("2d6dmgcd10")).toBe("2d6");
    expect(stripDamageMarkers("2d6dmgab0cd0")).toBe("2d6");
  });

  it("removes `red` (invalid on a damage roll), with or without a threshold", () => {
    expect(stripDamageMarkers("3d6red")).toBe("3d6");
    expect(stripDamageMarkers("3d6red5")).toBe("3d6");
    expect(stripDamageMarkers("3d6khred")).toBe("3d6kh");
    expect(stripDamageMarkers("3d6kh2dmg5ab0cd10red")).toBe("3d6kh2");
  });

  it("sanitises the documented example, keeping `kh2`", () => {
    expect(stripDamageMarkers("3d6kh2dmg5ab0cd10")).toBe("3d6kh2");
  });

  it("keeps other modifiers regardless of order", () => {
    expect(stripDamageMarkers("3d6dmg5kh2")).toBe("3d6kh2");
    expect(stripDamageMarkers("3d6dmg5ab0cd10kh2")).toBe("3d6kh2");
  });

  it("splits fused markers (`dmgab0` → both removed)", () => {
    expect(stripDamageMarkers("2d6dmgab0")).toBe("2d6");
    expect(stripDamageMarkers("2d6dmgab2cd10")).toBe("2d6");
  });

  it("only touches the die's modifier run, not @-refs, operators or flavor", () => {
    expect(stripDamageMarkers("3d6dmg5 + @stats.body")).toBe(
      "3d6 + @stats.body",
    );
    expect(stripDamageMarkers("2d6dmg + 2")).toBe("2d6 + 2");
    expect(stripDamageMarkers("1d6ab2 + 1d4cd0")).toBe("1d6 + 1d4");
  });

  it("does not strip modifiers that merely resemble the markers", () => {
    // core keep/drop/reroll modifiers are preserved
    expect(stripDamageMarkers("4d6kh3")).toBe("4d6kh3");
    expect(stripDamageMarkers("2d6dl1")).toBe("2d6dl1");
    expect(stripDamageMarkers("2d6r1")).toBe("2d6r1");
  });

  it("returns non-strings and empty input unchanged", () => {
    expect(stripDamageMarkers("")).toBe("");
    expect(stripDamageMarkers(undefined)).toBe(undefined);
    expect(stripDamageMarkers(5)).toBe(5);
  });
});

describe("sanitizeDamageFormula (removed report)", () => {
  it("reports only the markers actually removed, in dmg/ab/cd/red order", () => {
    expect(sanitizeDamageFormula("3d6dmg5")).toEqual({
      cleaned: "3d6",
      removed: ["dmg"],
    });
    expect(sanitizeDamageFormula("3d6dmgab2")).toEqual({
      cleaned: "3d6",
      removed: ["dmg", "ab"],
    });
    expect(sanitizeDamageFormula("3d6kh2dmg5ab0cd10red")).toEqual({
      cleaned: "3d6kh2",
      removed: ["dmg", "ab", "cd", "red"],
    });
    // reported in canonical order even when entered out of order
    expect(sanitizeDamageFormula("3d6cd10dmg5").removed).toEqual(["dmg", "cd"]);
    expect(sanitizeDamageFormula("3d6reddmg").removed).toEqual(["dmg", "red"]);
  });

  it("reports nothing when there is nothing to strip", () => {
    expect(sanitizeDamageFormula("3d6kh2")).toEqual({
      cleaned: "3d6kh2",
      removed: [],
    });
  });

  it("deduplicates across multiple die terms", () => {
    expect(sanitizeDamageFormula("2d6dmg + 1d4dmgab0").removed).toEqual([
      "dmg",
      "ab",
    ]);
  });
});
