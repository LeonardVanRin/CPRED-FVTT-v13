/**
 * Unit-test config for the Foundry-light layer of the system.
 *
 * Scope: fast, CLI, no browser. Most of the codebase depends on Foundry globals
 * (game, CONFIG, Hooks, foundry.data.fields, Actor/Item, document.update()) that
 * only exist inside a running Foundry, so unit tests here cover:
 *   - Tier 1: Foundry-free logic (pure string/number helpers, config invariants).
 *   - Tier 2: units that touch a thin slice of the Foundry surface, stubbed via
 *     tests/unit/setup.js (stub only what a unit needs).
 *
 * Document/sheet/data-model behaviour that genuinely needs Foundry stays in the
 * Playwright suite (tests/browser/) and live-Foundry MCP checks — not here.
 *
 * Plain object export (no `defineConfig` import) so the file has no package
 * subpath import for eslint's import/extensions rule to flag.
 *
 * @type {import("vitest/config").UserConfig}
 */
export default {
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.js"],
    setupFiles: ["tests/unit/setup.js"],
    coverage: {
      provider: "v8",
      include: ["src/modules/**/*.js"],
      reporter: ["text", "html"],
    },
  },
};
