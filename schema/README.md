[README.md](https://github.com/user-attachments/files/30165534/README.md)
# Pack-validation schemas

These JSON Schema files validate the YAML pack fragments under `src/packs/**`.
The `packs` CI job runs [`v8r`](https://github.com/chris48s/v8r) against them (see
`.v8rrc.yaml`), so our shipped compendium content stays well-formed. They mirror
the system's DataModels.

> [!IMPORTANT]
> **Do not hand-edit these files — they are generated.** Edits will be lost on
> the next regeneration. To change validation, change the DataModel, the
> generator, or the overrides (see below) and regenerate.

## Layout

- `schema/<type>.json` — one per item/actor type (`weapon.json`,
  `actor.character.json`, …) and per core document (`scene.json`,
  `journal.json`, …).
- `schema/components/<name>.json` — shared fragments: one per DataModel **mixin**
  (`physical.json`, `attackable.json`, …), plus the embedded document schemas
  (`effect.json`, `result.json`, `page.json`), the `stats.json` block, and the
  curated `img.json` / `id.json` / `key.json`.

Each type schema `$ref`s the mixins it uses (via `allOf`) and inlines only its
own fields.

## Generation

```sh
npm run generate-schemas
```

`tools/foundry-server/generate-schemas.mjs` builds the system into an isolated
Foundry data dir, boots Foundry, and walks the live DataModels **in-browser**
(the models — and Foundry's core embedded-document schemas — only fully exist at
runtime). It then layers on the curated constraints and writes the whole
`schema/` tree, regenerating `components/` from scratch. Regeneration is rare
(only when the DataModels change); the generated files are committed.

## Curated constraints (overrides)

The DataModels cannot express every rule we want to validate — for example, our
content uses a known set of brands, while the model leaves `brand` free for
users to type anything. These pack-validation-only constraints are applied
**after** the DataModel walk, in two places:

1. **`tools/foundry-server/schema-overrides.json`** — static deep-merges keyed
   by output filename. Use this for fixed constraints, e.g. the `brand` enum on
   `components/physical.json`.
2. **`applyCuratedConstraints()` in `generate-schemas.mjs`** — for constraints
   that are *computed* from project data/config (so they stay in sync with a
   single source of truth), or that apply across every document schema:
   - `dvTable` enum — derived from the RollTable names in
     `src/packs/internal/dv-tables` (plus `""` for melee).
   - `weaponSkill` enum — derived from `CPR.skillList` resolved through
     `src/lang/en.json`; untranslated entries are dropped with a warning, so an
     item referencing one fails validation.
   - `damage` / `_id` / `_key` / `img` patterns, `revealed` / `favorite`
     consts, the `usesType` enum, and the `isRanged` / `isWeapon` conditionals.
   - `img` / `_id` / `_key` are shared `components/` referenced by every
     document schema.

When you need a new curated constraint, add it in one of those two places —
prefer sourcing enum values from `config.js` or the packs over hardcoding — then
regenerate. Never edit the generated files directly.
