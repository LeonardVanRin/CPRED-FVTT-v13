import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { startServer, stopServer } from "./server.mjs";
import { driveSetup, joinAsGM } from "./setup.mjs";
import { newWorldId, removeWorld } from "./config.mjs";

/*
 * Generates the pack-validation JSON schemas (schema/*.json) by walking the
 * live Foundry DataModels. Shared structure is factored into schema/components/
 * the way the schemas were maintained by hand: one component per DataModel mixin
 * (from `_schemaTemplates`), plus the embedded ActiveEffect / RollTableResult /
 * JournalEntryPage document schemas and the `_stats` block. Each type schema
 * `$ref`s the mixins it uses (via `allOf`) and inlines only its own fields.
 *
 * Because the DataModels — and the Foundry-core embedded-document schemas — only
 * fully exist inside the Foundry runtime, the walk runs in-browser via
 * page.evaluate against a booted world. Run with `npm run generate-schemas`.
 */

const OUT_DIR = resolve("schema");
const OVERRIDES_PATH = resolve("tools/foundry-server/schema-overrides.json");

await main();

/**
 * Orchestrates generation: build the system, walk the live DataModels in a
 * booted Foundry world, layer the curated constraints on top, and write files.
 *
 * @returns {Promise<void>}
 */
async function main() {
  buildSystem();
  const result = await walkModels();
  applyOverrides(result.schemas);
  applyCuratedConstraints(result.schemas);
  writeSchemas(result);
}

/**
 * Builds the system into an isolated data dir so the booted Foundry loads it.
 */
function buildSystem() {
  process.env.FOUNDRY_DATA_PATH = resolve(".playwright", "foundry-data");
  const build = spawnSync("npx gulp build", { shell: true, encoding: "utf8" });
  if (build.status !== 0) {
    process.stderr.write(build.stdout + build.stderr);
    process.exit(build.status ?? 1);
  }
}

/**
 * Boots Foundry, joins a fresh world as GM (so the system's DataModels are
 * registered), runs the in-browser walker, and tears the world down.
 *
 * @returns {Promise<Object>} the walker result (schemas + item/actor types)
 */
async function walkModels() {
  const { child, config } = await startServer();
  const worldId = newWorldId();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await driveSetup(page, { config, worldId });
    await joinAsGM(page, config);
    return await page.evaluate(walkerSource);
  } finally {
    await browser.close();
    await stopServer(child);
    await removeWorld(config.dataPath, worldId);
  }
}

/**
 * Applies the static pack-validation overrides (schema-overrides.json) — curated
 * constraints that intentionally do NOT live in the DataModel (e.g. our content
 * uses a known set of brands, while the model leaves `brand` free for users).
 *
 * @param {Object<string, Object>} schemas - filename -> schema (mutated)
 */
function applyOverrides(schemas) {
  if (!existsSync(OVERRIDES_PATH)) return;
  const overrides = JSON.parse(readFileSync(OVERRIDES_PATH, "utf8"));
  for (const [name, patch] of Object.entries(overrides)) {
    if (schemas[name]) deepMerge(schemas[name], patch);
    else process.stderr.write(`override target not found: ${name}\n`);
  }
}

/**
 * Writes the schema map to OUT_DIR, regenerating components/ from scratch so
 * removed mixins don't leave stale files.
 *
 * @param {Object} result - the walker result (schemas + item/actor types)
 */
