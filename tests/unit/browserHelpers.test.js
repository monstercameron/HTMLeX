import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import test, { afterEach, beforeEach } from 'node:test';
import { getCache, setCache } from '../../src/public/src/cache.js';
import {
  hasHTMLeXMarkup,
  parseTargets,
  performInnerHTMLUpdate,
  querySelectorAllSafe,
  querySelectorAllResult,
  querySelectorSafe,
  updateTarget,
} from '../../src/public/src/dom.js';
import { fetchWithTimeout } from '../../src/public/src/fetchHelper.js';
import { installRuntimeErrorBoundary, Logger, LogLevel } from '../../src/public/src/logger.js';
import {
  __getSignalListenerCount,
  emitSignal,
  registerSignalListener,
} from '../../src/public/src/signals.js';
import { handleURLState } from '../../src/public/src/urlState.js';
import { isSequential, scheduleUpdate } from '../../src/public/src/utils.js';
import { handleWebSocket } from '../../src/public/src/websocket.js';

let originalFetch;
let originalHistory;
let originalDocument;
let originalElement;
let originalHTMLElement;
let originalEvent;
let originalNode;
let originalAbortController;
let originalCustomEvent;
let originalIo;
let originalMutationObserver;
let originalRequestAnimationFrame;
let originalDebug;
let originalInfo;
let originalError;
let originalWarn;
let originalWindow;
let originalLoggerEnabled;
let originalLoggerLevel;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalHistory = globalThis.history;
  originalDocument = globalThis.document;
  originalElement = globalThis.Element;
  originalHTMLElement = globalThis.HTMLElement;
  originalEvent = globalThis.Event;
  originalNode = globalThis.Node;
  originalAbortController = globalThis.AbortController;
  originalCustomEvent = globalThis.CustomEvent;
  originalIo = globalThis.io;
  originalMutationObserver = globalThis.MutationObserver;
  originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  originalDebug = console.debug;
  originalInfo = console.info;
  originalError = console.error;
  originalWarn = console.warn;
  originalWindow = globalThis.window;
  originalLoggerEnabled = Logger.enabled;
  originalLoggerLevel = Logger.logLevel;
  Logger.enabled = false;
});

afterEach(() => {
  if (originalFetch === undefined) {
    delete globalThis.fetch;
  } else {
    globalThis.fetch = originalFetch;
  }

  if (originalHistory === undefined) {
    delete globalThis.history;
  } else {
    globalThis.history = originalHistory;
  }

  if (originalDocument === undefined) {
    delete globalThis.document;
  } else {
    globalThis.document = originalDocument;
  }

  if (originalElement === undefined) {
    delete globalThis.Element;
  } else {
    globalThis.Element = originalElement;
  }

  if (originalHTMLElement === undefined) {
    delete globalThis.HTMLElement;
  } else {
    globalThis.HTMLElement = originalHTMLElement;
  }

  if (originalEvent === undefined) {
    delete globalThis.Event;
  } else {
    globalThis.Event = originalEvent;
  }

  if (originalNode === undefined) {
    delete globalThis.Node;
  } else {
    globalThis.Node = originalNode;
  }

  if (originalAbortController === undefined) {
    delete globalThis.AbortController;
  } else {
    globalThis.AbortController = originalAbortController;
  }

  if (originalCustomEvent === undefined) {
    delete globalThis.CustomEvent;
  } else {
    globalThis.CustomEvent = originalCustomEvent;
  }

  if (originalIo === undefined) {
    delete globalThis.io;
  } else {
    globalThis.io = originalIo;
  }

  if (originalMutationObserver === undefined) {
    delete globalThis.MutationObserver;
  } else {
    globalThis.MutationObserver = originalMutationObserver;
  }

  if (originalRequestAnimationFrame === undefined) {
    delete globalThis.requestAnimationFrame;
  } else {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }

  console.debug = originalDebug;
  console.info = originalInfo;
  console.error = originalError;
  console.warn = originalWarn;

  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }

  Logger.enabled = originalLoggerEnabled;
  Logger.logLevel = originalLoggerLevel;
});

function createAttributeElement(attributes = {}) {
  return {
    hasAttribute(name) {
      return Object.hasOwn(attributes, name);
    },
    getAttribute(name) {
      return attributes[name] ?? null;
    }
  };
}

test('signal listeners register, emit, isolate failures, and unregister', () => {
  const signalName = `unit:${Date.now()}`;
  const calls = [];
  const cleanupOne = registerSignalListener(signalName, () => {
    calls.push('one');
    throw new Error('listener failure');
  });
  const cleanupTwo = registerSignalListener(signalName, () => calls.push('two'));

  assert.equal(__getSignalListenerCount(signalName), 2);

  emitSignal(signalName);

  assert.deepEqual(calls, ['one', 'two']);

  cleanupOne();
  assert.equal(__getSignalListenerCount(signalName), 1);

  emitSignal(signalName);
  assert.deepEqual(calls, ['one', 'two', 'two']);

  cleanupTwo();
  assert.equal(__getSignalListenerCount(signalName), 0);

  const trimCleanup = registerSignalListener(' unit:trimmed ', () => calls.push('trimmed'));
  assert.equal(__getSignalListenerCount('unit:trimmed'), 1);
  emitSignal(' unit:trimmed ');
  trimCleanup();
  assert.equal(__getSignalListenerCount(' unit:trimmed '), 0);
  assert.equal(calls.at(-1), 'trimmed');
});

test('signal listener registration rejects non-function callbacks', () => {
  const signalName = `unit:invalid-callback:${Date.now()}`;
  const cleanup = registerSignalListener(signalName, 'not a function');

  assert.equal(__getSignalListenerCount(signalName), 0);
  emitSignal(signalName);
  cleanup();
  assert.equal(__getSignalListenerCount(signalName), 0);
});

test('signal emissions capture asynchronous listener failures', async () => {
  const signalName = `unit:async-failure:${Date.now()}`;
  const cleanup = registerSignalListener(signalName, async () => {
    throw new Error('async listener failed');
  });

  emitSignal(signalName);
  await delay(0);

  cleanup();
  assert.equal(__getSignalListenerCount(signalName), 0);
});

