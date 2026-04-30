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

test('debounce handles non-browser runtimes without Event globals', async () => {
  const wasEnabled = Logger.enabled;
  const originalEvent = globalThis.Event;
  Logger.enabled = false;
  delete globalThis.Event;

  try {
    const seen = [];
    const debounced = debounce(value => {
      seen.push(value);
      return 'done';
    }, 1);

    assert.equal(await debounced({ type: 'plain-object' }), 'done');
    assert.deepEqual(seen, [{ type: 'plain-object' }]);
  } finally {
    if (originalEvent === undefined) {
      delete globalThis.Event;
    } else {
      globalThis.Event = originalEvent;
    }
    Logger.enabled = wasEnabled;
  }
});

test('debounce handles non-constructor Event globals structurally', async () => {
  const wasEnabled = Logger.enabled;
  const originalEvent = globalThis.Event;
  Logger.enabled = false;
  globalThis.Event = {};

  try {
    const seen = [];
    let preventedCount = 0;
    const sourceEvent = {
      type: 'submit',
      target: { id: 'source' },
      currentTarget: { id: 'current' },
      defaultPrevented: false,
      preventDefault() {
        preventedCount += 1;
      },
      stopPropagation() {},
      stopImmediatePropagation() {},
    };
    const debounced = debounce((event) => {
      seen.push(event);
      event.preventDefault();
    }, 1);

    await debounced(sourceEvent);

    assert.equal(seen.length, 1);
    assert.notEqual(seen[0], sourceEvent);
    assert.equal(seen[0].type, 'submit');
    assert.equal(seen[0].target.id, 'source');
    assert.equal(preventedCount, 1);
  } finally {
    if (originalEvent === undefined) {
      delete globalThis.Event;
    } else {
      globalThis.Event = originalEvent;
    }
    Logger.enabled = wasEnabled;
  }
});

test('debounce snapshots hostile event objects without leaking getter or method failures', async () => {
  const wasEnabled = Logger.enabled;
  Logger.enabled = false;
  const sourceEvent = {
    type: 'submit',
    get target() {
      throw new Error('target denied');
    },
    get currentTarget() {
      throw new Error('current target denied');
    },
    get defaultPrevented() {
      throw new Error('default prevented denied');
    },
    preventDefault() {
      throw new Error('prevent denied');
    },
    stopPropagation() {},
    stopImmediatePropagation() {},
  };
  const debounced = debounce((event) => {
    assert.equal(event.type, 'submit');
    assert.equal(event.target, undefined);
    assert.equal(event.currentTarget, undefined);
    assert.equal(event.defaultPrevented, undefined);
    assert.doesNotThrow(() => event.preventDefault());
    return 'done';
  }, 1);

  try {
    assert.equal(await debounced(sourceEvent), 'done');
  } finally {
    Logger.enabled = wasEnabled;
  }
});

test('debounce and throttle clamp invalid delay values before scheduling timers', async () => {
  const wasEnabled = Logger.enabled;
  const originalSetTimeout = globalThis.setTimeout;
  const scheduledDelays = [];
  Logger.enabled = false;
  globalThis.setTimeout = (callback, delayMs, ...args) => {
    scheduledDelays.push(delayMs);
    return originalSetTimeout(callback, 0, ...args);
  };

  const debounced = debounce(() => 'debounced', -10);
  const throttled = throttle(() => 'throttled', Number.POSITIVE_INFINITY);

  try {
    assert.equal(await debounced(), 'debounced');
    assert.equal(await throttled(), 'throttled');
    assert.deepEqual(scheduledDelays, [0]);
  } finally {
    throttled.cancel();
    globalThis.setTimeout = originalSetTimeout;
    Logger.enabled = wasEnabled;
  }
});

test('throttle with invalid or zero delay does not suppress immediate calls', async () => {
  const wasEnabled = Logger.enabled;
  Logger.enabled = false;
  const calls = [];
  const throttled = throttle((value) => {
    calls.push(value);
    return value;
  }, 0);

  try {
    assert.equal(await throttled('first'), 'first');
    assert.equal(await throttled('second'), 'second');
    assert.deepEqual(calls, ['first', 'second']);
  } finally {
    Logger.enabled = wasEnabled;
  }
});

test('debounce and throttle run when timer APIs are unavailable', async () => {
  const wasEnabled = Logger.enabled;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  Logger.enabled = false;
  delete globalThis.setTimeout;
  delete globalThis.clearTimeout;

  try {
    const debounced = debounce(() => 'debounced', 10);
    const throttled = throttle(() => 'throttled', 10);

    assert.equal(await debounced(), 'debounced');
    assert.equal(await throttled(), 'throttled');
    assert.equal(await throttled(), 'throttled');
  } finally {
    if (originalSetTimeout === undefined) {
      delete globalThis.setTimeout;
    } else {
      globalThis.setTimeout = originalSetTimeout;
    }
    if (originalClearTimeout === undefined) {
      delete globalThis.clearTimeout;
    } else {
      globalThis.clearTimeout = originalClearTimeout;
    }
    Logger.enabled = wasEnabled;
  }
});

test('debounce and throttle cancel tolerate failing clearTimeout', async () => {
  const wasEnabled = Logger.enabled;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  Logger.enabled = false;
  globalThis.setTimeout = () => 0;
  globalThis.clearTimeout = () => {
    throw new Error('clear denied');
  };

  try {
    const debounced = debounce(() => 'debounced', 10);
    const throttled = throttle(() => 'throttled', 10);
    const pending = debounced();
    await throttled();

    assert.doesNotThrow(() => debounced.cancel());
    assert.doesNotThrow(() => throttled.cancel());
    assert.equal(await pending, undefined);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
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