function writeSchemas(result) {
  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(join(OUT_DIR, "components"), { recursive: true, force: true });
  for (const [name, schema] of Object.entries(result.schemas)) {
    const out = join(OUT_DIR, name);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(schema, null, 2)}\n`);
  }
  /* eslint-disable-next-line no-console */
  console.log(
    `\nWrote ${Object.keys(result.schemas).length} schema(s) to ${OUT_DIR}\n` +
      `Item types: ${result.itemTypes.join(", ")}\n` +
      `Actor types: ${result.actorTypes.join(", ")}`,
  );
}

/**
 * Recursively merges a patch object into a target. Objects are merged; arrays
 * and primitives replace. Used to apply schema-overrides onto generated output.
 *
 * @param {Object} target - The object to mutate
 * @param {Object} patch - The patch to merge in
 * @returns {Object} target
 */
function deepMerge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

/**
 * Applies CPR curated constraints that are derived from project data/config
 * rather than the DataModel — the same spirit as schema-overrides.json, but for
 * things that must be computed (enums sourced from packs/config) or applied
 * across every document schema (shared id/key/img components). Mutates in place.
 *
 * @param {Object<string, Object>} schemas - filename -> JSON schema
 */
function applyCuratedConstraints(schemas) {
  // dvTable values are the RollTable names in the dv-tables pack ("" = melee).
  const dvNames = packNames("src/packs/internal/dv-tables");
  // weaponSkill values are CPR.skillList resolved to display names via en.json.
  const skills = skillNames();

  const att = schemas["components/attackable.json"];
  att.properties.damage = { type: "string", pattern: "(^[0-9]{1,2}d6$)|^0$" };
  att.properties.dvTable = { type: "string", enum: [...dvNames, ""] };
  att.properties.weaponSkill = { type: "string", enum: [...skills, ""] };
  att.allOf = [
    ...(att.allOf || []),
    {
      if: { properties: { isRanged: { const: true } } },
      then: { properties: { dvTable: { not: { const: "" } } } },
    },
  ];

  schemas["components/effects.json"].properties.revealed = {
    type: "boolean",
    const: true,
  };
  schemas["components/common.json"].properties.favorite = {
    type: "boolean",
    const: false,
  };
  const ld = schemas["components/loadable.json"];
  ld.properties.usesType = { type: "string", enum: ["magazine"] };
  ld.required = [...new Set([...(ld.required || []), "usesType"])];

  // A weapon must name a real skill; blank is allowed only on non-weapons.
  const ws = schemas["weapon.json"].properties.system;
  ws.properties = ws.properties || {};
  ws.properties.weaponSkill = { type: "string", enum: skills };
  const cw = schemas["cyberware.json"].properties.system;
  cw.allOf = [
    ...(cw.allOf || []),
    {
      if: { properties: { isWeapon: { const: true } } },
      then: { properties: { weaponSkill: { enum: skills } } },
    },
  ];

  // Shared document-level components (curated patterns the model can't express).
  schemas["components/img.json"] = {
    description: "The image for an item",
    type: "string",
    oneOf: [
      {
        description: "Matching for our own compendia icons",
        type: "string",
        pattern:
          "^systems\\/cyberpunk-red-core\\/icons\\/.*(\\.png|\\.svg|\\.webp$)",
      },
      {
        description: "Matching for icons provided by the DLC module",
        type: "string",
        pattern: "^modules\\/cyberpunk-red-dlc\\/.*(\\.png|\\.svg|\\.webp$)",
      },
      {
        description: "Matching for using icons provided by foundry",
        type: "string",
        pattern: "^icons\\/.*(\\.png|\\.svg|\\.webp$)",
      },
    ],
  };
  schemas["components/id.json"] = {
    description: "A Foundry document id",
    type: "string",
    pattern: "^[0-9a-zA-Z]{16}$",
  };
  schemas["components/key.json"] = {
    description: "A compendium LevelDB key",
    type: "string",
    oneOf: [
      { pattern: "^!(items|scenes|tables|macros)![0-9a-zA-Z]{16}$" },
      {
        pattern:
          "^!(items|scenes|tables|macros)\\.(effects|results)![0-9a-zA-Z]{16}\\.[0-9a-zA-Z]{16}$",
      },
    ],
  };
  for (const [name, s] of Object.entries(schemas)) {
    if (name.includes("/") || !s.properties) continue; // document schemas only
    if (s.properties.img) s.properties.img = { $ref: "./components/img.json" };
    if (s.properties._id) s.properties._id = { $ref: "./components/id.json" };
    if (s.properties._key)
      s.properties._key = { $ref: "./components/key.json" };
  }
}

/**
 * Reads each YAML fragment's top-level `name:` from a pack directory.
 *
 * @param {string} dir - pack fragment directory
 * @returns {string[]} sorted unique names
 */
function packNames(dir) {
  const out = new Set();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".yaml")) continue;
    const m = readFileSync(join(dir, f), "utf8").match(/^name:\s*(.+?)\s*$/m);
    if (m) out.add(m[1].replace(/^["']|["']$/g, ""));
  }
  return [...out].sort();
}

/**
 * Derives the weaponSkill display-name list from CPR.skillList, resolved through
 * en.json. Untranslated entries (non-skill categories) are dropped with a
 * warning, so any item referencing them fails validation.
 *
 * @returns {string[]} sorted unique skill names
 */
function skillNames() {
  const cfg = readFileSync("src/modules/system/config.js", "utf8");
  const blk = cfg.match(/CPR\.skillList\s*=\s*\{([\s\S]*?)\n\};/)[1];
  const en = JSON.parse(readFileSync("src/lang/en.json", "utf8"));
  const out = new Set();
  for (const m of blk.matchAll(/^\s*([A-Za-z0-9_]+):\s*"([^"]+)"/gm)) {
    const name = en[m[2]];
    if (name == null) {
      process.stderr.write(
        `weaponSkill: no translation for skill '${m[1]}' (${m[2]}) — dropped\n`,
      );
      continue;
    }
    out.add(name);
  }
  return [...out].sort();
}

/**
 * Runs inside the Foundry world. Walks the registered DataModels into JSON
 * Schema, factoring shared structure into schema/components/ (one per mixin,
 * plus the embedded document schemas and `_stats`) and `$ref`ing them from each
 * type schema. Returns a map of relative path -> schema.
 */
function walkerSource() {
  const F = foundry.data.fields;
  // Fragments are complete Foundry documents, so nothing is excluded.
  const STRIPPED = [];
  const KEY_SCHEMA = { type: "string", pattern: "^!" };
  // Embedded document class -> component filename (without extension).
  const DOC_COMPONENT = {
    ActiveEffect: "effect",
    TableResult: "result",
    RollTableResult: "result",
    JournalEntryPage: "page",
  };

  function choicesOf(field) {
    let ch = field.choices;
    if (typeof ch === "function") {
      try {
        ch = ch();
      } catch {
        return null;
      }
    }
    if (!ch) return null;
    return Array.isArray(ch) ? ch : Object.keys(ch);
  }

  function nullable(type, field) {
    return field.nullable ? [type, "null"] : type;
  }

  // A field can be required:true and still have an initial — required means the
  // key must be present in the (complete) fragment, which it always is.
  function isRequired(field) {
    return Boolean(field.required);
  }

  // Converts a DataField to JSON Schema. `refBase` is the relative prefix used
  // for component `$ref`s (e.g. "./components/" from a type file, "./" from
  // within a component). The `_stats` block and embedded collections become
  // `$ref`s to shared components.
  // `lenient` (used for Foundry-core embedded docs) keeps structural type-checks
  // but drops version-brittle value constraints (enum/min/max).
  function fieldToSchema(field, refBase, lenient = false) {
    if (field instanceof F.EmbeddedDataField && field.model?.schema) {
      return fieldToSchema(field.model.schema, refBase, lenient);
    }
    if (field instanceof F.SchemaField || field.fields) {
      const out = {
        type: nullable("object", field),
        additionalProperties: false,
        properties: {},
        required: [],
      };
      for (const [key, sub] of Object.entries(field.fields)) {
        out.properties[key] =
          key === "_stats"
            ? { $ref: `${refBase}stats.json` }
            : fieldToSchema(sub, refBase, lenient);
        if (isRequired(sub)) out.required.push(key);
      }
      if (!out.required.length) delete out.required;
      return out;
    }
    if (field instanceof F.EmbeddedCollectionField) {
      const comp = DOC_COMPONENT[field.model?.documentName];
      if (comp)
        return { type: "array", items: { $ref: `${refBase}${comp}.json` } };
      return {
        type: "array",
        items: field.model ? embeddedDoc(field.model, refBase) : {},
      };
    }
    if (field instanceof F.SetField) {
      const out = { type: nullable("array", field), uniqueItems: true };
      if (field.element)
        out.items = fieldToSchema(field.element, refBase, lenient);
      return out;
    }
    if (field instanceof F.ArrayField) {
      const out = { type: nullable("array", field) };
      if (field.element)
        out.items = fieldToSchema(field.element, refBase, lenient);
      return out;
    }
    if (field instanceof F.NumberField) {
      const out = {
        type: nullable(field.integer ? "integer" : "number", field),
      };
      if (!lenient) {
        const enums = choicesOf(field);
        if (enums) out.enum = enums;
        if (field.min != null) out.minimum = field.min;
        if (field.max != null) out.maximum = field.max;
      }
      return out;
    }
    if (field instanceof F.BooleanField) return { type: "boolean" };
    if (field instanceof F.StringField) {
      const out = { type: nullable("string", field) };
      if (!lenient) {
        const enums = choicesOf(field);
        if (enums) {
          if (field.blank && !enums.includes("")) enums.push("");
          out.enum = enums;
        }
      }
      return out;
    }
    if (field instanceof F.ObjectField) {
      return { type: nullable("object", field) };
    }
    return {};
  }

  // The fragment schema for an embedded Foundry-core document
  // (effect/result/page): its document schema plus the `_key` packs add. These
  // are owned and migrated by Foundry (their shape changes between versions and
  // the packed source lags until load-time migration), so we type-check the
  // known fields but tolerate legacy/extra ones rather than reject migratable
  // data — unlike the system's own data, which stays strict.
  function embeddedDoc(DocCls, refBase = "./") {
    const base = fieldToSchema(DocCls.schema, refBase, true);
    base.properties._key = KEY_SCHEMA;
    base.additionalProperties = true;
    return base;
  }

  // Walks a plain object of DataFields (a mixin's defineSchema) into an object
  // schema. No `additionalProperties` so it composes under `allOf`.
  function fieldsToObject(fields, refBase) {
    const props = {};
    const required = [];
    for (const [key, sub] of Object.entries(fields)) {
      props[key] =
        key === "_stats"
          ? { $ref: `${refBase}stats.json` }
          : fieldToSchema(sub, refBase);
      if (isRequired(sub)) required.push(key);
    }
    const out = { type: "object", properties: props };
    if (required.length) out.required = required;
    return out;
  }

  const schemas = {};

  // --- Shared components: embedded docs + _stats ---
  schemas["components/effect.json"] = embeddedDoc(
    CONFIG.ActiveEffect.documentClass,
  );
  const resultModel =
    CONFIG.RollTable?.documentClass.schema.fields.results?.model;
  if (resultModel) schemas["components/result.json"] = embeddedDoc(resultModel);
  const pageModel =
    CONFIG.JournalEntry?.documentClass.schema.fields.pages?.model;
  if (pageModel) schemas["components/page.json"] = embeddedDoc(pageModel);
  // `_stats` is a generated provenance block (a controlled subset of Foundry's
  // DocumentStatsField, which varies by version): its presence is required at
  // the document level, but its internals are not policed.
  schemas["components/stats.json"] = { type: "object" };

  // --- Mixin components (one per unique mixin across all models) ---
  const mixinDefs = {}; // mixinName -> defineSchema() fields object
  function collectMixins(model) {
    for (const template of model._schemaTemplates || []) {
      if (!template.mixinName || mixinDefs[template.mixinName]) continue;
      try {
        mixinDefs[template.mixinName] = template.defineSchema();
      } catch {
        // Some templates need arguments; their fields fall through to "own".
      }
    }
  }
  for (const model of Object.values(CONFIG.Item.dataModels))
    collectMixins(model);
  for (const model of Object.values(CONFIG.Actor.dataModels))
    collectMixins(model);

  // Signature of each mixin field (in a type file's ref context) so we can tell
  // when a model uses a mixin's field unchanged vs overrides it.
  const mixinSig = {};
  for (const [name, fields] of Object.entries(mixinDefs)) {
    schemas[`components/${name}.json`] = fieldsToObject(fields, "./");
    mixinSig[name] = {};
    for (const [key, sub] of Object.entries(fields)) {
      mixinSig[name][key] = JSON.stringify(
        key === "_stats"
          ? { $ref: "./components/stats.json" }
          : fieldToSchema(sub, "./components/"),
      );
    }
  }

  // System schema: allOf the mixins the model uses unchanged, plus its own
  // (or overridden) fields inlined.
  function systemSchema(model) {
    const fields = model.schema.fields;
    const used = [];
    const covered = new Set();
    for (const name of model.mixins || []) {
      const sigs = mixinSig[name];
      if (!sigs) continue;
      const fullyUnchanged = Object.entries(sigs).every(([key, sig]) => {
        if (!(key in fields)) return false;
        const actual = JSON.stringify(
          key === "_stats"
            ? { $ref: "./components/stats.json" }
            : fieldToSchema(fields[key], "./components/"),
        );
        return actual === sig;
      });
      if (fullyUnchanged) {
        used.push(name);
        Object.keys(sigs).forEach((key) => covered.add(key));
      }
    }
    const ownProps = {};
    const ownReq = [];
    for (const [key, sub] of Object.entries(fields)) {
      if (covered.has(key)) continue;
      ownProps[key] =
        key === "_stats"
          ? { $ref: "./components/stats.json" }
          : fieldToSchema(sub, "./components/");
      if (isRequired(sub)) ownReq.push(key);
    }
    const sys = { type: "object" };
    if (used.length)
      sys.allOf = used.map((n) => ({ $ref: `./components/${n}.json` }));
    if (Object.keys(ownProps).length) {
      sys.properties = ownProps;
      if (ownReq.length) sys.required = ownReq;
    }
    // Strict only when nothing is composed (allOf precludes additionalProperties
    // in draft-07).
    if (!used.length) sys.additionalProperties = false;
    return sys;
  }

  // Full pack-fragment schema for a document type.
  function documentSchema(
    DocCls,
    { typeConst = null, systemModel = null } = {},
  ) {
    const props = { _key: KEY_SCHEMA };
    const required = ["_key"];
    for (const [key, field] of Object.entries(DocCls.schema.fields)) {
      if (STRIPPED.includes(key)) continue;
      if (key === "system" && systemModel) {
        props.system = systemSchema(systemModel);
        required.push("system");
        continue;
      }
      if (key === "type" && typeConst) {
        props.type = { type: "string", const: typeConst };
        required.push("type");
        continue;
      }
      if (key === "_stats") {
        // `_stats` is stamped only when compiling packs, so it is allowed but
        // not required in the source fragments.
        props._stats = { $ref: "./components/stats.json" };
        continue;
      }
      props[key] = fieldToSchema(field, "./components/");
      if (isRequired(field)) required.push(key);
    }
    return {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      // System documents (items/actors) are strict; Foundry-core documents
      // (table/macro/scene/journal) may carry module/version fields, so allow
      // extra top-level keys.
      additionalProperties: !systemModel,
      properties: props,
      required: [...new Set(required)].sort(),
    };
  }

  const itemTypes = Object.keys(CONFIG.Item.dataModels);
  const actorTypes = Object.keys(CONFIG.Actor.dataModels);

  for (const type of itemTypes) {
    schemas[`${type}.json`] = documentSchema(CONFIG.Item.documentClass, {
      typeConst: type,
      systemModel: CONFIG.Item.dataModels[type],
    });
  }
  for (const type of actorTypes) {
    schemas[`actor.${type}.json`] = documentSchema(CONFIG.Actor.documentClass, {
      typeConst: type,
      systemModel: CONFIG.Actor.dataModels[type],
    });
  }

  const coreDocs = {
    "table.json": CONFIG.RollTable?.documentClass,
    "macro.json": CONFIG.Macro?.documentClass,
    "scene.json": CONFIG.Scene?.documentClass,
    "journal.json": CONFIG.JournalEntry?.documentClass,
  };
  for (const [name, DocCls] of Object.entries(coreDocs)) {
    if (DocCls) schemas[name] = documentSchema(DocCls);
  }

  return { schemas, itemTypes, actorTypes };
}