test('signal emissions tolerate hostile names and thenables', () => {
  assert.doesNotThrow(() => {
    const cleanup = registerSignalListener({
      toString() {
        throw new Error('signal name unavailable');
      },
    }, () => {});
    cleanup();
  });

  const signalName = `unit:hostile-thenable:${Date.now()}`;
  const cleanup = registerSignalListener(signalName, () => ({
    get then() {
      throw new Error('then getter unavailable');
    },
  }));

  assert.doesNotThrow(() => emitSignal(signalName));
  cleanup();
  assert.equal(__getSignalListenerCount(signalName), 0);
});

test('DOM target parsing normalizes strategies and invalid selector helpers fail closed', () => {
  assert.deepEqual(
    parseTargets('#main(innerHTML) .items(append) #old(remove)'),
    [
      { selector: '#main', strategy: 'innerHTML' },
      { selector: '.items', strategy: 'append' },
      { selector: '#old', strategy: 'remove' },
    ]
  );
  assert.deepEqual(parseTargets('#plainTarget'), [
    { selector: '#plainTarget', strategy: 'innerHTML' },
  ]);
  assert.equal(hasHTMLeXMarkup('<button GET="/todos">Load</button>'), true);
  assert.equal(hasHTMLeXMarkup('<div subscribe="unit:ready"></div>'), true);
  assert.equal(hasHTMLeXMarkup('<div retry-delay="100"></div>'), true);
  assert.equal(hasHTMLeXMarkup('<button class="plain">Load</button>'), false);
  assert.equal(hasHTMLeXMarkup('<button data-target="plain">Load</button>'), false);

  const invalidRoot = {
    querySelector() {
      throw new Error('bad selector');
    },
    querySelectorAll() {
      throw new Error('bad selector');
    }
  };

  assert.equal(querySelectorSafe('[', invalidRoot), null);
  assert.deepEqual(querySelectorAllResult('[', invalidRoot), {
    matches: [],
    valid: false,
  });
});

test('updateTarget applies insertion and removal strategies and emits DOM update events', () => {
  const dispatchedEvents = [];
  const targetElement = {
    inserted: [],
    parentElement: { id: 'parent' },
    insertAdjacentHTML(position, content) {
      this.inserted.push({ position, content });
    },
    remove() {
      this.removed = true;
    }
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.document = {
    body: { id: 'body' },
    querySelectorAll(selector) {
      return selector === '#target' ? [targetElement] : [];
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
    }
  };

  updateTarget(
    { selector: '#target', strategy: 'append' },
    '<button GET="/unit">Run</button>'
  );
  updateTarget(
    { selector: '#target', strategy: 'remove' },
    ''
  );

  assert.deepEqual(targetElement.inserted, [{
    position: 'beforeend',
    content: '<button GET="/unit">Run</button>'
  }]);
  assert.equal(targetElement.removed, true);
  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].type, 'htmlex:dom-updated');
  assert.equal(dispatchedEvents[0].detail.root, targetElement);
});

test('updateTarget coerces nullish and numeric content before applying updates', () => {
  const targetElement = {
    inserted: [],
    insertAdjacentHTML(position, content) {
      this.inserted.push({ position, content });
    },
  };
  globalThis.document = {
    body: {},
    querySelectorAll(selector) {
      return selector === '#target' ? [targetElement] : [];
    },
    dispatchEvent() {}
  };

  updateTarget({ selector: '#target', strategy: 'append' }, null);
  updateTarget({ selector: '#target', strategy: 'prepend' }, 42);

  assert.deepEqual(targetElement.inserted, [
    { position: 'beforeend', content: '' },
    { position: 'afterbegin', content: '42' },
  ]);
});

test('DOM updates tolerate missing CustomEvent and Range APIs', () => {
  const dispatchedEvents = [];
  const targetElement = {
    innerHTML: 'old',
    outerHTML: '<section id="target">old</section>',
    inserted: [],
    insertAdjacentHTML(position, content) {
      this.inserted.push({ position, content });
    },
  };
  delete globalThis.CustomEvent;
  globalThis.document = {
    body: {},
    querySelectorAll(selector) {
      return selector === '#target' ? [targetElement] : [];
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
    }
  };

  assert.doesNotThrow(() => updateTarget(
    { selector: '#target', strategy: 'append' },
    '<button GET="/unit">Run</button>'
  ));
  performInnerHTMLUpdate(targetElement, '<p>new</p>');
  updateTarget(
    { selector: '#target', strategy: 'outerHTML' },
    '<section GET="/unit">New</section>'
  );

  assert.deepEqual(dispatchedEvents, []);
  assert.deepEqual(targetElement.inserted, [{
    position: 'beforeend',
    content: '<button GET="/unit">Run</button>'
  }]);
  assert.equal(targetElement.innerHTML, '<p>new</p>');
  assert.equal(targetElement.outerHTML, '<section GET="/unit">New</section>');
});

test('DOM helpers tolerate missing Node and document globals', () => {
  delete globalThis.Node;
  delete globalThis.document;

  assert.equal(querySelectorSafe('#missing'), null);
  assert.deepEqual(querySelectorAllResult('#missing'), {
    matches: [],
    valid: true,
  });
  assert.deepEqual(querySelectorAllSafe('#missing'), []);

  const element = {
    innerHTML: 'old',
  };
  assert.doesNotThrow(() => performInnerHTMLUpdate(element, '<p>new</p>'));
  assert.equal(element.innerHTML, '<p>new</p>');
});

test('URL state applies push, pull, path, and history modes', () => {
  const historyCalls = [];
  globalThis.window = {
    location: {
      href: 'https://example.test/old?keep=1&remove=1'
    }
  };
  globalThis.history = {
    pushState(_state, _title, url) {
      historyCalls.push({ method: 'push', url });
    },
    replaceState(_state, _title, url) {
      historyCalls.push({ method: 'replace', url });
    }
  };

  handleURLState(createAttributeElement({
    push: 'q=laptop token=a=b',
    pull: 'remove',
    path: '/search',
    history: 'push'
  }));

  assert.deepEqual(historyCalls, [{
    method: 'push',
    url: 'https://example.test/search?keep=1&q=laptop&token=a%3Db'
  }]);

  handleURLState(createAttributeElement({
    push: 'skipped=true',
    history: 'none'
  }));

  assert.equal(historyCalls.length, 1);
});

