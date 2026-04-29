import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import test, { afterEach, beforeEach } from 'node:test';
import { getCache, setCache } from '../../src/public/src/cache.js';
import {
  hasHTMLeXMarkup,
  parseTargets,
  querySelectorAllResult,
  querySelectorSafe,
  updateTarget,
} from '../../src/public/src/dom.js';
import { fetchWithTimeout } from '../../src/public/src/fetchHelper.js';
import { Logger, LogLevel } from '../../src/public/src/logger.js';
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
let originalCustomEvent;
let originalIo;
let originalMutationObserver;
let originalRequestAnimationFrame;
let originalWarn;
let originalWindow;
let originalLoggerEnabled;
let originalLoggerLevel;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalHistory = globalThis.history;
  originalDocument = globalThis.document;
  originalElement = globalThis.Element;
  originalCustomEvent = globalThis.CustomEvent;
  originalIo = globalThis.io;
  originalMutationObserver = globalThis.MutationObserver;
  originalRequestAnimationFrame = globalThis.requestAnimationFrame;
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
  assert.equal(hasHTMLeXMarkup('<button class="plain">Load</button>'), false);

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

test('cache entries expire after their TTL', async () => {
  const key = `cache-expiry-${Date.now()}`;

  setCache(key, 'short-lived', 1);
  await delay(5);

  assert.equal(getCache(key), null);
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

test('isSequential treats missing and false attributes as disabled', () => {
  assert.equal(isSequential(createAttributeElement({})), false);
  assert.equal(isSequential(createAttributeElement({ sequential: 'false' })), false);
  assert.equal(isSequential(createAttributeElement({ sequential: '25' })), true);
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
  assert.equal(Logger.diagnostics.last('warn').message, 'Unit diagnostic warning');
  assert.deepEqual(Logger.diagnostics.last('warn').args[0], {
    name: 'root',
    count: '2n',
    self: '[Circular]',
  });
  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].type, Logger.diagnostics.eventName);
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
