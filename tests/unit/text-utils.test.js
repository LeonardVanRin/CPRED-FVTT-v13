import { describe, it, expect } from "vitest";

import CPRTextUtils from "../../src/modules/utils/TextUtils.js";

/**
 * Tier-1 example: CPRTextUtils has no top-level imports and `toTitleCase` uses
 * only built-in String methods, so it imports and runs in bare Node with no
 * Foundry stubs. (stripHTML/sanitizeEnrichedText depend on the `$`/`Handlebars`
 * globals and belong to the Tier-2/browser layer, not here.)
 */
describe("CPRTextUtils.toTitleCase", () => {
  it("title-cases a lowercase phrase", () => {
    expect(CPRTextUtils.toTitleCase("some string")).toBe("Some String");
  });

  it("normalises mixed/upper case to title case", () => {
    expect(CPRTextUtils.toTitleCase("hELLO wORLD")).toBe("Hello World");
  });

  it("handles a single word", () => {
    expect(CPRTextUtils.toTitleCase("solo")).toBe("Solo");
  });

  it("leaves an empty string unchanged", () => {
    expect(CPRTextUtils.toTitleCase("")).toBe("");
  });
});
