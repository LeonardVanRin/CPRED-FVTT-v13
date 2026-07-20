import path from "node:path";
import postcss from "postcss";
import postcssImport from "postcss-import";
import postcssMixins from "postcss-mixins";
import postcssNested from "postcss-nested";
import autoprefixer from "autoprefixer";
import fs from "fs-extra";
import log from "./utils/logger.mjs";
import { FileUtils } from "./utils/FileUtils.mjs";

/**
 * Builds the PostCSS processor used to compile the project's CSS. The plugin
 * order is significant: imports are inlined first, then mixins expanded,
 * nested rules flattened, and finally vendor prefixes added.
 *
 * @private
 * @returns {import("postcss").Processor} Configured PostCSS processor
 */
function _buildProcessor() {
  return postcss([
    postcssImport(),
    postcssMixins(),
    postcssNested(),
    autoprefixer(),
  ]);
}

/**
 * Compiles the configured CSS entry file through the PostCSS pipeline and
 * writes the bundled result to the build directory. The entry file is
 * expected to `@import` the rest of the project's CSS so a single bundle is
 * produced.
 *
 * @private
 * @param {Object} config - Build configuration object
 * @returns {Promise<void>}
 */
async function _compile(config) {
  const entry = path.join(config.srcDirPath, config.css.entry);
  const out = path.join(config.buildDirPath, config.css.out);
  const css = await fs.readFile(entry, "utf8");

  const result = await _buildProcessor().process(css, { from: entry, to: out });

  fs.ensureDirSync(path.dirname(out));
  await fs.writeFile(out, result.css);
}

/**
 * Compiles project CSS with PostCSS (import → mixins → nested → autoprefixer)
 * into a single bundled stylesheet in the build directory. Disabled by
 * default; enable via the `css` config option. Compilation errors are fatal
 * in CI and non-fatal during local development so the watch loop keeps going.
 *
 * @param {Object} config - Build configuration object
 * @param {boolean} config.ci - Whether the build is running in CI
 * @param {Object} config.css - CSS pipeline options
 * @param {boolean} config.css.enabled - Whether to run the CSS pipeline
 * @param {string} config.css.entry - Entry CSS file relative to srcDir
 * @param {string} config.css.out - Output CSS file relative to buildDir
 * @param {string} config.srcDirPath - Source directory path
 * @param {string} config.buildDirPath - Build directory path
 * @returns {Function} Gulp task function that accepts a done callback
 */
export const compileCss = (config) => async (done) => {
  if (!config.css.enabled) {
    log.debug("CSS pipeline disabled, skipping compileCss.");
    done();
    return;
  }

  log.debug("Compiling CSS...");
  try {
    await _compile(config);
    log.debug("CSS compiled.");
    done();
  } catch (error) {
    log.error(`CSS failed to compile: ${error.message}`);
    // Hard-fail in CI, soft-fail in dev so the watcher survives a bad edit.
    done(config.ci ? error : undefined);
  }
};

/**
 * Watch task for CSS during development. Recompiles the whole bundle whenever
 * any CSS file under the source directory is added, changed, or removed, so
 * `@import`-ed partials are picked up. No-op when the CSS pipeline is disabled.
 *
 * @param {Object} config - Build configuration object
 * @param {Object} config.css - CSS pipeline options
 * @param {string} config.srcDirPath - Source directory path
 * @param {string[]} config.excludeDirs - Directories to exclude
 * @returns {Function} Gulp task function that returns a watcher object (or
 *                     undefined when the pipeline is disabled)
 */
export const watchCss = (config) => () => {
  if (!config.css.enabled) {
    log.debug("CSS pipeline disabled, skipping watchCss.");
    return undefined;
  }

  const recompile = () =>
    _compile(config).catch((error) =>
      log.error(`CSS failed to compile: ${error.message}`),
    );

  return FileUtils.createExtensionWatcher({
    srcDir: config.srcDirPath,
    exts: [".css"],
    excludeDirs: config.excludeDirs,
    label: "css",
    onAdd: recompile,
    onChange: recompile,
    onDelete: recompile,
  });
};
