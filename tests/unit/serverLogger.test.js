import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLogRecord,
  formatLogRecord,
  getRequestContext,
  logFeatureError,
  logFeatureWarning,
  logRequestError,
  logRequestWarning,
  normalizeError,
  normalizeLogValue,
  serverLogger,
} from '../../src/serverLogger.js';

test('normalizeError preserves useful Error diagnostics', () => {
  const error = new TypeError('Bad input');
  error.code = 'ERR_BAD_INPUT';

  const normalized = normalizeError(error);

  assert.equal(normalized.name, 'TypeError');
  assert.equal(normalized.message, 'Bad input');
  assert.equal(normalized.code, 'ERR_BAD_INPUT');
  assert.match(normalized.stack, /TypeError: Bad input/);
});

test('normalizeError tolerates throwing Error property getters', () => {
  const error = new Error('hostile');
  Object.defineProperty(error, 'stack', {
    configurable: true,
    get() {
      throw new Error('stack getter failed');
    },
  });

  assert.deepEqual(normalizeError(error), {
    name: 'Error',
    message: 'hostile',
    code: undefined,
    stack: '[Unserializable: stack getter failed]',
  });
});

test('normalizeError handles non-Error rejection values', () => {
  const normalized = normalizeError({ reason: 'nope' });

  assert.equal(normalized.name, 'NonError');
  assert.match(normalized.message, /reason/);
});

test('getRequestContext extracts request diagnostics without requiring Express internals', () => {
  const context = getRequestContext({
    requestId: 'req-123',
    method: 'POST',
    originalUrl: '/chat/send',
    routeName: 'chat.send',
    ip: '127.0.0.1',
    get(name) {
      return name === 'user-agent' ? 'unit-test-agent' : undefined;
    },
  }, {
    statusCode: 400,
  });

  assert.deepEqual(context, {
    requestId: 'req-123',
    method: 'POST',
    path: '/chat/send',
    routeName: 'chat.send',
    ip: '127.0.0.1',
    userAgent: 'unit-test-agent',
    statusCode: 400,
  });
});

test('getRequestContext tolerates hostile request getters', () => {
  const request = {};
  for (const fieldName of ['requestId', 'method', 'originalUrl', 'url', 'routeName', 'ip']) {
    Object.defineProperty(request, fieldName, {
      enumerable: true,
      get() {
        throw new Error(`${fieldName} denied`);
      },
    });
  }
  request.get = () => {
    throw new Error('header denied');
  };

  assert.deepEqual(getRequestContext(request, { statusCode: 500 }), {
    requestId: undefined,
    method: undefined,
    path: undefined,
    routeName: undefined,
    ip: undefined,
    userAgent: undefined,
    statusCode: 500,
  });
});

test('formatLogRecord supports readable text and machine-parseable JSON', () => {
  const record = createLogRecord('warn', 'http', 'Request completed with HTTP 404.', {
    requestId: 'req-404',
    statusCode: 404,
  });

  assert.match(
    formatLogRecord(record, 'text'),
    /^\[[^\]]+\] \[WARN\] \[http\] Request completed with HTTP 404\. \{ requestId: 'req-404', statusCode: 404 \}$/
  );

  assert.deepEqual(JSON.parse(formatLogRecord(record, 'json')), record);
});

test('log records preserve fallback text for nullish unsafe fields', () => {
  assert.deepEqual(
    {
      level: createLogRecord(null, 'unit', 'message').level,
      scope: createLogRecord('warn', null, 'message').scope,
      message: createLogRecord('warn', 'unit', null).message,
    },
    {
      level: '[Unstringifiable]',
      scope: '[Unstringifiable]',
      message: '[Unstringifiable]',
    }
  );
});

test('logger environment settings are normalized before filtering and formatting', () => {
  const originalLevel = process.env.HTMLEX_LOG_LEVEL;
  const originalFormat = process.env.HTMLEX_LOG_FORMAT;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const lines = {
    info: [],
    warn: [],
  };
  console.info = line => lines.info.push(line);
  console.warn = line => lines.warn.push(line);
  process.env.HTMLEX_LOG_LEVEL = ' WARN ';
  process.env.HTMLEX_LOG_FORMAT = ' JSON ';

  try {
    serverLogger.info('unit', 'hidden');
    serverLogger.warn('unit', 'visible');

    assert.equal(lines.info.length, 0);
    assert.equal(lines.warn.length, 1);
    assert.equal(JSON.parse(lines.warn[0]).message, 'visible');
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
    if (originalLevel === undefined) {
      delete process.env.HTMLEX_LOG_LEVEL;
    } else {
      process.env.HTMLEX_LOG_LEVEL = originalLevel;
    }
    if (originalFormat === undefined) {
      delete process.env.HTMLEX_LOG_FORMAT;
    } else {
      process.env.HTMLEX_LOG_FORMAT = originalFormat;
    }
  }
});

