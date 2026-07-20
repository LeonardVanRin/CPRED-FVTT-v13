import fs from "fs-extra";
import path from "path";
import YAML from "js-yaml";
import { marked } from "marked";
import { PackUtils } from "./PackUtils.mjs";
import { FileUtils } from "./FileUtils.mjs";
import log from "./logger.mjs";

/**
 * Utility class for turning a Markdown CHANGELOG into Foundry journal pack
 * fragments (one journal per language, one page per released version).
 */
export class ChangelogUtils {
  /**
   * Extracts and formats a version number from a heading string such as
   * "Version: 1.2.3", returning it as "v1.2.3". Two-part versions are padded
   * to three parts.
   *
   * @param {string} input - Heading string that may contain a version
   * @returns {string} Formatted version (e.g. "v1.2.3") or "Unknown"
   */
  static getVersion(input) {
    const versionRegex = /Version\s*:? (\d+\.\d+\.\d+)/;
    const match = input.match(versionRegex);

    if (match) {
      const versionParts = match[1].split(".");
      if (versionParts.length === 2) {
        versionParts.push("0");
      }
      return `v${versionParts.join(".")}`;
    }

    return "Unknown";
  }

  /**
   * Splits Markdown by heading level, returning each heading and the content
   * up to the next heading of the same-or-higher level.
   *
   * @param {string} markdown - The Markdown text to split
   * @param {number} level - Heading level to target (1 for "#", 2 for "##", …)
   * @returns {Array<{heading: string, content: string}>} Parsed sections
   */
  static markdownToJson(markdown, level) {
    const regex = new RegExp(
      `^(#{${level}}\\s.*)[\\s\\S]*?(?=(^#{1,${level + 1}}\\s)|$)`,
      "gm",
    );
    const data = [];
    let match = regex.exec(markdown);

    while (match != null) {
      const headingText = match[1].replace(`#{${level}}`, "").trim();
      const startIndex = match.index + match[0].length;
      const endIndex = markdown.indexOf(`\n${"#".repeat(level)} `, startIndex);
      const content = markdown
        .substring(startIndex, endIndex !== -1 ? endIndex : undefined)
        .trim();

      data.push({ heading: headingText, content });

      match = regex.exec(markdown);
    }

    return data;
  }

  /**
   * Generates a changelog journal (and its pages) as YAML pack fragments from
   * the provided Markdown content, writing them into the output directory.
   *
   * @param {Object} config - Build configuration object
   * @param {string} markdown - Markdown CHANGELOG content for this language
   * @param {string} lang - Language display name (e.g. "English")
   * @param {string} outDir - Directory to write the YAML fragments into
   * @returns {Promise<void>}
   */
  static async generateChangelogJournal(config, markdown, lang, outDir) {
    const sections = ChangelogUtils.markdownToJson(markdown, 2);
    const journalId = PackUtils.generateId(16);
    const langSlug = FileUtils.sanitizeFilename(lang);

    // Pages are embedded in the journal document (one fragment per journal), as
    // the Foundry CLI expects — it derives the per-page LevelDB keys on compile.
    const pages = [];
    for (const entry of sections) {
      const version = ChangelogUtils.getVersion(entry.heading);
      if (version === "Unknown") {
        continue;
      }

      const sort = Number(version.replace(/[v.]+/g, "")) * 100;
      const pageId = PackUtils.generateId(16);
      const page = {
        sort,
        name: version,
        type: "text",
        _id: pageId,
        // Embedded children still need their own `_key`; the CLI walks the
        // whole document hierarchy and reads `_key` on every node.
        _key: `!journal.pages!${journalId}.${pageId}`,
        title: { show: true },
        image: {},
        text: { format: 1, content: marked.parse(entry.content) },
        video: { controls: true, volume: 0.5 },
        src: null,
        system: {},
        ownership: { default: -1 },
        flags: {},
      };
      pages.push(PackUtils.generateStats(config, page));
    }

    const journal = {
      _id: journalId,
      _key: `!journal!${journalId}`,
      name: `Changelog ${lang}`,
      pages,
      flags: {
        core: {
          viewMode: "JournalSheet.VIEW_MODES.MULTIPLE",
        },
      },
    };
    fs.writeFileSync(
      path.resolve(outDir, `journal.${langSlug}.yaml`),
      YAML.dump(journal),
    );
    log.debug(
      `Generated changelog journal for '${lang}' (${pages.length} pages).`,
    );
  }
}
