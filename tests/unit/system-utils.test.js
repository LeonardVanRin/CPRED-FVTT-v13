import { describe, it, expect } from "vitest";

import SystemUtils from "../../src/modules/utils/cpr-systemUtils.js";

/**
 * Tier-2 examples: `cpr-systemUtils.js` imports only the logger and touches no
 * Foundry globals at import time, so it loads under the setup shim. `slugify` is
 * pure logic; `Localize`/`Format` delegate to the stubbed `game.i18n`.
 */
describe("CPRSystemUtils.slugify", () => {
  it("removes spaces and lower-cases the first character", () => {
    expect(SystemUtils.slugify("First Aid")).toBe("firstAid");
  });

  it("joins a '/' skill name with 'And'", () => {
    expect(SystemUtils.slugify("Evasion/Dance")).toBe("evasionAndDance");
  });

  it("joins an '&' skill name with 'And'", () => {
    expect(SystemUtils.slugify("Composition & Education")).toBe(
      "compositionAndEducation",
    );
  });

  it("uses the 'Or' form for the special-cased '/' skills", () => {
    // Resist Torture/Drugs is one of the explicit "Or" special cases.
    expect(SystemUtils.slugify("Resist Torture/Drugs")).toBe(
      "resistTortureOrDrugs",
    );
  });
});

describe("CPRSystemUtils.Localize / Format", () => {
  it("Localize delegates to game.i18n.localize", () => {
    // The shim echoes the key back.
    expect(SystemUtils.Localize("CPR.global.stats.body")).toBe(
      "CPR.global.stats.body",
    );
  });

  it("Format substitutes {placeholders} from the data object", () => {
    expect(SystemUtils.Format("Applied {amount} damage", { amount: 10 })).toBe(
      "Applied 10 damage",
    );
  });
});
