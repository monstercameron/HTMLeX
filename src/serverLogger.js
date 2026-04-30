import { inspect } from 'node:util';

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
  const normalizedLevel = safeString(level, '').trim().toLowerCase();
  return Object.hasOwn(LEVEL_PRIORITY, normalizedLevel) ? normalizedLevel : 'info';
}

function getLogLevel() {
  return normalizeLogLevel(process.env.HTMLEX_LOG_LEVEL || 'info');
}

function shouldLog(level) {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getLogLevel()];
}

function getLogFormat() {
  return safeString(process.env.HTMLEX_LOG_FORMAT, '').trim().toLowerCase() === 'json' ? 'json' : 'text';
}

function inspectValue(value) {
  try {
    return inspect(value, {
      breakLength: Number.POSITIVE_INFINITY,
      colors: false,
      compact: true,
      depth: 5,
    });
  } catch {
    return '[Uninspectable]';
  }
}

function safeString(value, fallback = '[Unstringifiable]') {
  try {
    return String(value ?? fallback);
  } catch {
    return fallback;
  }
}

function safeErrorMessage(error) {
  try {
    return safeString(error?.message || error, '[Unserializable error]');
  } catch {
    return '[Unserializable error]';
  }
}

function getConstructorName(value) {
  try {
    return value?.constructor?.name || 'Object';
  } catch {
    return 'Object';
  }
}

function getErrorProperty(error, propertyName) {
  try {
    return error[propertyName];
  } catch (propertyError) {
    return `[Unserializable: ${safeErrorMessage(propertyError)}]`;
  }
}

function isErrorLike(value) {
  try {
    return value instanceof Error;
  } catch {
    return false;
  }
}

function isBufferLike(value) {
  try {
    return Buffer.isBuffer(value);
  } catch {
    return false;
  }
}

function isArrayBufferViewLike(value) {
  try {
    return ArrayBuffer.isView(value);
  } catch {
    return false;
  }
}

function isDateLike(value) {
  try {
    return value instanceof Date;
  } catch {
    return false;
  }
}

function isArrayLike(value) {
  try {
    return Array.isArray(value);
  } catch {
    return false;
  }
}

function getCollectionLength(value) {
  try {
    const length = value.length;
    return Number.isSafeInteger(length) && length > 0 ? length : 0;
  } catch {
    return 0;
  }
}

function getCollectionItem(value, index) {
  try {
    return value[index];
  } catch (error) {
    return `[Unserializable: ${safeErrorMessage(error)}]`;
  }
}

function getBufferByteLength(value) {
  try {
    return value.byteLength;
  } catch {
    return 0;
  }
}

function getDateTimestamp(value) {
  try {
    return value.getTime();
  } catch {
    return Number.NaN;
  }
}

function getDateIsoString(value) {
  try {
    return value.toISOString();
  } catch {
    return '[Invalid Date]';
  }
}

function getCurrentIsoTimestamp() {
  try {
    return new Date().toISOString();
  } catch {
    return '1970-01-01T00:00:00.000Z';
  }
}

function getRequestField(req, fieldName, fallback = undefined) {
  try {
    return req?.[fieldName] ?? fallback;
  } catch {
    return fallback;
  }
}

function getRequestPath(req) {
  return getRequestField(req, 'originalUrl') || getRequestField(req, 'url');
}

function getRequestHeader(req, name) {
  try {
    return typeof req?.get === 'function' ? req.get(name) : undefined;
  } catch {
    return undefined;
  }
}

function markRequestIssueLogged(req) {
  try {
    if (req && typeof req === 'object') {
      req._htmlexIssueLogged = true;
    }
  } catch {
    // Logging must never be the reason a request fails.
  }
}

function appendLogDetail(details, key, value) {
  const normalized = {};
  if (details && typeof details === 'object') {
    let keys;
    try {
      keys = Object.keys(details);
    } catch (error) {
      normalized.details = `[Unserializable: ${safeErrorMessage(error)}]`;
      keys = [];
    }

    for (const detailKey of keys) {
      try {
        normalized[detailKey] = details[detailKey];
      } catch (error) {
        normalized[detailKey] = `[Unserializable: ${safeErrorMessage(error)}]`;
      }
    }
  }

  if (value !== undefined) {
    normalized[key] = value;
  }
  return normalized;
}

function getRecordField(record, key, fallback = '') {
  try {
    return record?.[key] ?? fallback;
  } catch {
    return fallback;
  }
}

function getRecordDetails(record) {
  if (!record || typeof record !== 'object') return {};

  let keys;
  try {
    keys = Object.keys(record);
  } catch (error) {
    return {
      details: `[Unserializable: ${safeErrorMessage(error)}]`
    };
  }

  const details = {};
  for (const key of keys) {
    if (key === 'timestamp' || key === 'level' || key === 'scope' || key === 'message') continue;
    try {
      details[key] = normalizeLogValue(record[key]);
    } catch (error) {
      details[key] = `[Unserializable: ${safeErrorMessage(error)}]`;
    }
  }
  return details;
}

