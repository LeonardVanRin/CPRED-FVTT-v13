import fs from "fs-extra";
import path from "path";
import { watch } from "gulp";
import log from "./logger.mjs";

/**
 * Utility class for file system operations with built-in logging and error
 * handling.
 */
export class FileUtils {
  /**
   * Writes data to a JSON file with pretty printing. Logs success at debug
   * level and errors at error level.
   *
   * @param {string} path - The file path to write to
   * @param {Object} data - The data to write as JSON
   * @param {Object} [options={ spaces: 2 }] - JSON writing options
   * @param {number} options.spaces - Number of spaces for indentation
   * @throws {Error} If file writing fails
   */
  static writeJSONFile(path, data, options = { spaces: 2 }) {
    try {
      fs.writeJSONSync(path, data, options);
      log.debug(`FileUtils.mjs: Wrote JSON file: ${path}`);
    } catch (err) {
      log.error(`FileUtils.mjs: Failed to write JSON file ${path}: ${err}`);
      throw err;
    }
  }

  /**
   * Writes text content to a file. Logs success at debug level and errors
   * at error level.
   *
   * @param {string} path - The file path to write to
   * @param {string} content - The text content to write
   * @param {string} [encoding="utf-8"] - File encoding
   * @throws {Error} If file writing fails
   */
  static writeTextFile(path, content, encoding = "utf-8") {
    try {
      fs.writeFileSync(path, content, encoding);
      log.debug(`FileUtils.mjs: Wrote text file: ${path}`);
    } catch (err) {
      log.error(`FileUtils.mjs: Failed to write text file ${path}: ${err}`);
      throw err;
    }
  }