test('log serialization is safe for circular objects and BigInt values', () => {
  const circular = {
    name: 'root',
    count: 2n,
  };
  circular.self = circular;
  Object.defineProperty(circular, 'volatile', {
    enumerable: true,
    get() {
      throw new Error('getter exploded');
    },
  });

  assert.deepEqual(
    normalizeLogValue(circular),
    {
      name: 'root',
      count: '2n',
      self: '[Circular]',
      volatile: '[Unserializable: getter exploded]',
    }
  );

  const record = createLogRecord('warn', 'diagnostics', 'Unsafe payload', { circular });
  assert.deepEqual(JSON.parse(formatLogRecord(record, 'json')).circular, {
    name: 'root',
    count: '2n',
    self: '[Circular]',
    volatile: '[Unserializable: getter exploded]',
  });
});

test('log serialization formats BigInt values without relying on prototype toString', () => {
  const originalToString = BigInt.prototype.toString;
  BigInt.prototype.toString = () => {
    throw new Error('bigint string unavailable');
  };

  try {
    assert.equal(normalizeLogValue(2n), '2n');
  } finally {
    BigInt.prototype.toString = originalToString;
  }
});

test('log serialization treats repeated references as repeated values, not circular values', () => {
  const shared = { value: 'same-object' };

  assert.deepEqual(normalizeLogValue({ first: shared, second: shared }), {
    first: { value: 'same-object' },
    second: { value: 'same-object' },
  });
  assert.deepEqual(normalizeLogValue([shared, shared]), [
    { value: 'same-object' },
    { value: 'same-object' },
  ]);
});

test('log serialization tolerates hostile array entries without relying on Array methods', () => {
  const hostileArray = ['first', 'second'];
  Object.defineProperty(hostileArray, '1', {
    get() {
      throw new Error('array item failed');
    },
  });
  Object.defineProperty(hostileArray, 'slice', {
    get() {
      throw new Error('slice denied');
    },
  });

  assert.deepEqual(normalizeLogValue(hostileArray), [
    'first',
    '[Unserializable: array item failed]',
  ]);
});

test('log serialization handles invalid Date instances without throwing', () => {
  assert.equal(normalizeLogValue(new Date('not-a-date')), '[Invalid Date]');
  assert.deepEqual(normalizeLogValue({ when: new Date('not-a-date') }), {
    when: '[Invalid Date]',
  });
});

test('log serialization tolerates hostile object keys and detail getters', () => {
  const hostileValue = new Proxy({}, {
    ownKeys() {
      throw new Error('own keys failed');
    },
  });
  const hostileDetails = {};
  Object.defineProperty(hostileDetails, 'volatile', {
    enumerable: true,
    get() {
      throw new Error('detail getter failed');
    },
  });

  assert.equal(normalizeLogValue(hostileValue), '[Unserializable: own keys failed]');
  const record = createLogRecord('warn', 'unit', 'hostile', hostileDetails);
  assert.match(record.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(record.level, 'warn');
  assert.equal(record.scope, 'unit');
  assert.equal(record.message, 'hostile');
  assert.equal(record.volatile, '[Unserializable: detail getter failed]');
});

test('log serialization tolerates throwing constructors at max depth', () => {
  const payload = {
    child: {
      child: {
        child: {
          child: {
            child: {},
          },
        },
      },
    },
  };
  Object.defineProperty(payload.child.child.child.child.child, 'constructor', {
    get() {
      throw new Error('constructor getter failed');
    },
  });

  assert.equal(normalizeLogValue(payload).child.child.child.child.child, '[MaxDepth:Object]');
});

test('log serialization tolerates throwing typed-array constructors', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  Object.defineProperty(bytes, 'constructor', {
    get() {
      throw new Error('typed array constructor failed');
    },
  });

  assert.equal(normalizeLogValue(bytes), '[Object 3 bytes]');
});

test('logger calls tolerate hostile details and unstringifiable messages', () => {
  const originalLevel = process.env.HTMLEX_LOG_LEVEL;
  const originalFormat = process.env.HTMLEX_LOG_FORMAT;
  const originalError = console.error;
  const errors = [];
  const hostileDetails = new Proxy({}, {
    ownKeys() {
      throw new Error('details own keys failed');
    },
  });
  const hostileMessage = {
    toString() {
      throw new Error('message string failed');
    },
  };
  console.error = line => errors.push(line);
  process.env.HTMLEX_LOG_LEVEL = 'error';
  process.env.HTMLEX_LOG_FORMAT = 'json';

  try {
    assert.doesNotThrow(() => {
      serverLogger.error('unit', hostileMessage, new Error('bad'), hostileDetails);
    });

    const parsed = JSON.parse(errors[0]);
    assert.equal(parsed.message, '[Unstringifiable]');
    assert.equal(parsed.details, '[Unserializable: details own keys failed]');
    assert.equal(parsed.error.message, 'bad');
  } finally {
    console.error = originalError;
    if (originalLevel === undefined) {
      delete process.env.HTMLEX_LOG_LEVEL;
    } else {
      process.env.HTMLEX_LOG_LEVEL = originalLevel;
    }
    if (originalFormat === undefined) {
      delete process.env.HTMLEX_LOG_FORMAT;
    } else {
      process.env.HTMLEX_LOG_FORMAT = originalFormat;
    }
  }
});

