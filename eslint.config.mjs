import js from "@eslint/js";
import globals from "globals";
import importX from "eslint-plugin-import-x";
import prettierRecommended from "eslint-plugin-prettier/recommended";

export default [
  {
    ignores: ["dist/**"],
  },
  js.configs.recommended,
  {
    plugins: {
      // Registered under the legacy "import" namespace so existing rule names
      // and inline `eslint-disable import/*` directives keep working.
      import: importX,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        // Foundry VTT globals
        $: "readonly",
        ActiveEffect: "readonly",
        ActiveEffectConfig: "readonly",
        Actor: "readonly",
        Actors: "readonly",
        ActorSheet: "readonly",
        Babele: "readonly",
        CONFIG: "readonly",
        CONST: "readonly",
        ChatMessage: "readonly",
        Combat: "readonly",
        Combatant: "readonly",
        ContextMenu: "readonly",
        Dialog: "readonly",
        DocumentSheetConfig: "readonly",
        Folder: "readonly",
        FormApplication: "readonly",
        FormDataExtended: "readonly",
        Handlebars: "readonly",
        Hooks: "readonly",
        ImagePopout: "readonly",
        Item: "readonly",
        Items: "readonly",
        ItemSheet: "readonly",
        Macro: "readonly",
        Roll: "readonly",
        Ruler: "readonly",
        Scene: "readonly",
        TextEditor: "readonly",
        TokenDocument: "readonly",
        canvas: "readonly",
        dragRuler: "readonly",
        duplicate: "readonly",
        foundry: "readonly",
        fromUuid: "readonly",
        fromUuidSync: "readonly",
        game: "readonly",
        getProperty: "readonly",
        hasProperty: "readonly",
        isNewerVersion: "readonly",
        loadTemplates: "readonly",
        mergeObject: "readonly",
        parseUuid: "readonly",
        randomID: "readonly",
        renderTemplate: "readonly",
        saveDataToFile: "readonly",
        setProperty: "readonly",
        ui: "readonly",
      },
    },
    settings: {
      "import/extensions": [".js"],
    },
    linterOptions: {
      // Flag inline eslint-disable directives that no longer suppress anything
      // so stale suppressions get cleaned up rather than lingering.
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "no-warning-comments": ["warn", { terms: ["TODO"] }],
      "no-useless-assignment": "error",
      "import/no-cycle": ["error"],
      "import/no-unresolved": ["error", { ignore: [".*devMode\\.js$"] }],
      "no-underscore-dangle": "off",
      "no-param-reassign": ["error"],
      "class-methods-use-this": ["error"],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-nested-ternary": "off",
      "no-restricted-syntax": [
        "error",
        {
          selector: "ForInStatement",
          message:
            "for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.",
        },
        {
          selector: "LabeledStatement",
          message:
            "Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.",
        },
        {
          selector: "WithStatement",
          message:
            "`with` is disallowed in strict mode because it makes code impossible to predict and optimize.",
        },
      ],
      "import/extensions": ["error", "always"],
    },
  },
  prettierRecommended,
  {
    // Migration scripts override updateItem/updateActor to transform a passed
    // document and legitimately never reference `this`. Disable the rule for
    // the whole directory rather than annotating every script.
    files: ["src/modules/system/migrate/scripts/**/*.js"],
    rules: {
      "class-methods-use-this": "off",
    },
  },
];
