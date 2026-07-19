/** @type {import("stylelint").Config} */
export default {
  extends: ["stylelint-config-standard"],
  rules: {
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: ["define-mixin", "mixin"],
      },
    ],
    // Disallow color definitions outside of variables.css
    "color-named": "never",
    // Disallow color definitions outside of variables.css
    "color-no-hex": true,
    "declaration-block-no-redundant-longhand-properties": null,
    // Disallow color definitions outside of variables.css
    "function-disallowed-list": [
      "rgb",
      "rgba",
      "hsl",
      "hsla",
      "hwb",
      "lab",
      "lch",
      "oklab",
      "oklch",
      "color",
    ],
    "nesting-selector-no-missing-scoping-root": [
      true,
      {
        ignoreAtRules: ["define-mixin"],
      },
    ],
    "no-descending-specificity": null,
    "selector-class-pattern": null,
    // Disallow absolute length units
    "unit-disallowed-list": ["cm", "mm", "Q", "in", "pc", "pt", "px"],
  },
  overrides: [
    {
      files: ["src/css/compatability/foundry/pause-animation.css"],
      rules: {
        // Allow use of px in the pause animation as this shouldn't scale
        // with the rest of the UI
        "unit-disallowed-list": ["cm", "mm", "Q", "in", "pc", "pt"],
      },
    },
    {
      // Allow colors only in variables/
      files: ["src/css/variables/*.css", "src/css/variables/**/*.css"],
      rules: {
        "color-no-hex": null,
        "function-disallowed-list": null,
      },
    },
  ],
};
