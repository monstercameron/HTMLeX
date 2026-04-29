import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { Logger } from '../../src/public/src/logger.js';
import { debounce, throttle } from '../../src/public/src/rateLimit.js';

test('throttle converts synchronous handler errors into resolved undefined results', async () => {
  const wasEnabled = Logger.enabled;
  Logger.enabled = false;
  const throttled = throttle(() => {
    throw new Error('boom');
  }, 10);

  try {
    const result = await throttled();
    assert.equal(result, undefined);
  } finally {
    Logger.enabled = wasEnabled;
  }
});

test('debounce cancel resolves pending work without invoking the handler', async () => {
  const wasEnabled = Logger.enabled;
  Logger.enabled = false;
  let calls = 0;
  const debounced = debounce(() => {
    calls += 1;
  }, 20);

  try {
    const pending = debounced();
    debounced.cancel();
    assert.equal(await pending, undefined);
    await delay(40);
    assert.equal(calls, 0);
  } finally {
    Logger.enabled = wasEnabled;
  }
});

test('debounce snapshots Event arguments before delayed execution', async () => {
  const wasEnabled = Logger.enabled;
  Logger.enabled = false;
  const sourceEvent = new Event('submit', { cancelable: true });
  let preventedCount = 0;
  sourceEvent.preventDefault = () => {
    preventedCount += 1;
  };
  sourceEvent.stopPropagation = () => {};
  sourceEvent.stopImmediatePropagation = () => {};
  Object.defineProperty(sourceEvent, 'target', {
    value: { id: 'source' },
    configurable: true,
  });
  Object.defineProperty(sourceEvent, 'currentTarget', {
    value: { id: 'current' },
    configurable: true,
  });

  const seen = [];
  const debounced = debounce((event, marker) => {
    seen.push({ event, marker });
    event.preventDefault();
  }, 5);

  try {
    await debounced(sourceEvent, 'unit');
    assert.equal(seen.length, 1);
    assert.notEqual(seen[0].event, sourceEvent);
    assert.equal(seen[0].event.type, 'submit');
    assert.equal(seen[0].event.target.id, 'source');
    assert.equal(seen[0].event.currentTarget.id, 'current');
    assert.equal(seen[0].marker, 'unit');
    assert.equal(preventedCount, 1);
  } finally {
    Logger.enabled = wasEnabled;
  }
});

test('throttle cancel clears the cooldown timer', async () => {
  const wasEnabled = Logger.enabled;
  Logger.enabled = false;
  let calls = 0;
  const throttled = throttle(() => {
    calls += 1;
  }, 1000);

  try {
    await throttled();
    throttled.cancel();
    await throttled();
    assert.equal(calls, 2);
  } finally {
    Logger.enabled = wasEnabled;
  }
});

test('throttle suppresses calls during cooldown and preserves callback context', async () => {
  const wasEnabled = Logger.enabled;
  Logger.enabled = false;
  const context = { calls: 0 };
  const throttled = throttle(function(value) {
    this.calls += value;
    return this.calls;
  }, 20);

  try {
    assert.equal(await throttled.call(context, 2), 2);
    assert.equal(await throttled.call(context, 3), undefined);
    assert.equal(context.calls, 2);
    await delay(25);
    assert.equal(await throttled.call(context, 4), 6);
  } finally {
    throttled.cancel();
    Logger.enabled = wasEnabled;
  }
});
