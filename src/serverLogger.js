import { inspect } from 'util';

const LEVEL_PRIORITY = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
  silent: Number.POSITIVE_INFINITY,
};
const MAX_SERIALIZE_DEPTH = 5;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 50;

function normalizeLogLevel(level) {
  return Object.hasOwn(LEVEL_PRIORITY, level) ? level : 'info';
}

function getLogLevel() {
  return normalizeLogLevel(process.env.HTMLEX_LOG_LEVEL || 'info');
}

function shouldLog(level) {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getLogLevel()];
}

function getLogFormat() {
  return process.env.HTMLEX_LOG_FORMAT === 'json' ? 'json' : 'text';
}

function inspectValue(value) {
  return inspect(value, {
    breakLength: Number.POSITIVE_INFINITY,
    colors: false,
    compact: true,
    depth: 5,
  });
}

export function normalizeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack,
    };
  }

  return {
    name: 'NonError',
    message: typeof error === 'string' ? error : inspectValue(error),
  };
}

export function normalizeLogValue(value, seen = new WeakSet(), depth = 0) {
  if (value === null || value === undefined) return value;

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
    return value;
  }
  if (valueType === 'bigint') {
    return `${value.toString()}n`;
  }
  if (valueType === 'symbol' || valueType === 'function') {
    return String(value);
  }
  if (value instanceof Error) {
    return normalizeError(value);
  }
  if (Buffer.isBuffer(value)) {
    return `[Buffer ${value.length} bytes]`;
  }
  if (ArrayBuffer.isView(value)) {
    return `[${value.constructor.name} ${value.byteLength} bytes]`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (valueType !== 'object') {
    return inspectValue(value);
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  if (depth >= MAX_SERIALIZE_DEPTH) {
    return `[MaxDepth:${value.constructor?.name || 'Object'}]`;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const normalized = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map(item => normalizeLogValue(item, seen, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      normalized.push(`[${value.length - MAX_ARRAY_ITEMS} more item(s)]`);
    }
    return normalized;
  }

  const keys = Object.keys(value);
  const normalized = {};
  for (const key of keys.slice(0, MAX_OBJECT_KEYS)) {
    try {
      normalized[key] = normalizeLogValue(value[key], seen, depth + 1);
    } catch (error) {
      normalized[key] = `[Unserializable: ${error.message}]`;
    }
  }
  if (keys.length > MAX_OBJECT_KEYS) {
    normalized.__truncatedKeys = keys.length - MAX_OBJECT_KEYS;
  }
  return normalized;
}

export function getRequestContext(req, extra = {}) {
  return {
    requestId: req?.requestId,
    method: req?.method,
    path: req?.originalUrl || req?.url,
    routeName: req?.routeName,
    ip: req?.ip,
    userAgent: typeof req?.get === 'function' ? req.get('user-agent') : undefined,
    ...extra,
  };
}

function cleanDetails(details = {}) {
  return Object.fromEntries(
    Object.entries(details)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, normalizeLogValue(value)])
  );
}

export function createLogRecord(level, scope, message, details = {}) {
  return {
    timestamp: new Date().toISOString(),
    level: String(level),
    scope: String(scope),
    message: String(message),
    ...cleanDetails(details),
  };
}

export function formatLogRecord(record, format = getLogFormat()) {
  if (format === 'json') {
    return JSON.stringify(normalizeLogValue(record));
  }

  const { timestamp, level, scope, message, ...details } = record;
  const suffix = Object.keys(details).length ? ` ${inspectValue(details)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] [${scope}] ${message}${suffix}`;
}

function writeLog(level, scope, message, details = {}) {
  if (!shouldLog(level)) return;

  const line = formatLogRecord(createLogRecord(level, scope, message, details));

  if (level === 'error' || level === 'fatal') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.info(line);
}

export const serverLogger = {
  debug(scope, message, details = {}) {
    writeLog('debug', scope, message, details);
  },
  info(scope, message, details = {}) {
    writeLog('info', scope, message, details);
  },
  warn(scope, message, details = {}) {
    writeLog('warn', scope, message, details);
  },
  error(scope, message, error = null, details = {}) {
    writeLog('error', scope, message, {
      ...details,
      error: error ? normalizeError(error) : undefined,
    });
  },
  fatal(scope, message, error = null, details = {}) {
    writeLog('fatal', scope, message, {
      ...details,
      error: error ? normalizeError(error) : undefined,
    });
  },
};

export function logRequestWarning(req, message, details = {}) {
  if (req) req._htmlexIssueLogged = true;
  serverLogger.warn('http', message, getRequestContext(req, details));
}

export function logRequestError(req, message, error, details = {}) {
  if (req) req._htmlexIssueLogged = true;
  serverLogger.error('http', message, error, getRequestContext(req, details));
}

export function logFeatureWarning(scope, message, details = {}) {
  serverLogger.warn(scope, message, details);
}

export function logFeatureError(scope, message, error, details = {}) {
  serverLogger.error(scope, message, error, details);
}