test('URL state trims history attributes and falls back for invalid history modes', () => {
  const historyCalls = [];
  globalThis.window = {
    location: {
      href: 'https://example.test/old?keep=1'
    },
    history: {
      pushState(_state, _title, url) {
        historyCalls.push({ method: 'push', url });
      },
      replaceState(_state, _title, url) {
        historyCalls.push({ method: 'replace', url });
      }
    }
  };

  handleURLState(createAttributeElement({
    push: 'q=search',
    path: ' /trimmed ',
    history: ' PUSH '
  }));
  handleURLState(createAttributeElement({
    pull: 'q',
    path: '   ',
    history: 'invalid'
  }));

  assert.deepEqual(historyCalls, [
    {
      method: 'push',
      url: 'https://example.test/trimmed?keep=1&q=search'
    },
    {
      method: 'replace',
      url: 'https://example.test/old?keep=1'
    }
  ]);
});

test('URL state does not throw when the history API is unavailable', () => {
  globalThis.window = {
    location: {
      href: 'https://example.test/current?keep=1'
    }
  };
  delete globalThis.history;

  assert.doesNotThrow(() => handleURLState(createAttributeElement({
    push: 'q=search'
  })));
});

test('URL state fails closed when location or history mutation throws', () => {
  delete globalThis.window;
  assert.doesNotThrow(() => handleURLState(createAttributeElement({
    push: 'q=search'
  })));

  globalThis.window = {
    location: {
      href: 'https://example.test/current'
    },
    history: {
      pushState() {
        throw new Error('history denied');
      },
      replaceState() {
        throw new Error('history denied');
      }
    }
  };

  assert.doesNotThrow(() => handleURLState(createAttributeElement({
    push: 'q=search',
    history: 'push'
  })));
  assert.doesNotThrow(() => handleURLState(createAttributeElement({
    pull: 'q',
    history: 'replace'
  })));
});

test('URL state fails closed for hostile browser and element APIs', () => {
  const originalURL = globalThis.URL;
  try {
    globalThis.window = {
      get location() {
        throw new Error('location denied');
      },
    };
    assert.doesNotThrow(() => handleURLState(createAttributeElement({ push: 'q=search' })));

    delete globalThis.URL;
    globalThis.window = {
      location: { href: 'https://example.test/current' },
      history: {
        replaceState() {
          throw new Error('should not be called without URL');
        },
      },
    };
    assert.doesNotThrow(() => handleURLState(createAttributeElement({ push: 'q=search' })));

    globalThis.URL = originalURL;
    const historyCalls = [];
    globalThis.window = {
      location: { href: 'https://example.test/current?keep=1' },
      history: {
        replaceState(_state, _title, url) {
          historyCalls.push(url);
        },
      },
    };
    const hostileElement = {
      hasAttribute(name) {
        if (name === 'push') throw new Error('push unavailable');
        return name === 'path';
      },
      getAttribute(name) {
        if (name === 'path') throw new Error('path unavailable');
        return null;
      },
    };

    assert.doesNotThrow(() => handleURLState(hostileElement));
    assert.deepEqual(historyCalls, ['https://example.test/current?keep=1']);
  } finally {
    globalThis.URL = originalURL;
  }
});

test('URL state ignores unstringifiable attribute values', () => {
  const historyCalls = [];
  const hostileValue = {
    toString() {
      throw new Error('string denied');
    },
  };
  globalThis.window = {
    location: { href: 'https://example.test/current?keep=1' },
    history: {
      replaceState(_state, _title, url) {
        historyCalls.push(url);
      },
    },
  };

  assert.doesNotThrow(() => handleURLState(createAttributeElement({
    push: hostileValue,
    pull: hostileValue,
    path: hostileValue,
    history: hostileValue,
  })));
  assert.deepEqual(historyCalls, ['https://example.test/current?keep=1']);
});

test('fetchWithTimeout passes through successful fetches and converts timeouts', async () => {
  const seen = [];
  globalThis.fetch = async (url, options = {}) => {
    seen.push({ url, options });
    return { ok: true, status: 204 };
  };

  assert.deepEqual(await fetchWithTimeout('/ready', { method: 'POST' }, 0), {
    ok: true,
    status: 204,
  });
  assert.equal(seen[0].url, '/ready');
  assert.equal(seen[0].options.method, 'POST');

  globalThis.fetch = async (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason));
  });

  await assert.rejects(
    () => fetchWithTimeout('/slow', {}, 5),
    /Request timed out/
  );
});