  /**
   * Sanitizes a string by converting it to a safe filename format.
   *
   * This function performs the following transformations:
   * - Converts diacritical marks and accented characters to their basic
   *   Latin equivalents
   * - Removes parentheses, quotes, and similar characters
   * - Replaces special characters and spaces with underscores
   * - Removes currency symbols and mathematical operators
   * - Converts all characters to lowercase
   * - Removes zero-width characters and other invisible Unicode characters
   *
   * Order of operation is important here!
   *
   * @param {string} str - The input string to be sanitized
   * @returns {string} A cleaned string safe for use as a filename
   */
  static sanitizeFilename(str) {
    return str
      .replace(/[àáâãäåāăąǻạảấầẩẫậắằẳẵặ]/g, "a")
      .replace(/[èéêëēĕėęěẹẻẽếềểễệ]/g, "e")
      .replace(/[ìíîïĩīĭįǐỉịớờởỡợ]/g, "i")
      .replace(/[òóôõöōŏőơǒǫǭọỏốồổỗộớờởỡợ]/g, "o")
      .replace(/[ùúûüũūŭůűųưǔǖǘǚǜụủứừửữự]/g, "u")
      .replace(/[ýÿŷỳỵỷỹ]/g, "y")
      .replace(/[æǽ]/g, "ae")
      .replace(/[œ]/g, "oe")
      .replace(/[ĳ]/g, "ij")
      .replace(/[ß]/g, "ss")
      .replace(/[ćçĉċč]/g, "c")
      .replace(/[ḩĥħ]/g, "h")
      .replace(/[ĵ]/g, "j")
      .replace(/[ķ]/g, "k")
      .replace(/[ĺļľŀł]/g, "l")
      .replace(/[ńņňñ]/g, "n")
      .replace(/[ŕŗř]/g, "r")
      .replace(/[śŝşš]/g, "s")
      .replace(/[ţťŧ]/g, "t")
      .replace(/[ŵẃẅẁ]/g, "w")
      .replace(/[źżž]/g, "z")
      .replace(/[ÀÁÂÃÄÅĀĂĄǺẠẢẤẦẨẪẬẮẰẲẴẶ]/g, "A")
      .replace(/[ÈÉÊËĒĔĖĘĚẸẺẼẾỀỂỄỆ]/g, "E")
      .replace(/[ÌÍÎÏĨĪĬĮǏỈỊỚỜỞỠỢ]/g, "I")
      .replace(/[ÒÓÔÕÖŌŎŐƠǑǪǬỌỎỐỒỔỖỘỚỜỞỠỢ]/g, "O")
      .replace(/[ÙÚÛÜŨŪŬŮŰŲƯǓǕǗǙǛỤỦỨỪỬỮỰ]/g, "U")
      .replace(/[ÝŸŶỲỴỶỸ]/g, "Y")
      .replace(/[ÆǼ]/g, "AE")
      .replace(/[Œ]/g, "OE")
      .replace(/[Ĳ]/g, "IJ")
      .replace(/[ĆÇĈĊČ]/g, "C")
      .replace(/[ĤĦḨ]/g, "H")
      .replace(/[Ĵ]/g, "J")
      .replace(/[Ķ]/g, "K")
      .replace(/[ĹĻĽĿŁ]/g, "L")
      .replace(/[ŃŅŇÑ]/g, "N")
      .replace(/[ŔŖŘ]/g, "R")
      .replace(/[ŚŜŞŠ]/g, "S")
      .replace(/[ŢŤŦ]/g, "T")
      .replace(/[ŴẂẄẀ]/g, "W")
      .replace(/[ŹŻŽ]/g, "Z")
      .replace(/[$€£¥¢]/g, "")
      .replace(/[()'"]/g, "")
      .replace(/[+−×÷=≠<>±≤≥]/g, "")
      .replace(/[^a-z0-9.]/gi, "_")
      .replace(/[\u200B-\u200D\uFEFF\u2060-\u2064\s]+/g, "")
      .toLowerCase();
  }

  /**
   * Recursively searches a directory for files matching multiple extensions.
   * Walks the directory tree once and returns all matching file paths.
   * Performs a single directory traversal for better performance when
   * searching for multiple file types.
   *
   * @async
   * @param {string} searchPath - The directory path to search
   * @param {string[]} exts - Array of file extensions to search for (with
   *                          or without leading dots)
   * @param {string[]} [excludeDirs=[]] - Array of directory names/paths to exclude
   * @returns {Promise<string[]>} Array of absolute file paths matching any
   *                              of the provided extensions
   * @throws {Error} If searchPath or exts parameters are not provided
   */
  static async findFilesByExts(searchPath, exts, excludeDirs = []) {
    if (!searchPath) {
      throw new Error("searchPath parameter is required");
    }
    if (!exts || !Array.isArray(exts) || exts.length === 0) {
      throw new Error("exts parameter must be a non-empty array");
    }

    const files = [];
    const targetExts = exts.map((ext) =>
      ext.startsWith(".") ? ext : `.${ext}`,
    );

    async function search(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(searchPath, fullPath);

        if (entry.isDirectory()) {
          // Skip hidden directories and node_modules
          if (entry.name.startsWith(".") || entry.name === "node_modules") {
            continue;
          }
          // Skip user-configured excluded directories
          const isExcluded = excludeDirs.some(
            (excl) =>
              relativePath === excl || relativePath.startsWith(excl + path.sep),
          );
          if (!isExcluded) {
            await search(fullPath);
          }
        } else if (
          entry.isFile() &&
          targetExts.includes(path.extname(entry.name))
        ) {
          files.push(fullPath);
        }
      }
    }

    await search(searchPath);
    return files;
  }

  /**
   * Copies a file from source to destination, preserving directory structure.
   * Example: copyFilePreservingStructure("src/foo/bar/baz.js", "src", "dist")
   *          → creates "dist/foo/bar/baz.js"
   *
   * @static
   * @param {string} file - Absolute path to the source file
   * @param {string} srcDir - Source directory root
   * @param {string} destDir - Destination directory root
   */
  static copyFilePreservingStructure(file, srcDir, destDir) {
    const relativePath = path.relative(srcDir, file);
    const destPath = path.join(destDir, relativePath);
    fs.ensureDirSync(path.dirname(destPath));
    fs.copySync(file, destPath);
  }

  /**
   * Deletes a file from destination, using relative path from source.
   * Example: deleteFilePreservingStructure("src/foo/bar/baz.js", "src", "dist")
   *          → deletes "dist/foo/bar/baz.js"
   *
   * @static
   * @param {string} file - Absolute path to the source file
   * @param {string} srcDir - Source directory root
   * @param {string} destDir - Destination directory root
   */
  static deleteFilePreservingStructure(file, srcDir, destDir) {
    const relativePath = path.relative(srcDir, file);
    const destPath = path.join(destDir, relativePath);
    if (fs.existsSync(destPath)) {
      fs.removeSync(destPath);
    }
  }

  /**
   * Creates a file watcher for specified extensions with standard event handling.
   * Used by both static assets and images watchers.
   *
   * @static
   * @param {Object} options - Watcher options
   * @param {string} options.srcDir - Source directory to watch
   * @param {string[]} options.exts - File extensions to watch
   * @param {string[]} [options.excludeDirs=[]] - Directories to exclude
   * @param {Function} options.onAdd - Handler for added files (file) => void
   * @param {Function} options.onChange - Handler for changed files (file) => void
   * @param {Function} options.onDelete - Handler for deleted files (file) => void
   * @param {string} options.label - Log label (e.g., "asset", "image")
   * @returns {FSWatcher} Gulp file watcher
   */
  static createExtensionWatcher(options) {
    const {
      srcDir,
      exts,
      excludeDirs = [],
      onAdd,
      onChange,
      onDelete,
      label,
    } = options;

    const srcPattern = exts.map((ext) => path.join(srcDir, `**/*${ext}`));
    const watcher = watch(srcPattern);
    const debounceTimers = new Map();
    const debounceDelay = 50;

    function isExcluded(file) {
      const relativePath = path.relative(srcDir, file);
      // Check for hidden directories or node_modules in path
      const pathParts = relativePath.split(path.sep);
      if (
        pathParts.some(
          (part) => part.startsWith(".") || part === "node_modules",
        )
      ) {
        return true;
      }
      // Check user-configured exclusions
      return excludeDirs.some(
        (excl) =>
          relativePath.startsWith(excl + path.sep) || relativePath === excl,
      );
    }

    watcher
      .on("add", (file) => {
        if (isExcluded(file)) return;
        const relPath = path.relative(srcDir, file);
        log.info(`[${label}] Added: ${relPath}`);
        try {
          onAdd(file);
        } catch (e) {
          log.error(`Failed to process: ${e.message}`);
        }
      })
      .on("change", (file) => {
        if (isExcluded(file)) return;
        const relPath = path.relative(srcDir, file);
        log.info(`[${label}] Changed: ${relPath}`);
        clearTimeout(debounceTimers.get(file));
        debounceTimers.set(
          file,
          setTimeout(() => {
            try {
              onChange(file);
            } catch (e) {
              log.error(`Failed to process: ${e.message}`);
            } finally {
              debounceTimers.delete(file);
            }
          }, debounceDelay),
        );
      })
      .on("unlink", (file) => {
        if (isExcluded(file)) return;
        const relPath = path.relative(srcDir, file);
        log.info(`[${label}] Deleted: ${relPath}`);
        try {
          onDelete(file);
        } catch (e) {
          log.error(`Failed to delete: ${e.message}`);
        }
      });

    return watcher;
  }
}
