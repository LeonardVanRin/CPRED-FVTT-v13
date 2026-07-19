import { describe, it, expect } from "vitest";

import CPR from "../../src/modules/system/config.js";

/**
 * Tier-1: `config.js` is pure data (localization-key enums), so it imports with
 * no Foundry surface. These guard the invariants other code relies on.
 */
describe("CPR config invariants", () => {
  it("systemId is the Foundry package id", () => {
    expect(CPR.systemId).toBe("cyberpunk-red-core");
  });

  it("statList holds exactly the ten CPR stats", () => {
    expect(Object.keys(CPR.statList)).toEqual([
      "int",
      "ref",
      "dex",
      "tech",
      "cool",
      "will",
      "move",
      "body",
      "luck",
      "emp",
    ]);
  });

  it("every stat maps to a CPR.global.stats.* localization key", () => {
    for (const [stat, key] of Object.entries(CPR.statList)) {
      expect(key).toBe(`CPR.global.stats.${stat}`);
    }
  });
});