test('fetchWithTimeout treats non-finite direct timeout values as no timeout', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const timeoutCalls = [];
  globalThis.fetch = async () => ({ ok: true, status: 200 });
  globalThis.setTimeout = (callback, delayMs, ...args) => {
    timeoutCalls.push(delayMs);
    return originalSetTimeout(callback, 0, ...args);
  };

  try {
    assert.deepEqual(await fetchWithTimeout('/ready', {}, Number.POSITIVE_INFINITY), {
      ok: true,
      status: 200,
    });
    assert.deepEqual(timeoutCalls, []);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('fetchWithTimeout normalizes hostile options and unavailable fetch APIs', async () => {
  const response = { ok: true, status: 202 };
  const seenOptions = [];
  const hostileOptions = {};
  Object.defineProperty(hostileOptions, 'signal', {
    get() {
      throw new Error('signal denied');
    },
  });
  globalThis.fetch = async (_url, options = {}) => {
    seenOptions.push(options);
    return response;
  };

  assert.equal(await fetchWithTimeout('/hostile-options', hostileOptions, 0), response);
  assert.deepEqual(seenOptions, [hostileOptions]);
  assert.equal(await fetchWithTimeout('/null-options', null, 0), response);

  delete globalThis.fetch;
  await assert.rejects(
    () => fetchWithTimeout('/missing-fetch', {}, 0),
    /fetch is unavailable/
  );
});

test('fetchWithTimeout keeps abort support when option spreading fails', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const timers = [];
  const hostileOptions = {};
  Object.defineProperty(hostileOptions, 'method', {
    enumerable: true,
    get() {
      throw new Error('method denied');
    },
  });
  globalThis.setTimeout = (callback, delayMs) => {
    timers.push({ callback, delayMs });
    return timers.length;
  };
  globalThis.fetch = async (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason));
  });

  try {
    const request = fetchWithTimeout('/hostile-spread', hostileOptions, 25);
    assert.equal(timers[0].delayMs, 25);
    timers[0].callback();

    await assert.rejects(request, /Request timed out/);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('fetchWithTimeout forwards upstream abort signals and cleans listeners', async () => {
  const upstreamController = new AbortController();
  let removedListener = false;
  const originalRemoveEventListener = upstreamController.signal.removeEventListener.bind(upstreamController.signal);
  upstreamController.signal.removeEventListener = (...args) => {
    removedListener = true;
    return originalRemoveEventListener(...args);
  };
  globalThis.fetch = async (_url, options = {}) => {
    upstreamController.abort(new Error('caller aborted'));
    throw options.signal.reason;
  };

  await assert.rejects(
    () => fetchWithTimeout('/abort', { signal: upstreamController.signal }, 0),
    /caller aborted/
  );
  assert.equal(removedListener, true);
});

test('fetchWithTimeout falls back when AbortController is unavailable', async () => {
  delete globalThis.AbortController;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (callback, delayMs) => {
    timers.push({ callback, delayMs, cleared: false });
    return timers.length - 1;
  };
  globalThis.clearTimeout = (timerId) => {
    timers[timerId].cleared = true;
  };
  globalThis.fetch = async () => new Promise(() => {});

  try {
    const timeoutPromise = fetchWithTimeout('/fallback-timeout', {}, 25);
    assert.equal(timers[0].delayMs, 25);
    timers[0].callback();

    await assert.rejects(timeoutPromise, /Request timed out/);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('fetchWithTimeout fallback rejects pre-aborted signals without AbortController', async () => {
  delete globalThis.AbortController;
  let fetchCalled = false;
  const abortReason = new Error('caller already aborted');
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true };
  };

  await assert.rejects(
    () => fetchWithTimeout('/fallback-pre-aborted', {
      signal: {
        aborted: true,
        reason: abortReason,
      },
    }, 0),
    (error) => {
      assert.equal(error.name, 'AbortError');
      assert.equal(error.cause, abortReason);
      return true;
    }
  );
  assert.equal(fetchCalled, false);
});

test('fetchWithTimeout fallback handles upstream abort signals without AbortController', async () => {
  delete globalThis.AbortController;
  const listeners = [];
  const abortReason = new Error('caller aborted');
  const signal = {
    aborted: false,
    reason: abortReason,
    addEventListener(eventName, listener, options) {
      this.eventName = eventName;
      this.options = options;
      listeners.push(listener);
    },
    removeEventListener(eventName, listener) {
      this.removed = { eventName, listener };
    },
  };
  globalThis.fetch = async () => new Promise(() => {});

  const request = fetchWithTimeout('/fallback-aborted', { signal }, 0);
  assert.equal(signal.eventName, 'abort');
  assert.deepEqual(signal.options, { once: true });

  listeners[0]();

  await assert.rejects(
    request,
    (error) => {
      assert.equal(error.name, 'AbortError');
      assert.equal(error.cause, abortReason);
      return true;
    }
  );
  assert.deepEqual(signal.removed, {
    eventName: 'abort',
    listener: listeners[0],
  });
});

test('fetchWithTimeout fallback ignores abort listener attach failures', async () => {
  delete globalThis.AbortController;
  const response = { ok: true, status: 200 };
  const signal = {
    aborted: false,
    addEventListener() {
      throw new Error('listener denied');
    },
  };
  globalThis.fetch = async () => response;

  assert.equal(await fetchWithTimeout('/fallback-listener-denied', { signal }, 0), response);
});

test('fetchWithTimeout fallback ignores abort listener cleanup failures', async () => {
  delete globalThis.AbortController;
  const response = { ok: true, status: 200 };
  const signal = {
    aborted: false,
    addEventListener() {},
    removeEventListener() {
      throw new Error('remove denied');
    },
  };
  globalThis.fetch = async () => response;

  assert.equal(await fetchWithTimeout('/fallback-remove-denied', { signal }, 0), response);
});

test('fetchWithTimeout continues when timeout timers are unavailable', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const response = { ok: true, status: 200 };
  globalThis.setTimeout = undefined;
  globalThis.clearTimeout = undefined;
  globalThis.fetch = async () => response;

  try {
    assert.equal(await fetchWithTimeout('/no-timeout-api', {}, 25), response);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('cache entries expire after their TTL', async () => {
  const key = `cache-expiry-${Date.now()}`;

  setCache(key, 'short-lived', 1);
  await delay(5);

  assert.equal(getCache(key), null);
});

test('cache falls back when Date.now is unavailable', () => {
  const originalDateNow = Date.now;
  Date.now = () => {
    throw new Error('time denied');
  };

  try {
    assert.doesNotThrow(() => setCache('cache-hostile-time', 'cached', 10));
    assert.equal(getCache('cache-hostile-time'), 'cached');
  } finally {
    Date.now = originalDateNow;
  }
});

test('scheduleUpdate runs immediate and queued updates through requestAnimationFrame', () => {
  const frameCallbacks = [];
  globalThis.requestAnimationFrame = (callback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  };

  const calls = [];
  scheduleUpdate(() => calls.push('immediate'), false);
  frameCallbacks.shift()();
  assert.deepEqual(calls, ['immediate']);

  scheduleUpdate(() => calls.push('first'), true);
  scheduleUpdate(() => calls.push('second'), true);

  while (frameCallbacks.length) {
    frameCallbacks.shift()();
  }

  assert.deepEqual(calls, ['immediate', 'first', 'second']);
});

test('scheduleUpdate queues sequential work without relying on Array push', async () => {
  const originalPush = Array.prototype.push;
  const freshUtils = await import(`../../src/public/src/utils.js?schedule-push=${Date.now()}`);
  const frameCallbacks = [];
  globalThis.requestAnimationFrame = (callback) => {
    frameCallbacks[frameCallbacks.length] = callback;
    return frameCallbacks.length;
  };
  const calls = [];

  Array.prototype.push = function pushDenied() {
    throw new Error('push denied');
  };

  try {
    freshUtils.scheduleUpdate(() => {
      calls[calls.length] = 'first';
    }, true);
    freshUtils.scheduleUpdate(() => {
      calls[calls.length] = 'second';
    }, true);

    for (let index = 0; index < frameCallbacks.length; index += 1) {
      frameCallbacks[index]();
    }
  } finally {
    Array.prototype.push = originalPush;
  }

  assert.deepEqual(calls, ['first', 'second']);
});

test('scheduleUpdate falls back when requestAnimationFrame is unavailable', async () => {
  delete globalThis.requestAnimationFrame;
  const calls = [];

  scheduleUpdate(() => calls.push('immediate'), false);
  scheduleUpdate(() => calls.push('first'), true);
  scheduleUpdate(() => calls.push('second'), true);
  await delay(20);

  assert.deepEqual(calls, ['immediate', 'first', 'second']);
});

test('scheduleUpdate falls back when frame and timer scheduling fail', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const freshUtils = await import(`../../src/public/src/utils.js?scheduler-fallback=${Date.now()}`);
  const calls = [];
  globalThis.requestAnimationFrame = () => {
    throw new Error('frame denied');
  };
  globalThis.setTimeout = () => {
    throw new Error('timer denied');
  };

  try {
    assert.doesNotThrow(() => {
      freshUtils.scheduleUpdate(() => calls.push('immediate'), false);
      freshUtils.scheduleUpdate(() => calls.push('first'), true);
      freshUtils.scheduleUpdate(() => calls.push('second'), true);
    });
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }

  assert.deepEqual(calls, ['immediate', 'first', 'second']);
});

test('scheduleUpdate isolates immediate update failures', () => {
  const frameCallbacks = [];
  globalThis.requestAnimationFrame = (callback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  };
  const calls = [];

  scheduleUpdate(() => {
    throw new Error('update failed');
  }, false);
  scheduleUpdate(() => calls.push('after-failure'), false);

  assert.doesNotThrow(() => {
    while (frameCallbacks.length) {
      frameCallbacks.shift()();
    }
  });
  assert.deepEqual(calls, ['after-failure']);
});

test('isSequential treats missing and false attributes as disabled', () => {
  assert.equal(isSequential(null), false);
  assert.equal(isSequential({}), false);
  assert.equal(isSequential(createAttributeElement({})), false);
  assert.equal(isSequential(createAttributeElement({ sequential: 'false' })), false);
  assert.equal(isSequential(createAttributeElement({ sequential: '25' })), true);
});

test('isSequential treats hostile attribute APIs as disabled', () => {
  assert.equal(isSequential({
    hasAttribute() {
      throw new Error('attribute check denied');
    },
    getAttribute() {
      return 'true';
    }
  }), false);

  assert.equal(isSequential({
    hasAttribute() {
      return true;
    },
    getAttribute() {
      throw new Error('attribute read denied');
    }
  }), false);
});

test('browser logger records diagnostics entries and dispatches log events', () => {
  const dispatchedEvents = [];
  globalThis.window = {
    dispatchEvent(event) {
      dispatchedEvents.push(event);
    }
  };
  console.warn = () => {};
  Logger.enabled = true;
  Logger.logLevel = LogLevel.WARN;
  Logger.diagnostics.clear();

  const circularPayload = {
    name: 'root',
    count: 2n,
  };
  circularPayload.self = circularPayload;

  Logger.system.warn('Unit diagnostic warning', circularPayload);

  assert.equal(Logger.diagnostics.entries.length, 1);
  const entries = Logger.diagnostics.entries;
  entries.length = 0;
  assert.equal(Logger.diagnostics.entries.length, 1);
  assert.equal(Logger.diagnostics.last('warn').message, 'Unit diagnostic warning');
  assert.deepEqual(Logger.diagnostics.last('warn').args[0], {
    name: 'root',
    count: '2n',
    self: '[Circular]',
  });
  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].type, Logger.diagnostics.eventName);
});

test('browser logger formats BigInt diagnostics without relying on prototype toString', () => {
  globalThis.window = {
    dispatchEvent() {}
  };
  console.warn = () => {};
  Logger.enabled = true;
  Logger.logLevel = LogLevel.WARN;
  Logger.diagnostics.clear();
  const originalToString = BigInt.prototype.toString;
  BigInt.prototype.toString = () => {
    throw new Error('bigint string unavailable');
  };

  try {
    Logger.system.warn('BigInt diagnostic', 2n);
    assert.equal(Logger.diagnostics.last('warn').args[0], '2n');
  } finally {
    BigInt.prototype.toString = originalToString;
  }
});

test('browser logger trims stored log-level configuration at startup', async () => {
  globalThis.window = {
    localStorage: {
      getItem(name) {
        return name === 'HTMLEX_LOG_LEVEL' ? ' DEBUG ' : null;
      }
    },
    location: { search: '' },
    dispatchEvent() {}
  };

  const loggerModuleUrl = new URL(`../../src/public/src/logger.js?level-init=${Date.now()}`, import.meta.url);
  const { Logger: FreshLogger, LogLevel: FreshLogLevel } = await import(loggerModuleUrl.href);

  assert.equal(FreshLogger.logLevel, FreshLogLevel.DEBUG);
});

test('browser logger startup uses debug query when storage and URLSearchParams fail', async () => {
  const originalURLSearchParams = globalThis.URLSearchParams;
  globalThis.URLSearchParams = class ThrowingURLSearchParams {
    constructor() {
      throw new Error('search params denied');
    }
  };
  globalThis.window = {
    get localStorage() {
      throw new Error('storage denied');
    },
    location: { search: '?mode=test&htmlexDebug=1' },
    dispatchEvent() {}
  };

  try {
    const loggerModuleUrl = new URL(`../../src/public/src/logger.js?query-debug=${Date.now()}`, import.meta.url);
    const { Logger: FreshLogger, LogLevel: FreshLogLevel } = await import(loggerModuleUrl.href);
    assert.equal(FreshLogger.logLevel, FreshLogLevel.DEBUG);
  } finally {
    if (originalURLSearchParams === undefined) {
      delete globalThis.URLSearchParams;
    } else {
      globalThis.URLSearchParams = originalURLSearchParams;
    }
  }
});

test('browser logger repairs diagnostics storage and snapshots entries defensively', () => {
  const dispatchedEvents = [];
  globalThis.window = {
    __HTMLEX_DIAGNOSTICS__: 'corrupt',
    dispatchEvent(event) {
      dispatchedEvents.push(event);
    }
  };
  console.warn = () => {};
  Logger.enabled = true;
  Logger.logLevel = LogLevel.WARN;

  const shared = { marker: 'shared' };
  Logger.system.warn('Repeated payload', { first: shared, second: shared });

  const snapshotEntry = Logger.diagnostics.entries[0];
  snapshotEntry.args[0].first.marker = 'changed';

  assert.equal(dispatchedEvents.length, 1);
  assert.deepEqual(Logger.diagnostics.last('warn').args[0], {
    first: { marker: 'shared' },
    second: { marker: 'shared' },
  });
});

test('browser logger snapshots externally corrupted diagnostics safely', () => {
  const circularEntry = {
    level: 'warn',
    message: 'corrupt entry',
  };
  circularEntry.self = circularEntry;
  Object.defineProperty(circularEntry, 'bad', {
    enumerable: true,
    get() {
      throw new Error('getter failed');
    },
  });
  globalThis.window = {
    __HTMLEX_DIAGNOSTICS__: {
      entries: [circularEntry],
      clear() {
        this.entries.length = 0;
      },
    },
  };

  assert.deepEqual(Logger.diagnostics.entries[0], {
    level: 'warn',
    message: 'corrupt entry',
    self: '[Circular]',
    bad: '[Unserializable: getter failed]',
  });
  assert.deepEqual(Logger.diagnostics.last('warn'), {
    level: 'warn',
    message: 'corrupt entry',
    self: '[Circular]',
    bad: '[Unserializable: getter failed]',
  });
});

test('browser logger diagnostics do not rely on mutable array methods', () => {
  const dispatchedEvents = [];
  const entries = [];
  entries.push = () => {
    throw new Error('push denied');
  };
  entries.splice = () => {
    throw new Error('splice denied');
  };
  entries.map = () => {
    throw new Error('map denied');
  };
  globalThis.window = {
    __HTMLEX_DIAGNOSTICS__: {
      entries,
      clear() {
        throw new Error('clear denied');
      },
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
    },
  };
  console.warn = () => {};
  Logger.enabled = true;
  Logger.logLevel = LogLevel.WARN;

  assert.doesNotThrow(() => Logger.system.warn('method-hostile diagnostics', { ok: true }));
  assert.equal(Logger.diagnostics.entries.length, 1);
  assert.equal(Logger.diagnostics.last('warn').message, 'method-hostile diagnostics');
  assert.deepEqual(Logger.diagnostics.last('warn').args[0], { ok: true });
  assert.equal(dispatchedEvents.length, 1);
  assert.doesNotThrow(() => Logger.diagnostics.clear());
});

test('browser logger diagnostics tolerate hostile global store accessors', () => {
  const hostileWindow = {
    dispatchEvent() {}
  };
  Object.defineProperty(hostileWindow, Logger.diagnostics.globalName, {
    configurable: true,
    get() {
      throw new Error('diagnostics getter denied');
    },
    set(value) {
      Object.defineProperty(hostileWindow, Logger.diagnostics.globalName, {
        configurable: true,
        writable: true,
        value,
      });
    },
  });
  globalThis.window = hostileWindow;
  console.warn = () => {};
  Logger.enabled = true;
  Logger.logLevel = LogLevel.WARN;

  assert.doesNotThrow(() => Logger.system.warn('hostile diagnostics accessor'));
  assert.equal(Logger.diagnostics.last('warn').message, 'hostile diagnostics accessor');
});

test('browser logger skips diagnostics when the global store cannot be written', () => {
  const hostileWindow = {
    dispatchEvent() {}
  };
  Object.defineProperty(hostileWindow, Logger.diagnostics.globalName, {
    configurable: true,
    get() {
      return undefined;
    },
    set() {
      throw new Error('diagnostics setter denied');
    },
  });
  globalThis.window = hostileWindow;
  console.warn = () => {};
  Logger.enabled = true;
  Logger.logLevel = LogLevel.WARN;

  assert.doesNotThrow(() => Logger.system.warn('unwritable diagnostics store'));
  assert.deepEqual(Logger.diagnostics.entries, []);
});

test('browser logger repairs hostile diagnostics entries and clear accessors', () => {
  const hostileStore = {};
  Object.defineProperty(hostileStore, 'entries', {
    configurable: true,
    get() {
      throw new Error('entries denied');
    },
  });
  Object.defineProperty(hostileStore, 'clear', {
    configurable: true,
    get() {
      throw new Error('clear denied');
    },
  });
  globalThis.window = {
    __HTMLEX_DIAGNOSTICS__: hostileStore,
    dispatchEvent() {}
  };
  console.warn = () => {};
  Logger.enabled = true;
  Logger.logLevel = LogLevel.WARN;

  assert.doesNotThrow(() => Logger.system.warn('repaired diagnostics store'));
  assert.equal(Logger.diagnostics.last('warn').message, 'repaired diagnostics store');
  assert.doesNotThrow(() => Logger.diagnostics.clear());
  assert.equal(Logger.diagnostics.entries.length, 0);
});

test('browser logger serializes arguments when Array prototype map is unavailable', () => {
  const originalMap = Array.prototype.map;
  globalThis.window = {
    dispatchEvent() {}
  };
  console.warn = () => {};
  Logger.enabled = true;
  Logger.logLevel = LogLevel.WARN;
  Logger.diagnostics.clear();
  Array.prototype.map = () => {
    throw new Error('prototype map denied');
  };

  try {
    assert.doesNotThrow(() => Logger.system.warn('prototype-map diagnostics', { ok: true }));
  } finally {
    Array.prototype.map = originalMap;
  }

  assert.deepEqual(Logger.diagnostics.last('warn').args[0], { ok: true });
});

test('browser logger does not rely on Array includes or slice prototypes', () => {
  const originalIncludes = Array.prototype.includes;
  const originalSlice = Array.prototype.slice;
  globalThis.window = {
    dispatchEvent() {}
  };
  console.warn = () => {};
  Logger.enabled = true;
  Logger.logLevel = LogLevel.WARN;
  Logger.diagnostics.clear();
  Array.prototype.includes = () => {
    throw new Error('prototype includes denied');
  };
  Array.prototype.slice = () => {
    throw new Error('prototype slice denied');
  };
  let thrown;

  try {
    Logger.system.warn('prototype-array diagnostics', { ok: true });
  } catch (error) {
    thrown = error;
  } finally {
    Array.prototype.includes = originalIncludes;
    Array.prototype.slice = originalSlice;
  }

  assert.equal(thrown, undefined);
  assert.deepEqual(Logger.diagnostics.last('warn').args[0], { ok: true });
});

test('browser logger trims diagnostics without relying on splice', () => {
  const entries = [];
  entries.splice = () => {
    throw new Error('splice denied');
  };
  globalThis.window = {
    __HTMLEX_DIAGNOSTICS__: {
      entries,
      clear() {
        this.entries.length = 0;
      },
    },
    dispatchEvent() {},
  };
  console.warn = () => {};
  Logger.enabled = true;
  Logger.logLevel = LogLevel.WARN;

  for (let index = 0; index < 252; index += 1) {
    Logger.system.warn(`trim diagnostics ${index}`);
  }

  assert.equal(Logger.diagnostics.entries.length, 250);
  assert.equal(Logger.diagnostics.entries[0].message, 'trim diagnostics 2');
  assert.equal(Logger.diagnostics.last('warn').message, 'trim diagnostics 251');
});

test('browser logger serializes hostile live payloads safely', () => {
  globalThis.window = {
    dispatchEvent() {}
  };
  globalThis.Element = {};
  globalThis.HTMLElement = {};
  globalThis.Node = { ELEMENT_NODE: 1 };
  console.warn = () => {};
  Logger.enabled = true;
  Logger.logLevel = LogLevel.WARN;
  Logger.diagnostics.clear();

  const hostileKeys = new Proxy({}, {
    ownKeys() {
      throw new Error('own keys failed');
    },
  });
  const hostileConstructor = {
    child: {
      child: {
        child: {
          child: {},
        },
      },
    },
  };
  Object.defineProperty(hostileConstructor.child.child.child.child, 'constructor', {
    get() {
      throw new Error('constructor failed');
    },
  });
  const hostileFunction = function hostileFunction() {};
  hostileFunction[Symbol.toPrimitive] = () => {
    throw new Error('function string failed');
  };
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
  const hostileElement = {
    nodeType: 1,
    hasAttribute() {
      return false;
    },
  };
  Object.defineProperties(hostileElement, {
    tagName: {
      get() {
        throw new Error('tag denied');
      },
    },
    id: {
      get() {
        throw new Error('id denied');
      },
    },
    className: {
      get() {
        throw new Error('class denied');
      },
    },
  });
  const hostileMessage = {
    toString() {
      throw new Error('message denied');
    },
  };

  assert.doesNotThrow(() => {
    Logger.system.warn(hostileMessage, hostileKeys, hostileConstructor, hostileFunction, hostileArray, hostileElement);
  });
  const entry = Logger.diagnostics.last('warn');
  assert.equal(entry.message, '[Unstringifiable]');
  assert.equal(entry.args[0], '[Unserializable: own keys failed]');
  assert.equal(entry.args[1].child.child.child.child, '[MaxDepth:Object]');
  assert.equal(entry.args[2], '[Unstringifiable]');
  assert.deepEqual(entry.args[3], ['first', '[Unserializable: array item failed]']);
  assert.deepEqual(entry.args[4], {
    element: 'element',
    id: undefined,
    classes: undefined,
  });
});

test('browser logger tolerates non-constructor DOM globals and throwing console writers', () => {
  globalThis.window = {
    dispatchEvent() {}
  };
  globalThis.Element = {};
  globalThis.HTMLElement = {};
  globalThis.Event = {};
  const originalWarnWriter = console.warn;
  console.warn = () => {
    throw new Error('console unavailable');
  };
  Logger.enabled = true;
  Logger.logLevel = LogLevel.WARN;
  Logger.diagnostics.clear();

  try {
    const fakeElement = {
      nodeType: 1,
      tagName: 'BUTTON',
      id: 'run',
      className: 'primary',
      hasAttribute(name) {
        return name === 'debug';
      },
    };
    const fakeEvent = {
      type: 'click',
      target: fakeElement,
      preventDefault() {},
    };

    assert.doesNotThrow(() => Logger.system.warn('non-constructor globals', fakeElement, fakeEvent));
    assert.doesNotThrow(() => Logger.element.warn(fakeElement, 'element warn', fakeEvent));

    const warnEntry = Logger.diagnostics.last('warn');
    assert.equal(warnEntry.args[0].element, 'button');
    assert.equal(warnEntry.args[1].event, 'click');
  } finally {
    console.warn = originalWarnWriter;
  }
});

test('browser logger element logging tolerates hostile debug attribute checks', () => {
  globalThis.window = {
    dispatchEvent() {}
  };
  globalThis.Node = { ELEMENT_NODE: 1 };
  console.warn = () => {};
  Logger.enabled = true;
  Logger.logLevel = LogLevel.WARN;
  Logger.diagnostics.clear();
  const element = {
    nodeType: 1,
    tagName: 'DIV',
    hasAttribute() {
      throw new Error('debug attribute denied');
    },
  };

  assert.doesNotThrow(() => Logger.element.warn(element, 'hostile debug attribute'));
  assert.equal(Logger.diagnostics.last('warn'), null);
});

test('browser logger does not throw for invalid dates or failed event dispatch', () => {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    dispatchEvent() {
      throw new Error('dispatch failed');
    }
  };
  console.warn = () => {};
  Logger.enabled = true;
  Logger.logLevel = LogLevel.WARN;
  Logger.diagnostics.clear();

  assert.doesNotThrow(() => {
    Logger.system.warn('Invalid date payload', new Date('not-a-date'));
  });
  assert.equal(Logger.diagnostics.last(' WARN ').args[0], '[Invalid Date]');
});

