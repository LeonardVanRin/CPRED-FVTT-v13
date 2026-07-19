# Cyberpunk RED - CORE LLM Instructions

This file provides guidance to Agents when working with code in this repository.

## What this is

A [Foundry VTT](https://foundryvtt.com) **game system** implementing the Cyberpunk RED core rules. It runs
inside Foundry's browser client. There is no standalone runtime code only executes inside a live Foundry world.

## Commands

Node is pinned via `shell.nix` (Nix dev shell, auto-loaded by direnv). Common tasks:

- `npx gulp build` (or `make build`) — compile `src/` → `dist/` and deploy into your Foundry data dir. Deploy
  target and license come from `foundryconfig.json` (git-ignored; copy `foundryconfig.json.example`).
- `npx gulp watch` (or `make watch`) — incremental rebuild on change; leave running while developing.
- `npm run lint` — ESLint over gulpfile, `src/modules`, vitest config, and unit tests.
- `npm run prettier` / `npm run prettier:fix` — format check / fix. `npm run stylelint[:fix]` — CSS.
- `npm run test:unit` — Vitest (fast, headless, no Foundry). `npm run test:unit:watch`, `test:coverage`.
  - Run one file: `npx vitest run tests/unit/config.test.js`.
- `npm run test:browser` — Playwright end-to-end against a real Foundry (see below). Run a subset:
  `npm run test:browser -- rolls/luck.spec.mjs` or `-- -g "LUCK"`.
- `npm run browser:serve` — bring Foundry up with a fresh ephemeral world and leave it running, to drive
  live via the Playwright MCP (URL is printed). Ctrl-C tears the world down.
- `make ci` / `make lint` / `make validate-packs` — run GitLab CI jobs locally via `gitlab-ci-local`
  (jobs are `include`d from the sibling `cicd` repo, not defined inline).

## Rules

- **Markdown**: after creating or editing any `.md` file (docs, specs, plans, skill `SKILL.md` files
  included), format and lint it before treating it as done — `npx prettier --write <file>` then
  `npx markdownlint --fix <file>`, hand-fixing anything left. See `.claude/skills/markdown/SKILL.md`.

## Architecture

### Entry point and registration

`src/cpr.js` is the ESM entry (declared in `src/system.json` `esmodules`, **not** `package.json`). On Foundry's
`init` hook it registers everything: actor/item sheet classes, document subclasses (`CONFIG.Actor/Item/
ChatMessage/Combat/Combatant/ActiveEffect.documentClass`), all data models, settings, Handlebars helpers, and
API. `src/modules/system/hooks.js` dynamically imports every file under `src/modules/hooks/` via a computed
`import()` — that's why `.fallowrc.json` marks that dir as `dynamicallyLoaded` (static analysis can't see it).

### Documents are proxied by type

`entity-factory.js` returns a JS `Proxy` over Foundry's base `Actor`/`Item` that intercepts `construct` and
routes to the right subclass based on `data.type` (character/mook/vehicle/… for actors;
weapon/armor/skill/cyberware/… for items). So `new Actor({type:"character"})` yields a `CPRCharacterActor`.

### Data models vs. behaviour (two parallel mixin systems)

- **Schemas** live in `src/modules/datamodels/`. Each Actor/Item type has a DataModel extending
  `CPRSystemDataModel` (`system-data-model.js`), which composes reusable schema fragments via a **mixin**
  mechanism (`SystemDataModel.mixin(...)`) — e.g. an item schema mixes in `physical`, `equippable`,
  `valuable`, `stackable`, `attackable` from `datamodels/item/mixins/`. This mirrors Foundry's old
  `template.json` templates but as composable classes. `template.json` still exists and must stay in sync.
- **Behaviour** lives in `src/modules/item/` and `src/modules/actor/`. `CPRItem` (base document) composes
  method mixins from `item/mixins/` (`cpr-attackable.js`, `cpr-loadable.js`, `cpr-container.js`, …), and
  per-type logic lives in `item/types/cpr-*.js`. Actors follow the same split (`actor/cpr-*.js` + sheets).

Adding a field to an item type usually means editing its datamodel mixin/schema **and** `template.json`, plus
possibly a migration script and the type's `.js` behaviour.

### Migrations (`src/modules/system/migrate/`)

Numbered scripts in `migrate/scripts/` (e.g. `042-add-damage-crit-config.js`) registered in `scripts/index.js`,
run by `MigrationRunner`. Any change to persisted actor/item data shape needs a new numbered migration.
`foundryconfig.json`'s `devMode.migrations` block controls dev-time re-migration behaviour.

### Compendium packs (`src/packs/`)

Source of truth is **per-entry YAML** (`src/packs/{core,other,internal}/…/*.yaml`). `npx gulp build` compiles
them into LevelDB packs in `dist/`; `npm run extractPacks` goes the other way (compiled → YAML) and also
regenerates Babele translation mappings. Edit the YAML, never the compiled packs. If you make changes to a YAML
fragment you must stop Foundry to rebuild as founry locks the LevelDB when in use.

### Localization

Every user-facing string is a localization key resolved via `SystemUtils.Localize("CPR.…")`, defined in
`src/lang/en.json` (~1300 keys; other locales via Babele/Crowdin). New UI strings must be added to `en.json`,
never to other languages, these are translated by humans on Crowdin.

## Testing

Two tiers, deliberately separated (see `vitest.config.js` header):

- **Unit (`tests/unit/`, Vitest)** — only Foundry-free logic or units touching a thin, stubbed slice of the
  Foundry surface (stubs in `tests/unit/setup.js`). Fast, CLI. Config invariants, pure string/number helpers,
  formula sanitization.
- **Browser (`tests/browser/`, Playwright)** — anything that genuinely needs a running Foundry: document/
  sheet/data-model behaviour, real rolls, migrations, drag-drop. `npm run test:browser` builds the system,
  boots Foundry against an **isolated** project-local data dir (`.playwright/foundry-data`, never your real
  `dataPath`), creates an ephemeral world, runs specs, and tears down. Harness lives in `tools/foundry-server/`.

For manual live checks, `npm run browser:serve` + the Playwright MCP.

## Environment notes

- **NixOS / Playwright**: browsers come from `shell.nix`, never `npx playwright install`. If Playwright/
  Chromium can't launch or revisions mismatch, fix `shell.nix` — see `.claude/skills/playwright/nix/SKILL.md`.
- **Git remotes**: this repo's canonical home is GitLab (`cyberpunk-red-team/fvtt-cyberpunk-red-core`); the
  default branch is `dev`.
- **Sibling repos**: the related `cyberpunk-red-team` checkouts (`dlc`, `templates`, `system`, `cicd`) live
  at developer-specific paths — never assume they sit at `../<name>`. Resolve one by reading
  `foundryconfig.json` → `repos.<name>` (git-ignored, per-developer; see `foundryconfig.json.example` for
  the shape). E.g. the GitLab issue templates are at `<repos.templates>/.gitlab/issue_templates/`.
