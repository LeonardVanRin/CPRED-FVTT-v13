/**
 * Minimal Foundry-global shim for Tier-2 unit tests.
 *
 * Most of the system references Foundry globals that don't exist in bare Node.
 * This stubs only the thin slice that Foundry-light units touch at import or call
 * time — `game` (i18n/settings/system), `CONFIG`, `Hooks`, `foundry.utils`. Grow
 * it as more modules come under test, but keep it minimal and predictable: a unit
 * that needs a lot of Foundry surface belongs in the Playwright/live-Foundry layer,
 * not here.
 */
globalThis.Hooks = {
  on() {},
  once() {},
  call() {},
  callAll() {},
};

globalThis.CONFIG = {};

globalThis.game = {
  system: { id: "cyberpunk-red-core" },
  settings: {
    get() {
      return false;
    },
    set() {},
    register() {},
  },
  i18n: {
    // Echo the key so Localize is deterministic; substitute {placeholders} for Format.
    localize: (key) => key,
    format: (key, data = {}) =>
      key.replace(/\{(\w+)\}/g, (_match, k) =>
        k in data ? String(data[k]) : `{${k}}`,
      ),
  },
};

globalThis.foundry = {
  utils: {
    mergeObject: (a, b) => ({ ...a, ...b }),
    duplicate: (o) => JSON.parse(JSON.stringify(o)),
  },
};
