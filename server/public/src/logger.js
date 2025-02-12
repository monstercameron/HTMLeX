// src/logger.js
/**
 * @module Logger
 * @description Provides logging functionality with configurable log levels.
 */

/** @enum {string} */
export const LogLevel = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error'
  };
  
  /**
   * Logger object for HTMLeX.
   * @type {{ logLevel: string, debug: function(string, ...*): void, info: function(string, ...*): void, warn: function(string, ...*): void, error: function(string, ...*): void }}
   */
  export const Logger = {
    logLevel: LogLevel.DEBUG,
    debug: (msg, ...args) => {
      if ([LogLevel.DEBUG].includes(Logger.logLevel))
        console.debug("[HTMLeX DEBUG]", msg, ...args);
    },
    info: (msg, ...args) => {
      if ([LogLevel.DEBUG, LogLevel.INFO].includes(Logger.logLevel))
        console.info("[HTMLeX INFO]", msg, ...args);
    },
    warn: (msg, ...args) => {
      if ([LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN].includes(Logger.logLevel))
        console.warn("[HTMLeX WARN]", msg, ...args);
    },
    error: (msg, ...args) => {
      console.error("[HTMLeX ERROR]", msg, ...args);
    }
  };
  