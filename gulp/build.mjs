import path from "node:path";
import fs from "fs-extra";
import log from "./utils/logger.mjs";
import { FileUtils } from "./utils/FileUtils.mjs";
import DataUtils from "./utils/DataUtils.mjs";

/**
 * Cleans the build directory by removing all contents while preserving
 * the directory itself. This is typically run at the start of a full
 * build to ensure a clean state.
 *
 * @param {Object} config - Build configuration object
 * @param {string} config.buildDirPath - Path to the build directory
 * @returns {Function} Gulp task function that accepts a done callback
 */
export const cleanBuildDir = (config) => (done) => {
  log.debug("Cleaning build directory...");
  const buildDir = config.buildDirPath;
  try {
    fs.emptyDirSync(buildDir);
    log.debug("Cleaned build directory.");
    done();
  } catch (err) {
    log.error(`Error cleaning build directory: ${err}`);
    done(err);
  }
};

/**
 * Copies static assets from source to build directory. Finds all files
 * matching configured extensions and copies them while preserving
 * directory structure.
 *
 * @param {Object} config - Build configuration object
 * @param {string} config.srcDirPath - Source directory path
 * @param {string} config.buildDirPath - Build directory path
 * @param {string[]} config.staticExts - Array of file extensions to copy
 * @param {string[]} config.excludeDirs - Array of directories to exclude
 * @returns {Function} Gulp task function that accepts a done callback
 */
export const copyStaticAssets = (config) => async (done) => {
  log.debug("Copying static assets...");

  // Manifest files are handled by buildManifest task
  const excludedFiles = ["system.json", "module.json"];

  try {
    const allFiles = await FileUtils.findFilesByExts(
      config.srcDirPath,
      config.staticExts,
      config.excludeDirs,
    );

    const files = allFiles.filter(
      (file) => !excludedFiles.includes(path.basename(file)),
    );

    for (const file of files) {
      const relativePath = path.relative(config.srcDirPath, file);
      log.debug(`copying '${relativePath}' to '${config.buildDirPath}'`);
      FileUtils.copyFilePreservingStructure(
        file,
        config.srcDirPath,
        config.buildDirPath,
      );
    }

    log.debug("Static assets copied successfully.");
    done();
  } catch (err) {
    log.error(`Error copying static assets: ${err}`);
    done(err);
  }
};

/**
 * Watch task for static assets during development. Monitors files
 * matching configured extensions for additions, modifications,
 * and deletions. Copies and removes files for fast incremental builds.
 * Debounces rapid file changes to ensure the latest version is
 * processed.
 *
 * Watch events:
 * - add: Copies newly added files to build directory
 * - change: Updates modified files in build directory (debounced)
 * - unlink: Removes deleted files from build directory
 *
 * @param {Object} config - Build configuration object
 * @param {string} config.srcDirPath - Source directory path
 * @param {string} config.buildDirPath - Build directory path
 * @param {string[]} config.staticExts - Array of file extensions to watch
 * @param {string[]} config.excludeDirs - Array of directories to exclude
 * @returns {Function} Gulp task function that returns a watcher object
 */
export const watchStaticAssets = (config) => () => {
  // Manifest files are handled by buildManifest task
  const excludedFiles = ["system.json", "module.json"];

  const isExcludedFile = (file) => excludedFiles.includes(path.basename(file));

  return FileUtils.createExtensionWatcher({
    srcDir: config.srcDirPath,
    exts: config.staticExts,
    excludeDirs: config.excludeDirs,
    label: "asset",
    onAdd: (file) => {
      if (isExcludedFile(file)) return;
      FileUtils.copyFilePreservingStructure(
        file,
        config.srcDirPath,
        config.buildDirPath,
      );
    },
    onChange: (file) => {
      if (isExcludedFile(file)) return;
      FileUtils.copyFilePreservingStructure(
        file,
        config.srcDirPath,
        config.buildDirPath,
      );
    },
    onDelete: (file) => {
      if (isExcludedFile(file)) return;
      FileUtils.deleteFilePreservingStructure(
        file,
        config.srcDirPath,
        config.buildDirPath,
      );
    },
  });
};

/**
 * Builds the module manifest by generating dynamic data and writing it
 * to the build directory. The manifest includes project metadata,
 * version information, and distribution URLs generated from the
 * configuration.
 *
 * @param {Object} config - Build configuration object
 * @param {Object} config.generateManifest - Generated manifest data with
 *                                           URLs and metadata
 * @param {string} config.buildDirPath - Build directory path
 * @param {string} config._manifestFile - Path to manifest file (relative
 *                                        to project root)
 * @returns {Function} Gulp task function that accepts a done callback
 */
