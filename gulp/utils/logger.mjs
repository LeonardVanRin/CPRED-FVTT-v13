import chalk from "chalk";
import fancyLog from "fancy-log";

/**
 * Logger class that provides leveled logging with colored output. Supports
 * TRACE, DEBUG, INFO, WARN, and ERROR levels with environment-based
 * configuration.
 *
 * @class
 */
export class Logger {
  /**
   * Color definitions for each log level.
   *
   * @type {Object.<string, string>}
   */
  COLORS = {
    TRACE: "gray",
    DEBUG: "white",
    INFO: "blue",
    WARN: "yellow",
    ERROR: "red",
  };

  /**
   * Chalk-formatted prefix strings for each log level.
   *
   * @type {Object.<string, string>}
   */
  LOG_PREFIX = {
    TRACE: chalk[this.COLORS.TRACE]("TRACE"),
    DEBUG: chalk[this.COLORS.DEBUG]("DEBUG"),
    INFO: chalk[this.COLORS.INFO]("INFO"),
    WARN: chalk[this.COLORS.WARN]("WARN"),
    ERROR: chalk[this.COLORS.ERROR]("ERROR"),
  };

  /**
   * Numeric values for each log level.
   *
   * @type {Object.<string, number>}
   */
  levels = {
    TRACE: 0,
    DEBUG: 1,
    INFO: 2,
    WARN: 3,
    ERROR: 4,
  };

  /**
   * Initializes logger with level based on environment variables. Checks for
   * TRACE and DEBUG env vars to set appropriate level.
   *
   * @constructor
   */
  constructor() {
    this.currentLevel = process.env.TRACE
      ? this.levels.TRACE
      : process.env.DEBUG
        ? this.levels.DEBUG
        : this.levels.INFO;
  }

  /**
   * Sets the current logging level. Only accepts valid level names defined in
   * this.levels.
   *
   * @param {string} level - The log level to set
   */
  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.currentLevel = this.levels[level];
    }
  }

  /**
   * Determines if a message at the given level should be logged based on the
   * current logging level.
   *
   * @param {string} level - The level to check
   * @returns {boolean} True if the message should be logged
   */
  shouldLog(level) {
    return this.levels[level] >= this.currentLevel;
  }

  /**
   * Formats a log message with its level prefix.
   *
   * @param {string} levelPrefix - The formatted level prefix
   * @param {string} message - The message to format
   * @returns {string} The formatted message
   */
  formatMessage(levelPrefix, message) {
    return `[${levelPrefix}] ${message}`;
  }

  /**
   * Logs a message at the TRACE level.
   * level is set to TRACE.
   *
   * @param {string} message - The message to log
   * @param {...*} args - Additional arguments to pass to the logger
   */
  trace(message, ...args) {
    if (this.shouldLog("TRACE")) {
      fancyLog(this.formatMessage(this.LOG_PREFIX.TRACE, message), ...args);
    }
  }

  /**
   * Logs a message at the DEBUG level.
   * level is set to DEBUG or lower.
   *
   * @param {string} message - The message to log
   * @param {...*} args - Additional arguments to pass to the logger
   */
  debug(message, ...args) {
    if (this.shouldLog("DEBUG")) {
      fancyLog(this.formatMessage(this.LOG_PREFIX.DEBUG, message), ...args);
    }
  }

  /**
   * Logs a message at the INFO level.
   * level is set to INFO or lower.
   *
   * @param {string} message - The message to log
   * @param {...*} args - Additional arguments to pass to the logger
   */
  info(message, ...args) {
    if (this.shouldLog("INFO")) {
      fancyLog(this.formatMessage(this.LOG_PREFIX.INFO, message), ...args);
    }
  }

  /**
   * Logs a message at the WARN level.
   * level is set to WARN or lower.
   *
   * @param {string} message - The message to log
   * @param {...*} args - Additional arguments to pass to the logger
   */
  warn(message, ...args) {
    if (this.shouldLog("WARN")) {
      fancyLog(this.formatMessage(this.LOG_PREFIX.WARN, message), ...args);
    }
  }

  /**
   * Logs a message at the ERROR level.
   * level is set to ERROR or lower.
   *
   * @param {string} message - The message to log
   * @param {...*} args - Additional arguments to pass to the logger
   */
  error(message, ...args) {
    if (this.shouldLog("ERROR")) {
      fancyLog(this.formatMessage(this.LOG_PREFIX.ERROR, message), ...args);
    }
  }
}

export default new Logger();
