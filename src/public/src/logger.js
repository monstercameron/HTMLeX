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

const MAX_LOG_ENTRIES = 250;
const LOG_EVENT_NAME = 'htmlex:log';
const DIAGNOSTICS_GLOBAL = '__HTMLEX_DIAGNOSTICS__';

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

function getWindow() {
  return typeof window !== 'undefined' ? window : null;
}

function getDiagnosticsStore() {
  const runtimeWindow = getWindow();
  if (!runtimeWindow) return null;

  runtimeWindow[DIAGNOSTICS_GLOBAL] ||= {
    entries: [],
    clear() {
      this.entries.length = 0;
    }
  };
  return runtimeWindow[DIAGNOSTICS_GLOBAL];
}

function serializeArg(arg) {
  if (arg instanceof Error) {
    return {
      name: arg.name,
      message: arg.message,
      stack: arg.stack
    };
  }

  if (typeof Element !== 'undefined' && arg instanceof Element) {
    return {
      element: arg.tagName.toLowerCase(),
      id: arg.id || undefined,
      classes: arg.className || undefined,
    };
  }

  return arg;
}

function recordLog(level, scope, message, args) {
  const store = getDiagnosticsStore();
  if (!store) return;

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    args: args.map(serializeArg),
  };

  store.entries.push(entry);
  if (store.entries.length > MAX_LOG_ENTRIES) {
    store.entries.splice(0, store.entries.length - MAX_LOG_ENTRIES);
  }

  getWindow()?.dispatchEvent(new CustomEvent(LOG_EVENT_NAME, { detail: entry }));
}

function shouldLog(levels) {
  return Logger.enabled && Logger.namespaces.system && levels.includes(Logger.logLevel);
}

function shouldLogElement(element, levels) {
  return (
    Logger.enabled &&
    typeof HTMLElement !== 'undefined' &&
    element instanceof HTMLElement &&
    element.hasAttribute('debug') &&
    levels.includes(Logger.logLevel)
  );
}

function shouldLogElementError(element) {
  return (
    Logger.enabled &&
    typeof HTMLElement !== 'undefined' &&
    element instanceof HTMLElement &&
    element.hasAttribute('debug')
  );
}

function writeConsole(level, prefix, message, args) {
  recordLog(level, prefix, message, args);

  if (level === LogLevel.DEBUG) {
    console.debug(prefix, message, ...args);
    return;
  }

  if (level === LogLevel.INFO) {
    console.info(prefix, message, ...args);
    return;
  }

  if (level === LogLevel.WARN) {
    console.warn(prefix, message, ...args);
    return;
  }

  console.error(prefix, message, ...args);
}

export const Logger = {
  enabled: true,
  logLevel: getInitialLogLevel(),
  namespaces: {
    system: true,
  },

  diagnostics: {
    eventName: LOG_EVENT_NAME,
    globalName: DIAGNOSTICS_GLOBAL,
    get entries() {
      return getDiagnosticsStore()?.entries || [];
    },
    clear() {
      getDiagnosticsStore()?.clear();
    }
  },

  system: {
    debug: (message, ...args) => {
      if (shouldLog([LogLevel.DEBUG])) {
        writeConsole(LogLevel.DEBUG, '[HTMLeX SYSTEM DEBUG]', message, args);
      }
    },
    info: (message, ...args) => {
      if (shouldLog([LogLevel.DEBUG, LogLevel.INFO])) {
        writeConsole(LogLevel.INFO, '[HTMLeX SYSTEM INFO]', message, args);
      }
    },
    warn: (message, ...args) => {
      if (shouldLog([LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN])) {
        writeConsole(LogLevel.WARN, '[HTMLeX SYSTEM WARN]', message, args);
      }
    },
    error: (message, ...args) => {
      if (Logger.enabled && Logger.namespaces.system) {
        writeConsole(LogLevel.ERROR, '[HTMLeX SYSTEM ERROR]', message, args);
      }
    }
  },

  element: {
    debug: (element, message, ...args) => {
      if (shouldLogElement(element, [LogLevel.DEBUG])) {
        writeConsole(LogLevel.DEBUG, '[HTMLeX DEBUG]', message, [element, ...args]);
      }
    },
    info: (element, message, ...args) => {
      if (shouldLogElement(element, [LogLevel.DEBUG, LogLevel.INFO])) {
        writeConsole(LogLevel.INFO, '[HTMLeX INFO]', message, [element, ...args]);
      }
    },
    warn: (element, message, ...args) => {
      if (shouldLogElement(element, [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN])) {
        writeConsole(LogLevel.WARN, '[HTMLeX WARN]', message, [element, ...args]);
      }
    },
    error: (element, message, ...args) => {
      if (shouldLogElementError(element)) {
        writeConsole(LogLevel.ERROR, '[HTMLeX ERROR]', message, [element, ...args]);
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