export function normalizeError(error) {
  if (isErrorLike(error)) {
    return {
      name: getErrorProperty(error, 'name'),
      message: getErrorProperty(error, 'message'),
      code: getErrorProperty(error, 'code'),
      stack: getErrorProperty(error, 'stack'),
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
    return `${safeString(value)}n`;
  }
  if (valueType === 'symbol' || valueType === 'function') {
    return safeString(value);
  }
  if (isErrorLike(value)) {
    return normalizeError(value);
  }
  if (isBufferLike(value)) {
    return `[Buffer ${getCollectionLength(value)} bytes]`;
  }
  if (isArrayBufferViewLike(value)) {
    return `[${getConstructorName(value)} ${getBufferByteLength(value)} bytes]`;
  }
  if (isDateLike(value)) {
    const timestamp = getDateTimestamp(value);
    return Number.isFinite(timestamp) ? getDateIsoString(value) : '[Invalid Date]';
  }
  if (valueType !== 'object') {
    return inspectValue(value);
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  if (depth >= MAX_SERIALIZE_DEPTH) {
    return `[MaxDepth:${getConstructorName(value)}]`;
  }

  seen.add(value);

  if (isArrayLike(value)) {
    const length = getCollectionLength(value);
    const normalized = [];
    for (let index = 0; index < Math.min(length, MAX_ARRAY_ITEMS); index += 1) {
      normalized.push(normalizeLogValue(getCollectionItem(value, index), seen, depth + 1));
    }
    if (length > MAX_ARRAY_ITEMS) {
      normalized.push(`[${length - MAX_ARRAY_ITEMS} more item(s)]`);
    }
    seen.delete(value);
    return normalized;
  }

  let keys;
  try {
    keys = Object.keys(value);
  } catch (error) {
    seen.delete(value);
    return `[Unserializable: ${safeErrorMessage(error)}]`;
  }
  const normalized = {};
  for (const key of keys.slice(0, MAX_OBJECT_KEYS)) {
    try {
      normalized[key] = normalizeLogValue(value[key], seen, depth + 1);
    } catch (error) {
      normalized[key] = `[Unserializable: ${safeErrorMessage(error)}]`;
    }
  }
  if (keys.length > MAX_OBJECT_KEYS) {
    normalized.__truncatedKeys = keys.length - MAX_OBJECT_KEYS;
  }
  seen.delete(value);
  return normalized;
}

export function getRequestContext(req, extra = {}) {
  return {
    requestId: getRequestField(req, 'requestId'),
    method: getRequestField(req, 'method'),
    path: getRequestPath(req),
    routeName: getRequestField(req, 'routeName'),
    ip: getRequestField(req, 'ip'),
    userAgent: getRequestHeader(req, 'user-agent'),
    ...extra,
  };
}

function cleanDetails(details = {}) {
  if (!details || typeof details !== 'object') return {};

  let keys;
  try {
    keys = Object.keys(details);
  } catch (error) {
    return {
      details: `[Unserializable: ${safeErrorMessage(error)}]`
    };
  }

  const normalized = {};
  for (const key of keys) {
    let value;
    try {
      value = details[key];
    } catch (error) {
      normalized[key] = `[Unserializable: ${safeErrorMessage(error)}]`;
      continue;
    }
    if (value !== undefined) {
      normalized[key] = normalizeLogValue(value);
    }
  }
  return normalized;
}

export function createLogRecord(level, scope, message, details = {}) {
  return {
    timestamp: getCurrentIsoTimestamp(),
    level: safeString(level),
    scope: safeString(scope),
    message: safeString(message),
    ...cleanDetails(details),
  };
}

export function formatLogRecord(record, format = getLogFormat()) {
  if (format === 'json') {
    try {
      return JSON.stringify(normalizeLogValue(record));
    } catch {
      return '{"level":"error","scope":"logger","message":"Failed to serialize log record."}';
    }
  }

  const timestamp = safeString(getRecordField(record, 'timestamp'));
  const level = safeString(getRecordField(record, 'level', 'info'));
  const scope = safeString(getRecordField(record, 'scope', 'app'));
  const message = safeString(getRecordField(record, 'message'));
  const details = getRecordDetails(record);
  const suffix = Object.keys(details).length ? ` ${inspectValue(details)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] [${scope}] ${message}${suffix}`;
}

function writeLog(level, scope, message, details = {}) {
  if (!shouldLog(level)) return;

  const line = formatLogRecord(createLogRecord(level, scope, message, details));

  try {
    if (level === 'error' || level === 'fatal') {
      console.error(line);
      return;
    }

    if (level === 'warn') {
      console.warn(line);
      return;
    }

    console.info(line);
  } catch {
    // Console transports can be replaced by tests or hosts; logging is best-effort.
  }
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
    writeLog('error', scope, message, appendLogDetail(details, 'error', error ? normalizeError(error) : undefined));
  },
  fatal(scope, message, error = null, details = {}) {
    writeLog('fatal', scope, message, appendLogDetail(details, 'error', error ? normalizeError(error) : undefined));
  },
};

export function logRequestWarning(req, message, details = {}) {
  markRequestIssueLogged(req);
  serverLogger.warn('http', message, getRequestContext(req, details));
}

export function logRequestError(req, message, error, details = {}) {
  markRequestIssueLogged(req);
  serverLogger.error('http', message, error, getRequestContext(req, details));
}

export function logFeatureWarning(scope, message, details = {}) {
  serverLogger.warn(scope, message, details);
}

export function logFeatureError(scope, message, error, details = {}) {
  serverLogger.error(scope, message, error, details);
}