test('browser logger keeps diagnostics working when clock and random APIs fail', () => {
  const originalDateNow = Date.now;
  const originalMathRandom = Math.random;
  globalThis.window = {
    dispatchEvent() {}
  };
  console.warn = () => {};
  Logger.enabled = true;
  Logger.logLevel = LogLevel.WARN;
  Logger.diagnostics.clear();
  Date.now = () => {
    throw new Error('time denied');
  };
  Math.random = () => {
    throw new Error('random denied');
  };

  try {
    assert.doesNotThrow(() => Logger.system.warn('hostile runtime ids'));
    const entry = Logger.diagnostics.last('warn');
    assert.match(entry.id, /^0-fallback-\d+$/u);
    assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T/u);
  } finally {
    Date.now = originalDateNow;
    Math.random = originalMathRandom;
  }
});

test('browser logger serializes element diagnostics, truncates large payloads, and gates element logs', () => {
  class FakeHTMLElement {
    constructor() {
      this.tagName = 'BUTTON';
      this.id = 'save';
      this.className = 'btn primary';
      this.attributes = { debug: '' };
    }

    hasAttribute(name) {
      return Object.hasOwn(this.attributes, name);
    }
  }
  globalThis.Element = FakeHTMLElement;
  globalThis.HTMLElement = FakeHTMLElement;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  const dispatchedEvents = [];
  globalThis.window = {
    dispatchEvent(event) {
      dispatchedEvents.push(event);
    }
  };
  const consoleCalls = {
    debug: [],
    info: [],
    warn: [],
    error: [],
  };
  console.debug = (...args) => consoleCalls.debug.push(args);
  console.info = (...args) => consoleCalls.info.push(args);
  console.warn = (...args) => consoleCalls.warn.push(args);
  console.error = (...args) => consoleCalls.error.push(args);
  Logger.enabled = true;
  Logger.logLevel = LogLevel.DEBUG;
  Logger.diagnostics.clear();

  const element = new FakeHTMLElement();
  const largePayload = {
    items: Array.from({ length: 55 }, (_, index) => index),
    nested: { a: { b: { c: { d: { e: 'too deep' } } } } },
  };

  Logger.system.debug('debug message', element, largePayload);
  Logger.system.info('info message');
  Logger.element.warn(element, 'element warning', new Date('2026-04-29T00:00:00.000Z'));
  Logger.element.error(element, 'element error');

  assert.equal(consoleCalls.debug.length, 1);
  assert.equal(consoleCalls.info.length, 1);
  assert.equal(consoleCalls.warn.length, 1);
  assert.equal(consoleCalls.error.length, 1);
  assert.equal(dispatchedEvents.length, 4);
  assert.deepEqual(Logger.diagnostics.entries[0].args[0], {
    element: 'button',
    id: 'save',
    classes: 'btn primary',
  });
  assert.equal(Logger.diagnostics.entries[0].args[1].items.length, 51);
  assert.equal(Logger.diagnostics.entries[0].args[1].items.at(-1), '[5 more item(s)]');
  assert.equal(Logger.diagnostics.entries[0].args[1].nested.a.b.c, '[MaxDepth:Object]');
  assert.equal(Logger.diagnostics.last(LogLevel.WARN).args[1], '2026-04-29T00:00:00.000Z');
});

