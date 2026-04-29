// src/logger.js
/**
 * @module Logger
 * @description Provides logging with configurable levels, a global on/off switch,
 * and separate namespaces for system logs and element-scoped logs.
 */

/** @enum {string} */
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

function getInitialLogLevel() {
  try {
    const configured = typeof window !== 'undefined'
      ? window.localStorage?.getItem('HTMLEX_LOG_LEVEL')
      : null;
    if (Object.values(LogLevel).includes(configured)) return configured;

    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location?.search || '' : '');
    if (params.get('htmlexDebug') === '1') return LogLevel.DEBUG;
  } catch {
    // Logging configuration should never block app startup.
  }

  return LogLevel.WARN;
}

function shouldLog(levels) {
  return Logger.enabled && Logger.namespaces.system && levels.includes(Logger.logLevel);
}

function shouldLogElement(element, levels) {
  return (
    Logger.enabled &&
    element instanceof HTMLElement &&
    element.hasAttribute('debug') &&
    levels.includes(Logger.logLevel)
  );
}

export const Logger = {
  enabled: true,
  logLevel: getInitialLogLevel(),
  namespaces: {
    system: true,
  },

  system: {
    debug: (message, ...args) => {
      if (shouldLog([LogLevel.DEBUG])) {
        console.debug('[HTMLeX SYSTEM DEBUG]', message, ...args);
      }
    },
    info: (message, ...args) => {
      if (shouldLog([LogLevel.DEBUG, LogLevel.INFO])) {
        console.info('[HTMLeX SYSTEM INFO]', message, ...args);
      }
    },
    warn: (message, ...args) => {
      if (shouldLog([LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN])) {
        console.warn('[HTMLeX SYSTEM WARN]', message, ...args);
      }
    },
    error: (message, ...args) => {
      if (Logger.enabled && Logger.namespaces.system) {
        console.error('[HTMLeX SYSTEM ERROR]', message, ...args);
      }
    }
  },

  element: {
    debug: (element, message, ...args) => {
      if (shouldLogElement(element, [LogLevel.DEBUG])) {
        console.debug('[HTMLeX DEBUG]', message, ...args);
      }
    },
    info: (element, message, ...args) => {
      if (shouldLogElement(element, [LogLevel.DEBUG, LogLevel.INFO])) {
        console.info('[HTMLeX INFO]', message, ...args);
      }
    },
    warn: (element, message, ...args) => {
      if (shouldLogElement(element, [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN])) {
        console.warn('[HTMLeX WARN]', message, ...args);
      }
    },
    error: (element, message, ...args) => {
      if (Logger.enabled && element instanceof HTMLElement && element.hasAttribute('debug')) {
        console.error('[HTMLeX ERROR]', message, ...args);
      }
    }
  }
};

let runtimeErrorBoundaryInstalled = false;

function getRuntimeErrorDetails(event) {
  return {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    error: event.error,
  };
}

export function installRuntimeErrorBoundary() {
  if (runtimeErrorBoundaryInstalled || typeof window === 'undefined') return;

  runtimeErrorBoundaryInstalled = true;
  window.addEventListener('error', (event) => {
    Logger.system.error('[Runtime] Unhandled browser error:', getRuntimeErrorDetails(event));
  });
  window.addEventListener('unhandledrejection', (event) => {
    Logger.system.error('[Runtime] Unhandled promise rejection:', event.reason);
  });
}
