import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/**
 * Tier-1 structural guard over the migration registry. It reads the registry as *source text*
 * (never `import`ing a migration script, `index.js`, or `migration.js` — those drag in Foundry
 * globals and would break the Foundry-free unit tier). Paths resolve relative to this file via
 * `import.meta.url`, so the test is CWD-independent and needs nothing from `setup.js`.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.join(HERE, "../../src/modules/system/migrate/scripts");
const MIGRATION_JS = path.join(
  HERE,
  "../../src/modules/system/migrate/migration.js",
);

// Strip `//` line comments so commented-out `export`/`static version`/`#LATEST_VERSION`
// lines cannot be mistaken for real declarations. Truncating from `//` to end-of-line also
// eats any trailing inline comment; the patterns we match never legitimately contain `//`.
const stripLineComments = (source) =>
  source
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");

// Every `NNN-*.js` entry in the scripts dir (index.js excluded) is a migration script file.
const scriptFiles = fs
  .readdirSync(SCRIPTS_DIR)
  .filter((file) => file !== "index.js" && /^\d+-.*\.js$/.test(file))
  .sort();

// The registered set: each genuine `export { ... } from "./NNN-something.js";` in index.js.
// Anchored to a real `export { ... } from` statement (not a bare import) and matched against
// comment-stripped source, so a commented-out export line does NOT count as registered.
const indexSource = stripLineComments(
  fs.readFileSync(path.join(SCRIPTS_DIR, "index.js"), "utf8"),
);
const registeredFiles = [
  ...indexSource.matchAll(/export\s*\{[^}]*\}\s*from\s+"\.\/([^"]+\.js)"/g),
].map((match) => match[1]);

// Parse every non-comment `static version = <int>;` from a script file. Exactly one is valid;
// zero or many are defects surfaced by invariants 4 and 5 (never silently skipped/mis-parsed).
const readVersions = (file) => {
  const source = stripLineComments(
    fs.readFileSync(path.join(SCRIPTS_DIR, file), "utf8"),
  );
  return [...source.matchAll(/static\s+version\s*=\s*(\d+)\s*;/g)].map(
    (match) => Number(match[1]),
  );
};

const migrations = scriptFiles.map((file) => {
  const versionMatches = readVersions(file);
  return {
    file,
    prefix: file.match(/^(\d+)-/)[1],
    versionMatches,
    // Only an unambiguous single match is a usable version; otherwise null flags the defect.
    version: versionMatches.length === 1 ? versionMatches[0] : null,
  };
});

// Group filenames by a key; return only the values that collide (for clear failure messages).
const duplicatesBy = (keyFn) => {
  const seen = new Map();
  migrations.forEach((migration) => {
    const key = keyFn(migration);
    seen.set(key, [...(seen.get(key) ?? []), migration.file]);
  });
  return [...seen.entries()].filter(([, files]) => files.length > 1);
};

describe("migration registry guards", () => {
  it("invariant 1: every script file is registered and every export resolves to a file", () => {
    const scriptSet = new Set(scriptFiles);
    const registeredSet = new Set(registeredFiles);

    const missingFromRegistry = scriptFiles.filter(
      (file) => !registeredSet.has(file),
    );
    const danglingExports = registeredFiles.filter(
      (file) => !scriptSet.has(file),
    );

    expect(
      missingFromRegistry,
      `invariant 1 broken: script file(s) not registered in index.js: ${missingFromRegistry.join(", ")}`,
    ).toEqual([]);
    expect(
      danglingExports,
      `invariant 1 broken: index.js export(s) with no matching file: ${danglingExports.join(", ")}`,
    ).toEqual([]);
  });

  it("invariant 2: no two script files share the same static version", () => {
    const collisions = duplicatesBy((migration) => migration.version);
    expect(
      collisions,
      `invariant 2 broken: duplicate static version: ${collisions
        .map(([version, files]) => `${version} -> ${files.join(", ")}`)
        .join("; ")}`,
    ).toEqual([]);
  });

  it("invariant 3: no two script files share the same numeric filename prefix", () => {
    const collisions = duplicatesBy((migration) => migration.prefix);
    expect(
      collisions,
      `invariant 3 broken: duplicate filename prefix: ${collisions
        .map(([prefix, files]) => `${prefix} -> ${files.join(", ")}`)
        .join("; ")}`,
    ).toEqual([]);
  });

  it("invariant 4: each script file's numeric prefix equals its static version", () => {
    migrations.forEach((migration) => {
      // Robustness: exactly one parseable `static version` per script. Zero or many (e.g. a
      // stray/commented example above the real one) is itself a defect, never silently skipped.
      expect(
        migration.versionMatches.length,
        `invariant 4 broken: ${migration.file} must have exactly one parseable "static version = <int>;" (found ${migration.versionMatches.length})`,
      ).toBe(1);
      expect(
        migration.version,
        `invariant 4 broken: ${migration.file} prefix ${migration.prefix} !== static version ${migration.version}`,
      ).toBe(Number(migration.prefix));
    });
  });

  it("invariant 5: migration.js #LATEST_VERSION equals the max registered static version", () => {
    // Match against comment-stripped source so a commented-out `#LATEST_VERSION` is ignored.
    const latestSource = stripLineComments(
      fs.readFileSync(MIGRATION_JS, "utf8"),
    );
    const latestMatch = latestSource.match(
      /static\s+#LATEST_VERSION\s*=\s*(\d+)\s*;/,
    );
    expect(
      latestMatch,
      `invariant 5 broken: migration.js has no parseable "static #LATEST_VERSION = <int>;"`,
    ).not.toBeNull();

    const latestVersion = Number(latestMatch[1]);
    const registeredSet = new Set(registeredFiles);
    const registeredMigrations = migrations.filter((migration) =>
      registeredSet.has(migration.file),
    );

    // Guard the Math.max below: an empty set (nothing to compare) or an unparseable version
    // (null) must fail loudly, never silently yield -Infinity or a coerced 0.
    const unparseable = registeredMigrations
      .filter((migration) => migration.version === null)
      .map((migration) => migration.file);
    expect(
      unparseable,
      `invariant 5 broken: registered script(s) without a single parseable "static version = <int>;": ${unparseable.join(", ")}`,
    ).toEqual([]);
    expect(
      registeredMigrations.length,
      `invariant 5 broken: no registered migration versions found to compare against #LATEST_VERSION`,
    ).toBeGreaterThan(0);

    const registeredVersions = registeredMigrations.map(
      (migration) => migration.version,
    );
    const maxVersion = Math.max(...registeredVersions);

    expect(
      latestVersion,
      `invariant 5 broken: #LATEST_VERSION ${latestVersion} !== max registered static version ${maxVersion}`,
    ).toBe(maxVersion);
  });
});
