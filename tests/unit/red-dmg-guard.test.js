import { describe, it, expect } from "vitest";

import {
  formulaHasRedAndDmg,
  messageRollFormulas,
  messageHasRedDmgViolation,
} from "../../src/modules/rolls/red-dmg-guard.js";

/**
 * Tier-1: the `red`+`dmg` chat guard is a pure string transform (no Foundry), so it runs in bare Node.
 * `red` (check-die crit) and `dmg` (damage marker) are mutually exclusive within one roll; the
 * programmatic paths already refuse such a formula, and these helpers let the chat hook refuse a raw
 * `/r` roll (or inline `[[…]]` roll) that pairs them too. Two *separate* rolls in one message are each
 * valid, so the guard must not conflate them.
 */
describe("formulaHasRedAndDmg", () => {
  it("is true only when a single formula carries both markers", () => {
    expect(formulaHasRedAndDmg("1d6red4dmg")).toBe(true);
    expect(formulaHasRedAndDmg("1d10red + 4d6dmg")).toBe(true);
  });

  it("is false when only one (or neither) marker is present", () => {
    expect(formulaHasRedAndDmg("1d10red")).toBe(false);
    expect(formulaHasRedAndDmg("2d6dmg")).toBe(false);
    expect(formulaHasRedAndDmg("2d6+2")).toBe(false);
  });

  it("is case-insensitive and coerces non-strings", () => {
    expect(formulaHasRedAndDmg("1d6RED4DMG")).toBe(true);
    expect(formulaHasRedAndDmg(1234)).toBe(false);
  });
});

describe("messageRollFormulas", () => {
  it("extracts a leading roll command's formula", () => {
    expect(messageRollFormulas("/r 1d6red4dmg")).toEqual(["1d6red4dmg"]);
    expect(messageRollFormulas("/roll 2d6")).toEqual(["2d6"]);
    expect(messageRollFormulas("/gmroll 1d10red")).toEqual(["1d10red"]);
  });

  it("drops a `#flavor` trailer from a command formula", () => {
    expect(messageRollFormulas("/r 1d10red # a red flavor")).toEqual([
      "1d10red ",
    ]);
  });

  it("extracts every inline roll", () => {
    expect(messageRollFormulas("[[1d10red]] and [[2d6dmg]]")).toEqual([
      "1d10red",
      "2d6dmg",
    ]);
  });

  it("yields nothing for plain prose, even prose containing the words", () => {
    expect(messageRollFormulas("the red door took dmg")).toEqual([]);
    expect(messageRollFormulas("")).toEqual([]);
  });

  it("tolerates leading whitespace before a command", () => {
    expect(messageRollFormulas("  /r 2d6dmg")).toEqual(["2d6dmg"]);
  });
});

describe("messageHasRedDmgViolation", () => {
  it("trips on a manual roll that pairs red with dmg", () => {
    expect(messageHasRedDmgViolation("/r 1d6red4dmg")).toBe(true);
    expect(messageHasRedDmgViolation("/r 1d10red + 4d6dmg")).toBe(true);
    expect(messageHasRedDmgViolation("[[1d6red4dmg]]")).toBe(true);
  });

  it("passes a manual roll with only one marker", () => {
    expect(messageHasRedDmgViolation("/r 1d10red")).toBe(false);
    expect(messageHasRedDmgViolation("/r 2d6dmg")).toBe(false);
    expect(messageHasRedDmgViolation("/r 2d6")).toBe(false);
  });

  it("does NOT conflate two separate valid rolls in one message", () => {
    expect(messageHasRedDmgViolation("[[1d10red]] and [[2d6dmg]]")).toBe(false);
  });

  it("ignores the markers in plain prose (no roll to guard)", () => {
    expect(messageHasRedDmgViolation("red and dmg are exclusive")).toBe(false);
  });
});
