import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { RUN_DIR } from "./config.mjs";

/*
 * Cross-platform runner for `npm run test:browser`.
 *
 * This was a one-line shell pipeline (env/cat/subshells/redirects) that only
 * works on a POSIX shell — on Windows npm runs scripts through cmd.exe, which
 * has none of those, so the script failed with "'env' is not recognized". Node
 * runs the same steps identically on every platform:
 *
 *   1. Build the system, capturing output to .playwright/build.log and only
 *      surfacing it if the build fails (a passing run stays quiet).
 *   2. Run Playwright with PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS removed.
 *      The Nix dev shell sets it (shell.nix); unsetting it for the run drops
 *      Playwright's "skipping host requirements" notice. Off Nix it is not set,
 *      so deleting it is a no-op.
 */

const BUILD_LOG = ".playwright/build.log";

// shell:true so the package-manager shims resolve (e.g. npx -> npx.cmd on
// Windows); harmless on POSIX. The commands contain no shell metacharacters.
const run = (command, options) =>
  spawnSync(command, { shell: true, ...options });

// Tests run against an isolated, project-local Foundry data dir — never the
// developer's real dataPath, which can carry pollution (an admin access key,
// leftover worlds, custom settings) that derails the unattended setup/login
// flow. CI provides its own throwaway FOUNDRY_DATA_PATH; honour any explicit
// value, otherwise default to .playwright/foundry-data. When we own that default
// dir we delete it (and the Foundry log) once the run finishes — see the cleanup
// at the end — so every local run is a clean, cold boot.
const ownsDataDir = !process.env.FOUNDRY_DATA_PATH;
if (ownsDataDir) {
  process.env.FOUNDRY_DATA_PATH = resolve(".playwright", "foundry-data");
}
process.stdout.write(`Foundry data dir: ${process.env.FOUNDRY_DATA_PATH}\n`);

mkdirSync(dirname(BUILD_LOG), { recursive: true });

const build = run("npx gulp build", { encoding: "utf8" });
const buildOutput = `${build.stdout ?? ""}${build.stderr ?? ""}`;
writeFileSync(BUILD_LOG, buildOutput);
if (build.status !== 0) {
  process.stderr.write(buildOutput);
  process.exit(build.status ?? 1);
}

const env = { ...process.env };
delete env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS;

// Forward any extra args (after `--`) to Playwright so a subset can be run with
// the full harness (isolated data dir, cold-boot login, cleanup) — e.g.
// `npm run test:browser -- rolls/luck.spec.mjs` or `-- -g "LUCK"`. Each arg is
// quoted so paths/patterns with spaces survive the shell:true invocation.
const forwarded = process.argv
  .slice(2)
  .map((arg) => `"${arg.replace(/"/g, '\\"')}"`)
  .join(" ");

const test = run(
  `npx playwright test -c .playwright/playwright.config.mjs${
    forwarded ? ` ${forwarded}` : ""
  }`,
  {
    stdio: "inherit",
    env,
  },
);

// On completion (pass or fail), clean up the artifacts of a local run we own:
// the isolated data dir and the auth run-state (the saved GM session gm.json and
// the Foundry server log), so nothing lingers in .playwright and the next run
// starts cold. maxRetries/retryDelay ride out Windows file locks (Foundry's
// LevelDB handles release a beat after it stops). Skipped in CI, where we don't
// own the dir and the log is kept as a job artifact.
if (ownsDataDir) {
  const retry = {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 200,
  };
  rmSync(process.env.FOUNDRY_DATA_PATH, retry);
  rmSync(RUN_DIR, retry);
}

process.exit(test.status ?? 1);
