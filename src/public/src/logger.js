// src/logger.js
/**
 * @module Logger
 * @description Provides logging functionality with configurable log levels,
 * a global on/off switch, and two “namespaces” – one for generic system logs and
 * one for element-specific logs. Element-specific logs are only output if the
 * element has the `debug` attribute.
 */

/** @enum {string} */
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

export const Logger = {
  // Global flag to completely enable/disable logging.
  enabled: true,

  // The current log level.
  logLevel: LogLevel.DEBUG,

  // Namespace flags – you can add more namespaces if needed.
  namespaces: {
    system: true, // when true, generic (system) logs are shown.
  },

  // -------------------------------
  // Generic/system logging methods
  // These logs are not associated with any specific element.
  // -------------------------------
  system: {
    debug: (msg, ...args) => {
      if (!Logger.enabled || !Logger.namespaces.system) return;
      if ([LogLevel.DEBUG].includes(Logger.logLevel))
        console.debug("[HTMLeX SYSTEM DEBUG]", msg, ...args);
    },
    info: (msg, ...args) => {
      if (!Logger.enabled || !Logger.namespaces.system) return;
      if ([LogLevel.DEBUG, LogLevel.INFO].includes(Logger.logLevel))
        console.info("[HTMLeX SYSTEM INFO]", msg, ...args);
    },
    warn: (msg, ...args) => {
      if (!Logger.enabled || !Logger.namespaces.system) return;
      if ([LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN].includes(Logger.logLevel))
        console.warn("[HTMLeX SYSTEM WARN]", msg, ...args);
    },
    error: (msg, ...args) => {
      if (!Logger.enabled || !Logger.namespaces.system) return;
      console.error("[HTMLeX SYSTEM ERROR]", msg, ...args);
    }
  },

  // -------------------------------
  // Element-specific logging methods
  // These methods expect an HTML element as the first parameter.
  // They will only log if the element has the `debug` attribute.
  // -------------------------------
  element: {
    debug: (elem, msg, ...args) => {
      if (!Logger.enabled) return;
      if (!(elem instanceof HTMLElement && elem.hasAttribute("debug"))) return;
      if ([LogLevel.DEBUG].includes(Logger.logLevel))
        console.debug("[HTMLeX DEBUG]", msg, ...args);
    },
    info: (elem, msg, ...args) => {
      if (!Logger.enabled) return;
      if (!(elem instanceof HTMLElement && elem.hasAttribute("debug"))) return;
      if ([LogLevel.DEBUG, LogLevel.INFO].includes(Logger.logLevel))
        console.info("[HTMLeX INFO]", msg, ...args);
    },
    warn: (elem, msg, ...args) => {
      if (!Logger.enabled) return;
      if (!(elem instanceof HTMLElement && elem.hasAttribute("debug"))) return;
      if ([LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN].includes(Logger.logLevel))
        console.warn("[HTMLeX WARN]", msg, ...args);
    },
    error: (elem, msg, ...args) => {
      if (!Logger.enabled) return;
      if (!(elem instanceof HTMLElement && elem.hasAttribute("debug"))) return;
      console.error("[HTMLeX ERROR]", msg, ...args);
    }
  }
};