export const buildManifest = (config) => (done) => {
  try {
    const manifestData = config.generateManifest;
    const buildDir = config.buildDirPath;
    const manifestFile = path.basename(config._manifestFile);

    fs.ensureDirSync(buildDir);
    const filePath = path.join(buildDir, manifestFile);
    FileUtils.writeJSONFile(filePath, manifestData, { spaces: 2 });
    done();
  } catch (error) {
    done(error);
  }
};

/**
 * Generates the devMode module from defaults deep-merged with the `devMode`
 * key of `foundryconfig.json`, writing an ES module that default-exports the
 * merged object. Disabled by default; enable via the `devMode` config option.
 * Keeping the defaults in consumer config keeps this task project-agnostic.
 *
 * @param {Object} config - Build configuration object
 * @param {Object} config.devMode - DevMode options
 * @param {boolean} config.devMode.enabled - Whether to generate the module
 * @param {string} config.devMode.outPath - Output path relative to buildDir
 * @param {Object} config.devMode.defaults - Default devMode object
 * @param {Object} config.foundryConfig - Parsed foundryconfig.json
 * @param {string} config.buildDirPath - Build directory path
 * @returns {Function} Gulp task function that accepts a done callback
 */
export const generateDevMode = (config) => (done) => {
  if (!config.devMode.enabled) {
    log.debug("DevMode generation disabled, skipping generateDevMode.");
    done();
    return;
  }

  try {
    const merged = DataUtils.deepMerge(
      config.devMode.defaults,
      config.foundryConfig.devMode || {},
    );
    const content =
      "// Auto-generated during build - DO NOT EDIT\n" +
      `const DEV_MODE = ${JSON.stringify(merged, null, 2)};\n` +
      "export default DEV_MODE;\n";

    const outPath = path.join(config.buildDirPath, config.devMode.outPath);
    fs.ensureDirSync(path.dirname(outPath));
    FileUtils.writeTextFile(outPath, content);
    done();
  } catch (error) {
    log.error(`Error generating devMode: ${error.message}`);
    done(error);
  }
};

/**
 * Generates an environment variables file with module and release
 * information. Creates vars.env containing module metadata (CHANGELOG_FILE,
 * MODULE_ID, MODULE_TITLE, MODULE_VERSION) and release vars (RELEASE_NAME,
 * ZIP_FILE, REPO_URL, MODULE_MANIFEST_URL, MODULE_DOWNLOAD_URL). This file is
 * the single source of these values for the CI/CD release scripts.
 *
 * @param {Object} config - Build configuration object
 * @param {string} config.changelogPath - Path to changelog file
 * @param {string} config.id - Module ID from manifest
 * @param {string} config.title - Module title from manifest
 * @param {string} config.version - Module version string
 * @param {string} config.releaseName - Release archive base name
 * @param {string} config.zipName - Release zip file name
 * @param {string} config.repoUrl - GitLab generic package base URL
 * @param {string} config.manifestUrl - Latest manifest URL
 * @param {string} config.downloadUrl - Versioned download (zip) URL
 * @param {string} config.varsFile - Path where vars.env should be
 *                                   written
 * @returns {Function} Gulp task function that accepts a done callback
 */
export const generateEnvFile = (config) => (done) => {
  try {
    const vars = [
      { key: "CHANGELOG_FILE", value: config.changelogPath },
      { key: "MODULE_ID", value: config.id },
      { key: "MODULE_TITLE", value: config.title },
      { key: "MODULE_VERSION", value: config.version },
      // Release vars consumed by the CI release scripts, derived here so the
      // scripts stay config-agnostic and just read vars.env.
      { key: "RELEASE_NAME", value: config.releaseName },
      { key: "ZIP_FILE", value: config.zipName },
      { key: "REPO_URL", value: config.repoUrl },
      { key: "MODULE_MANIFEST_URL", value: config.manifestUrl },
      { key: "MODULE_DOWNLOAD_URL", value: config.downloadUrl },
    ];

    const content = vars.map(({ key, value }) => `${key}=${value}`).join("\n");

    fs.ensureDirSync(path.dirname(config.varsFile));
    FileUtils.writeTextFile(config.varsFile, content);
    done();
  } catch (error) {
    done(error);
  }
};