test('logger calls tolerate failing console writers and request marker setters', () => {
  const originalLevel = process.env.HTMLEX_LOG_LEVEL;
  const originalWarn = console.warn;
  const originalError = console.error;
  const request = {
    get() {
      throw new Error('agent denied');
    },
  };
  Object.defineProperty(request, '_htmlexIssueLogged', {
    set() {
      throw new Error('marker denied');
    },
  });
  console.warn = () => {
    throw new Error('warn denied');
  };
  console.error = () => {
    throw new Error('error denied');
  };
  process.env.HTMLEX_LOG_LEVEL = 'warn';

  try {
    assert.doesNotThrow(() => logRequestWarning(request, 'warning'));
    assert.doesNotThrow(() => logRequestError(request, 'error', new Error('failed')));
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
    if (originalLevel === undefined) {
      delete process.env.HTMLEX_LOG_LEVEL;
    } else {
      process.env.HTMLEX_LOG_LEVEL = originalLevel;
    }
  }
});

test('formatLogRecord protects JSON formatting even for unsafe raw records', () => {
  const record = {
    timestamp: '2026-04-29T00:00:00.000Z',
    level: 'warn',
    scope: 'diagnostics',
    message: 'Unsafe raw record',
  };
  record.self = record;

  assert.equal(JSON.parse(formatLogRecord(record, 'json')).self, '[Circular]');
});

test('formatLogRecord protects text formatting for hostile raw records', () => {
  const record = new Proxy({
    timestamp: '2026-04-29T00:00:00.000Z',
    level: 'warn',
    scope: 'diagnostics',
    message: 'Unsafe raw record',
  }, {
    ownKeys() {
      throw new Error('record own keys failed');
    },
  });

  assert.match(
    formatLogRecord(record, 'text'),
    /\[WARN\] \[diagnostics\] Unsafe raw record \{ details: '\[Unserializable: record own keys failed\]' \}/
  );
});

test('logger helpers honor log levels and route output by severity', () => {
  const originalLevel = process.env.HTMLEX_LOG_LEVEL;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;
  const lines = {
    info: [],
    warn: [],
    error: [],
  };
  console.info = line => lines.info.push(line);
  console.warn = line => lines.warn.push(line);
  console.error = line => lines.error.push(line);
  process.env.HTMLEX_LOG_LEVEL = 'warn';

  try {
    serverLogger.info('unit', 'hidden');
    serverLogger.warn('unit', 'visible warning', { flag: true });
    serverLogger.error('unit', 'visible error', new Error('bad'));

    assert.equal(lines.info.length, 0);
    assert.equal(lines.warn.length, 1);
    assert.match(lines.warn[0], /visible warning/);
    assert.equal(lines.error.length, 1);
    assert.match(lines.error[0], /visible error/);
    assert.match(lines.error[0], /bad/);
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    if (originalLevel === undefined) {
      delete process.env.HTMLEX_LOG_LEVEL;
    } else {
      process.env.HTMLEX_LOG_LEVEL = originalLevel;
    }
  }
});

test('request and feature log helpers mark handled requests and normalize details', () => {
  const originalLevel = process.env.HTMLEX_LOG_LEVEL;
  const originalWarn = console.warn;
  const originalError = console.error;
  const warnings = [];
  const errors = [];
  console.warn = line => warnings.push(line);
  console.error = line => errors.push(line);
  process.env.HTMLEX_LOG_LEVEL = 'warn';

  const request = {
    requestId: 'req-log',
    method: 'GET',
    url: '/unit',
    get() {
      return 'unit-agent';
    },
  };

  try {
    logRequestWarning(request, 'warned request', { payload: { value: 1n } });
    logRequestError(request, 'errored request', new Error('failed'), { statusCode: 500 });
    logFeatureWarning('feature.unit', 'feature warning', { items: [1, 2] });
    logFeatureError('feature.unit', 'feature error', 'non-error');

    assert.equal(request._htmlexIssueLogged, true);
    assert.equal(warnings.length, 2);
    assert.match(warnings.join('\n'), /warned request/);
    assert.match(warnings.join('\n'), /feature warning/);
    assert.equal(errors.length, 2);
    assert.match(errors.join('\n'), /errored request/);
    assert.match(errors.join('\n'), /feature error/);
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
    if (originalLevel === undefined) {
      delete process.env.HTMLEX_LOG_LEVEL;
    } else {
      process.env.HTMLEX_LOG_LEVEL = originalLevel;
    }
  }
});
