import { defineConfig, devices } from "@playwright/test";
import {
  resolveConfig,
  STORAGE_STATE,
} from "../tools/foundry-server/config.mjs";

// Resolve the port/url the same way the launcher does so baseURL always matches
// the server setup starts. resolveConfig() throws if appPath/dataPath are
// unset, which is the correct early failure for an unconfigured checkout.
const { url } = resolveConfig();

export default defineConfig({
  // This config lives in .playwright/, so paths are relative to that dir.
  testDir: "../tests/browser",
  // Keep on-disk artifacts here in .playwright/ (RUN_DIR in
  // tools/foundry-server/config.mjs and the MCP outputDir do the same).
  outputDir: "./test-results",
  // One Foundry server + one world is shared by every spec, so tests cannot run
  // in parallel against it.
  fullyParallel: false,
  workers: 1,
  // Generous backstops; the tests themselves finish in a few seconds, so hitting
  // either timeout means a genuine hang, not a slow test.
  timeout: 120000,
  expect: { timeout: 15000 },
  // setup launches Foundry, drives the gates, creates+launches the
  // ephemeral world and saves the GM auth state; teardown stops Foundry
  // (releasing LevelDB locks) and deletes the world.
  globalSetup: "../tests/browser/setup.mjs",
  globalTeardown: "../tests/browser/teardown.mjs",
  // In CI (GitLab): a readable list in the job log, plus a blob report so the
  // parallel shards can be merged downstream. The suite is sharded across
  // several `test-browser` jobs (`--shard=i/N`); each shard emits its own blob,
  // and a later `test-browser-report` job runs `playwright merge-reports` to
  // regenerate a single JUnit (for GitLab's Tests tab / `artifacts:reports:junit`)
  // and JSON (for the MR-comment failed-test table) across all shards. Locally:
  // list.
  reporter: process.env.CI
    ? [["list"], ["blob", { outputDir: "blob-report" }]]
    : "list",
  use: {
    baseURL: url,
    storageState: STORAGE_STATE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // CI runs as root, where Chromium's setuid sandbox can't start; the board
    // canvas is disabled anyway, so dropping the sandbox is safe here.
    chromiumSandbox: false,
  },
  projects: [
    // Foundry's UI needs at least 1920x1080 — the device preset defaults to
    // 1280x720, which is too small (it parks the docked sidebar/dialogs awkwardly
    // and can push controls off-canvas). Override the viewport after the device
    // spread so it takes precedence.
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
});