test('runtime error boundary retries after unavailable listeners and tolerates hostile events', async () => {
  const loggerModuleUrl = new URL(`../../src/public/src/logger.js?boundary=${Date.now()}`, import.meta.url);
  const {
    installRuntimeErrorBoundary: installFreshBoundary,
    Logger: FreshLogger,
    LogLevel: FreshLogLevel,
  } = await import(loggerModuleUrl.href);
  FreshLogger.enabled = true;
  FreshLogger.logLevel = FreshLogLevel.ERROR;
  console.error = () => {};
  globalThis.window = {
    get addEventListener() {
      throw new Error('listener inspection denied');
    },
  };

  assert.doesNotThrow(() => installFreshBoundary());

  const listeners = new Map();
  globalThis.window = {
    addEventListener(eventName, callback) {
      listeners.set(eventName, callback);
    },
    dispatchEvent() {},
  };
  assert.doesNotThrow(() => installFreshBoundary());
  assert.equal(listeners.size, 2);

  assert.doesNotThrow(() => listeners.get('error')({
    get message() {
      throw new Error('message denied');
    },
    get filename() {
      throw new Error('filename denied');
    },
  }));
  assert.doesNotThrow(() => listeners.get('unhandledrejection')({
    get reason() {
      throw new Error('reason denied');
    },
  }));
});

