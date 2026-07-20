[SKILL.md](https://github.com/user-attachments/files/30197536/SKILL.md)
---
name: migrations
description: Rules for authoring and maintaining data-model migrations in this system — the registry invariants (never dropped, always run, unique index), the numbered-script + index.js registration model, the #LATEST_VERSION contract, and the unit guard that enforces them. Use when adding, editing, renumbering, or reviewing any migration under src/modules/system/migrate/scripts/.
---

# Migration authoring & registry integrity

Persisted actor/item/world data has a **data-model version**. When a world opens
on a newer system, `MigrationRunner` runs every migration whose version is newer
than the world's, in version order, to bring the data up to date. A migration
that is mis-numbered, unregistered, or duplicated corrupts that process silently
— so the registry obeys three invariants, guarded by a unit test.

## The three invariants (never break these)

1. **Migrations are never dropped.** Every migration that ships must stay
   reachable by the runner. Removing or un-registering one means worlds that
   needed it never get it.
2. **All migrations run.** A migration in range must actually execute — it must
   be registered and within `#LATEST_VERSION`.
3. **Every migration has a unique index.** No two migrations share a number.

Two tighter rules make "the index" unambiguous and are enforced alongside the
three above:

- **Filename prefix == `static version`.** `NNN-foo.js` must declare
  `static version = NNN`. The filename number and the runtime version are one
  fact, never two that can drift.
- **`#LATEST_VERSION` == the highest registered version.** The newest migration
  is always in range and therefore always runs.

## How the registry works

- Migration scripts live in `src/modules/system/migrate/scripts/` as
  numbered files: `NNN-short-name.js` (zero-padded three-digit prefix).
- Each extends `BaseMigrationScript` (`../base-migration-script.js`) and declares
  a `static version = NNN;` and `static name`.
- **`scripts/index.js` is the registry.** `MigrationRunner.filterMigrationClasses()`
  builds the run list from `Object.values(Migrations)` — i.e. **only what
  `index.js` exports** — keeping those whose `static version` is newer than the
  world's and not past `#LATEST_VERSION`, sorted by version. So:
  - a file **not** exported in `index.js` can never run (invariant 1/2);
  - two exported migrations with the **same** `static version` sort in undefined
    order (invariant 3);
  - a `static version` above `#LATEST_VERSION` never enters range (invariant 2/5).
- `#LATEST_VERSION` is the private static in
  `src/modules/system/migrate/migration.js`.

## Adding a migration (checklist)

1. Create `src/modules/system/migrate/scripts/NNN-your-name.js`, where `NNN` is
   the next unused number (one above the current highest). Copy a recent script
   for shape.
2. Extend `BaseMigrationScript`; set `static version = NNN;` (matching the
   filename prefix) and a descriptive `static name`.
3. Override `documentFilters` to the item/actor types you touch (be explicit),
   and implement `updateItem` / `updateActor` / `migrateMisc` as needed.
4. **Add an export line to `scripts/index.js`:**
   `export { default as YourName } from "./NNN-your-name.js";`
5. **Bump `#LATEST_VERSION` in `migration.js` to `NNN`.**
6. If the shape of persisted data changed, keep `template.json` and the relevant
   datamodel schema in sync (see the repo `CLAUDE.md` architecture notes).
7. Run the guard and the rest of the suite (below), then test the migration in a
   real world.

**Never** reuse or renumber an already-shipped version, and never leave a
never-run duplicate file on disk. If you supersede a migration, delete the old
file — do not leave an orphan (that is exactly the `040` collision this guard was
born from: `040-remove-unused-install-flag.js`, a never-registered duplicate of
the registered `041`, sat on disk sharing prefix `040` with `040-ammo-icons.js`).

## The guard

`tests/unit/migration-registry-guard.test.js` (Vitest, Tier-1, Foundry-free)
enforces all five rules by reading the registry as **source text** — it does not
import any migration module. It fails CI if any migration file is unregistered or
dangling, any `static version` or filename prefix is duplicated, any prefix ≠
version, or `#LATEST_VERSION` ≠ the max registered version. It also fails loudly
if a script's `static version` cannot be parsed.

Run it:

```sh
npm run test:unit
# or just this file:
npx vitest run tests/unit/migration-registry-guard.test.js
```

If the guard goes red, fix the registry — do not weaken the guard. When the guard
changes, prove it still catches regressions by planting a violation (e.g. a
duplicate-prefix file, or a commented-out export) and confirming it fails, then
revert.

## Out of scope

Runtime de-duplication or collision recovery inside `MigrationRunner` — the guard
is a build-time/CI check, not a runtime safety net.
