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
