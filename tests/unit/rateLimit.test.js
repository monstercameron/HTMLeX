import assert from 'node:assert/strict';
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
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(calls, 0);
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