test('runtime error boundary records uncaught browser errors and rejected promises', () => {
  const listeners = new Map();
  const dispatchedEvents = [];
  globalThis.window = {
    addEventListener(eventName, callback) {
      listeners.set(eventName, callback);
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
    }
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  console.error = () => {};
  Logger.enabled = true;
  Logger.logLevel = LogLevel.ERROR;
  Logger.diagnostics.clear();

  installRuntimeErrorBoundary();

  listeners.get('error')({
    message: 'runtime failed',
    filename: 'app.js',
    lineno: 12,
    colno: 3,
    error: new Error('runtime failed'),
  });
  listeners.get('unhandledrejection')({
    reason: 'promise failed',
  });

  assert.equal(dispatchedEvents.length, 2);
  assert.equal(Logger.diagnostics.entries.length, 2);
  assert.equal(Logger.diagnostics.entries[0].message, '[Runtime] Unhandled browser error:');
  assert.equal(Logger.diagnostics.last(LogLevel.ERROR).args[0], 'promise failed');
});

test('handleWebSocket connects, stores the socket, and disconnects removed elements', () => {
  class FakeElement {
    constructor() {
      this.connected = true;
    }

    hasAttribute() {
      return false;
    }
  }

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      FakeMutationObserver.instances.push(this);
    }

    observe(target, options) {
      this.target = target;
      this.options = options;
    }

    disconnect() {
      this.disconnected = true;
    }
  }
  FakeMutationObserver.instances = [];

  const socket = {
    disconnected: false,
    handlers: new Map(),
    on(eventName, callback) {
      this.handlers.set(eventName, callback);
    },
    onAny(callback) {
      this.anyHandler = callback;
    },
    disconnect() {
      this.disconnected = true;
    }
  };
  const ioCalls = [];
  globalThis.Element = FakeElement;
  globalThis.MutationObserver = FakeMutationObserver;
  globalThis.document = {
    body: {
      contains(element) {
        return element.connected;
      }
    }
  };
  globalThis.io = (socketUrl, options) => {
    ioCalls.push({ socketUrl, options });
    return socket;
  };

  const element = new FakeElement();
  handleWebSocket(element, 'https://example.test/updates');

  assert.equal(element._htmlexSocket, socket);
  assert.deepEqual(ioCalls, [{
    socketUrl: 'https://example.test/updates',
    options: { transports: ['websocket'] }
  }]);

  element.connected = false;
  socket.anyHandler('update', '<div>ignored</div>');

  assert.equal(socket.disconnected, true);
  assert.equal(element._htmlexSocket, socket);

  FakeMutationObserver.instances[0].callback();
  assert.equal(element._htmlexSocket, undefined);
  assert.equal(FakeMutationObserver.instances[0].disconnected, true);
});
