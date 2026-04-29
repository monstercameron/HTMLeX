import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLogRecord,
  formatLogRecord,
  getRequestContext,
  normalizeError,
  normalizeLogValue,
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
