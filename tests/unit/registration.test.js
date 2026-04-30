import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  flushSequentialUpdates,
  initHTMLeX,
  patchedUpdateTarget,
  registerElement,
} from '../../src/public/src/registration.js';
import { Logger } from '../../src/public/src/logger.js';
import { emitSignal, registerSignalListener } from '../../src/public/src/signals.js';

let originalClearTimeout;
let originalCustomEvent;
let originalDocument;
let originalElement;
let originalFetch;
let originalHistory;
let originalHTMLInputElement;
let originalHTMLSelectElement;
let originalIntersectionObserver;
let originalSetInterval;
let originalClearInterval;
let originalLoggerEnabled;
let originalMutationObserver;
let originalNode;
let originalRequestAnimationFrame;
let originalSetTimeout;
let originalWindow;

beforeEach(() => {
  originalClearTimeout = globalThis.clearTimeout;
  originalCustomEvent = globalThis.CustomEvent;
  originalDocument = globalThis.document;
  originalElement = globalThis.Element;
  originalFetch = globalThis.fetch;
  originalHistory = globalThis.history;
  originalHTMLInputElement = globalThis.HTMLInputElement;
  originalHTMLSelectElement = globalThis.HTMLSelectElement;
  originalIntersectionObserver = globalThis.IntersectionObserver;
  originalSetInterval = globalThis.setInterval;
  originalClearInterval = globalThis.clearInterval;
  originalLoggerEnabled = Logger.enabled;
  originalMutationObserver = globalThis.MutationObserver;
  originalNode = globalThis.Node;
  originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  originalSetTimeout = globalThis.setTimeout;
  originalWindow = globalThis.window;
  Logger.enabled = false;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.Element = FakeElement;
  globalThis.HTMLInputElement = class HTMLInputElement {};
  globalThis.HTMLSelectElement = class HTMLSelectElement {};
  globalThis.Node = { ELEMENT_NODE: 1 };
  globalThis.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  globalThis.document = {
    dispatchedEvents: [],
    body: {
      contains(element) {
        return element.connected !== false;
      },
    },
    querySelector() {
      return null;
    },
    dispatchEvent(event) {
      this.dispatchedEvents.push(event);
    },
  };
  globalThis.window = {
    location: {
      href: 'https://example.test/',
    },
  };
  globalThis.history = {
    pushState() {},
    replaceState() {},
  };
});

afterEach(() => {
  if (originalClearTimeout === undefined) {
    delete globalThis.clearTimeout;
  } else {
    globalThis.clearTimeout = originalClearTimeout;
  }

  if (originalCustomEvent === undefined) {
    delete globalThis.CustomEvent;
  } else {
    globalThis.CustomEvent = originalCustomEvent;
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

  if (originalHTMLInputElement === undefined) {
    delete globalThis.HTMLInputElement;
  } else {
    globalThis.HTMLInputElement = originalHTMLInputElement;
  }

  if (originalHTMLSelectElement === undefined) {
    delete globalThis.HTMLSelectElement;
  } else {
    globalThis.HTMLSelectElement = originalHTMLSelectElement;
  }

  if (originalIntersectionObserver === undefined) {
    delete globalThis.IntersectionObserver;
  } else {
    globalThis.IntersectionObserver = originalIntersectionObserver;
  }

  if (originalSetInterval === undefined) {
    delete globalThis.setInterval;
  } else {
    globalThis.setInterval = originalSetInterval;
  }

  if (originalClearInterval === undefined) {
    delete globalThis.clearInterval;
  } else {
    globalThis.clearInterval = originalClearInterval;
  }

  if (originalMutationObserver === undefined) {
    delete globalThis.MutationObserver;
  } else {
    globalThis.MutationObserver = originalMutationObserver;
  }

  if (originalNode === undefined) {
    delete globalThis.Node;
  } else {
    globalThis.Node = originalNode;
  }

  if (originalRequestAnimationFrame === undefined) {
    delete globalThis.requestAnimationFrame;
  } else {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }

  if (originalSetTimeout === undefined) {
    delete globalThis.setTimeout;
  } else {
    globalThis.setTimeout = originalSetTimeout;
  }

  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }

  Logger.enabled = originalLoggerEnabled;
});

class FakeElement {
  constructor(tagName = 'button', attributes = {}, descendants = []) {
    this.nodeType = Node.ELEMENT_NODE;
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.descendants = descendants;
    this.innerHTML = '';
    this.inserted = [];
    this.listeners = new Map();
    this.connected = true;
    this.removed = false;
    this.outerHTML = `<${tagName}></${tagName}>`;
  }

  hasAttribute(name) {
    return Object.hasOwn(this.attributes, name);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  addEventListener(eventName, callback) {
    this.listeners.set(eventName, callback);
  }

  removeEventListener(eventName, callback) {
    if (this.listeners.get(eventName) === callback) {
      this.listeners.delete(eventName);
    }
  }

  closest(selector) {
    const actionSelectors = selector.split(',').map(part => part.trim());
    if (actionSelectors.includes('[publish]') && this.hasAttribute('publish')) return this;
    if (actionSelectors.includes('[get]') && this.hasAttribute('get')) return this;
    return null;
  }

  matches(selector) {
    const selectors = selector.split(',').map(part => part.trim().toLowerCase());
    if (selectors.includes('[get]') && this.hasAttribute('get')) return true;
    if (selectors.includes('[post]') && this.hasAttribute('post')) return true;
    if (selectors.includes('[put]') && this.hasAttribute('put')) return true;
    if (selectors.includes('[delete]') && this.hasAttribute('delete')) return true;
    if (selectors.includes('[patch]') && this.hasAttribute('patch')) return true;
    if (selectors.includes('[publish]') && this.hasAttribute('publish')) return true;
    if (selectors.includes('[timer]') && this.hasAttribute('timer')) return true;
    if (selectors.includes('[socket]') && this.hasAttribute('socket')) return true;
    return selectors.includes(this.tagName.toLowerCase());
  }

  querySelectorAll() {
    return this.descendants;
  }

  insertAdjacentHTML(position, content) {
    this.inserted.push({ position, content });
    if (position === 'beforeend') {
      this.innerHTML += content;
    }
  }

  remove() {
    this.connected = false;
    this.removed = true;
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

class FakeIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(element) {
    this.element = element;
  }

  disconnect() {
    this.disconnected = true;
  }
}
FakeIntersectionObserver.instances = [];

test('patchedUpdateTarget updates this targets, appends later defaults, and queues sequential work', () => {
  const element = new FakeElement('section');

  assert.equal(
    patchedUpdateTarget(
      { selector: 'this', strategy: 'innerHTML' },
      '<button GET="/unit">First</button>',
      element
    ),
    element
  );
  assert.equal(element.innerHTML, '<button GET="/unit">First</button>');
  assert.equal(document.dispatchedEvents.length, 1);

  patchedUpdateTarget(
    { selector: 'this', strategy: 'innerHTML' },
    '<span>Second</span>',
    element
  );

  assert.equal(element.innerHTML, '<button GET="/unit">First</button><span>Second</span>');

  const sequentialElement = new FakeElement('section');
  sequentialElement._htmlexSequentialMode = true;
  patchedUpdateTarget(
    { selector: 'this', strategy: 'append' },
    '<p>Queued</p>',
    sequentialElement
  );

  assert.equal(sequentialElement.innerHTML, '');
  assert.deepEqual(sequentialElement._htmlexSequentialUpdates, [{
    target: { selector: 'this', strategy: 'append' },
    content: '<p>Queued</p>',
  }]);
});

test('flushSequentialUpdates applies queued updates and afterUpdate callbacks', () => {
  const element = new FakeElement('section');
  const afterUpdateCalls = [];
  element._htmlexSequentialUpdates = [
    {
      target: { selector: 'this', strategy: 'append' },
      content: '<p>One</p>',
      afterUpdate: () => afterUpdateCalls.push('one'),
    },
    {
      target: { selector: 'this', strategy: 'append' },
      content: '<p>Two</p>',
      afterUpdate: () => afterUpdateCalls.push('two'),
    },
  ];
  element._htmlexSequentialUpdatesCursor = 0;

  flushSequentialUpdates(element);

  assert.equal(element.innerHTML, '<p>One</p><p>Two</p>');
  assert.deepEqual(afterUpdateCalls, ['one', 'two']);
  assert.deepEqual(element._htmlexSequentialUpdates, []);
  assert.equal(element._htmlexSequentialUpdatesCursor, 0);
});

test('registerElement emits publish signals and cleans old listeners on re-registration', async () => {
  const calls = [];
  const cleanupOne = registerSignalListener('unit:one', () => calls.push('one'));
  const cleanupTwo = registerSignalListener('unit:two', () => calls.push('two'));
  const element = new FakeElement('button', { publish: 'unit:one' });

  try {
    registerElement(element);
    await element.listeners.get('click')({
      type: 'click',
      target: element,
      currentTarget: element,
    });

    element.setAttribute('publish', 'unit:two');
    registerElement(element);
    await element.listeners.get('click')({
      type: 'click',
      target: element,
      currentTarget: element,
    });

    assert.deepEqual(calls, ['one', 'two']);
    assert.equal(element.getAttribute('data-htmlex-registered'), 'true');
  } finally {
    cleanupOne();
    cleanupTwo();
  }
});

test('registerElement timer targets remove this element and cleanup stale timers on re-registration', () => {
  const timers = [];
  globalThis.setTimeout = (callback, delayMs) => {
    if (!delayMs) {
      callback();
      return -1;
    }
    timers.push({ callback, delayMs, cleared: false });
    return timers.length - 1;
  };
  globalThis.clearTimeout = (timerId) => {
    timers[timerId].cleared = true;
  };
  const element = new FakeElement('div', {
    timer: '50',
    target: 'this(remove)',
  });

  registerElement(element);

  assert.equal(timers[0].delayMs, 50);
  assert.equal(element.getAttribute('data-timer-set'), 'true');
  assert.equal(element.listeners.size, 0);

  element.setAttribute('timer', '75');
  registerElement(element);

  assert.equal(timers[0].cleared, true);
  assert.equal(element.getAttribute('data-timer-set'), 'true');

  timers[1].callback();

  assert.equal(element.removed, true);
});

test('registerElement clears pending timers when the timer attribute changes', () => {
  FakeMutationObserver.instances = [];
  globalThis.MutationObserver = FakeMutationObserver;
  const timers = [];
  globalThis.setTimeout = (callback, delayMs) => {
    timers.push({ callback, delayMs, cleared: false });
    return timers.length - 1;
  };
  globalThis.clearTimeout = (timerId) => {
    timers[timerId].cleared = true;
  };
  const element = new FakeElement('div', {
    timer: '50',
    target: 'this(remove)',
  });

  registerElement(element);
  const observer = FakeMutationObserver.instances.at(-1);
  assert.equal(element.listeners.size, 0);

  element.removeAttribute('timer');
  observer.callback([{ type: 'attributes', target: element, attributeName: 'timer' }]);
  timers[0].callback();

  assert.equal(observer.options.attributeFilter[0], 'timer');
  assert.equal(timers[0].cleared, true);
  assert.equal(element.hasAttribute('data-timer-set'), false);
  assert.equal(element.removed, false);
});

test('registerElement wires method actions through fetch and target updates', async () => {
  const output = new FakeElement('section');
  document.querySelector = selector => selector === '#out' ? output : null;
  document.querySelectorAll = selector => selector === '#out' ? [output] : [];
  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return new Response('Registered action response');
  };
  globalThis.setTimeout = (callback) => {
    callback();
    return 1;
  };
  const element = new FakeElement('button', {
    get: '/registered-action',
    target: '#out(append)',
  });

  registerElement(element);
  await element.listeners.get('click')({
    type: 'click',
    target: element,
    currentTarget: element,
  });
  await delay(0);

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, '/registered-action');
  assert.equal(fetchCalls[0].options.method, 'GET');
  assert.deepEqual(output.inserted, [{
    position: 'beforeend',
    content: 'Registered action response',
  }]);
});

test('sequential actions start API calls one at a time', async () => {
  const output = new FakeElement('section');
  document.querySelector = selector => selector === '#seqOut' ? output : null;
  document.querySelectorAll = selector => selector === '#seqOut' ? [output] : [];
  const responseResolvers = [];
  const fetchCalls = [];
  globalThis.fetch = async (url) => {
    const callNumber = fetchCalls.length + 1;
    fetchCalls.push(url);
    return new Promise(resolve => {
      responseResolvers.push(() => resolve(new Response(`Sequential ${callNumber}`)));
    });
  };
  const element = new FakeElement('button', {
    get: '/sequential-unit',
    sequential: '0',
    target: '#seqOut(append)',
  });

  registerElement(element);
  await element.listeners.get('click')({
    type: 'click',
    target: element,
    currentTarget: element,
  });
  await element.listeners.get('click')({
    type: 'click',
    target: element,
    currentTarget: element,
  });
  await delay(0);

  assert.deepEqual(fetchCalls, ['/sequential-unit']);
  assert.deepEqual(output.inserted, []);

  responseResolvers[0]();
  await delay(5);

  assert.deepEqual(fetchCalls, ['/sequential-unit', '/sequential-unit']);
  assert.deepEqual(output.inserted, [{
    position: 'beforeend',
    content: 'Sequential 1',
  }]);

  responseResolvers[1]();
  await delay(5);

  assert.deepEqual(output.inserted, [
    {
      position: 'beforeend',
      content: 'Sequential 1',
    },
    {
      position: 'beforeend',
      content: 'Sequential 2',
    },
  ]);
});

test('sequential queue failures reset processing state for later recovery', async () => {
  const output = new FakeElement('section');
  output.insertAdjacentHTML = () => {
    throw new Error('unit update failure');
  };
  document.querySelector = selector => selector === '#brokenOut' ? output : null;
  document.querySelectorAll = selector => selector === '#brokenOut' ? [output] : [];
  globalThis.fetch = async () => new Response('Broken sequential response');
  const element = new FakeElement('button', {
    get: '/broken-sequential',
    sequential: '1',
    target: '#brokenOut(append)',
  });

  registerElement(element);
  await element.listeners.get('click')({
    type: 'click',
    target: element,
    currentTarget: element,
  });
  await delay(20);

  assert.equal(element._htmlexSequentialProcessing, false);
  assert.equal(element._htmlexSequentialMode, false);
  assert.equal(element._htmlexSequentialQueue?.length ?? 0, 0);
  assert.equal(element._htmlexSequentialUpdates?.length ?? 0, 0);
});

test('registerElement handles subscribe-triggered API actions and cleanup on removal', async () => {
  const output = new FakeElement('section');
  document.querySelector = selector => selector === '#subOut' ? output : null;
  document.querySelectorAll = selector => selector === '#subOut' ? [output] : [];
  globalThis.MutationObserver = FakeMutationObserver;
  globalThis.fetch = async () => new Response('Subscribed response');
  const element = new FakeElement('div', {
    subscribe: 'unit:subscribe',
    get: '/subscribed-action',
    target: '#subOut(append)',
  });

  registerElement(element);
  emitSignal('unit:subscribe');
  await delay(0);

  assert.equal(output.inserted[0].content, 'Subscribed response');

  element.connected = false;
  FakeMutationObserver.instances.at(-1).callback();
  emitSignal('unit:subscribe');
  await delay(0);

  assert.equal(output.inserted.length, 1);
});

test('initHTMLeX registers existing controls and DOM-updated descendants', () => {
  FakeMutationObserver.instances = [];
  globalThis.MutationObserver = FakeMutationObserver;
  const initial = new FakeElement('button', { get: '/initial' });
  const inserted = new FakeElement('button', { get: '/inserted' });
  const root = new FakeElement('section', {}, [inserted]);
  const documentListeners = new Map();
  document.querySelectorAll = () => [initial];
  document.addEventListener = (eventName, callback) => {
    documentListeners.set(eventName, callback);
  };
  document.removeEventListener = (eventName) => {
    documentListeners.delete(eventName);
  };

  initHTMLeX();
  documentListeners.get('htmlex:dom-updated')({ detail: { root } });

  assert.equal(initial.getAttribute('data-htmlex-registered'), 'true');
  assert.equal(inserted.getAttribute('data-htmlex-registered'), 'true');
  assert.equal(FakeMutationObserver.instances.length, 1);
  assert.equal(FakeMutationObserver.instances[0].target, document.body);
  assert.equal(window.__htmlexObserver, FakeMutationObserver.instances[0]);
});

test('registerElement polling respects repeat limits and clears removal observers', async () => {
  const output = new FakeElement('section');
  document.querySelector = selector => selector === '#pollOut' ? output : null;
  document.querySelectorAll = selector => selector === '#pollOut' ? [output] : [];
  globalThis.MutationObserver = FakeMutationObserver;
  const intervals = [];
  globalThis.setInterval = (callback, intervalMs) => {
    intervals.push({ callback, intervalMs, cleared: false });
    return intervals.length - 1;
  };
  globalThis.clearInterval = (intervalId) => {
    intervals[intervalId].cleared = true;
  };
  globalThis.setTimeout = (callback) => {
    callback();
    return 1;
  };
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(`Poll ${fetchCount}`);
  };
  const element = new FakeElement('div', {
    get: '/poll',
    poll: '1',
    repeat: '1',
    target: '#pollOut(append)',
  });

  registerElement(element);

  assert.equal(intervals[0].intervalMs, 100);
  intervals[0].callback();
  await delay(0);
  intervals[0].callback();

  assert.equal(fetchCount, 1);
  assert.equal(output.inserted[0].content, 'Poll 1');
  assert.equal(intervals[0].cleared, true);
  assert.equal(FakeMutationObserver.instances.at(-1).disconnected, true);
});

test('registerElement auto modes handle false, delayed, prefetch, and lazy observer flows', async () => {
  const output = new FakeElement('section');
  document.querySelector = selector => selector === '#autoOut' ? output : null;
  document.querySelectorAll = selector => selector === '#autoOut' ? [output] : [];
  globalThis.MutationObserver = FakeMutationObserver;
  globalThis.IntersectionObserver = FakeIntersectionObserver;
  const timers = [];
  globalThis.setTimeout = (callback, delayMs) => {
    if (!delayMs) {
      callback();
      return -1;
    }
    timers.push({ callback, delayMs, cleared: false });
    return timers.length - 1;
  };
  globalThis.clearTimeout = (timerId) => {
    timers[timerId].cleared = true;
  };
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(`Auto ${fetchCount}`);
  };

  const disabled = new FakeElement('button', {
    get: '/disabled-auto',
    auto: 'false',
    target: '#autoOut(append)',
  });
  registerElement(disabled);
  await delay(0);
  assert.equal(fetchCount, 0);

  const delayed = new FakeElement('button', {
    get: '/delayed-auto',
    auto: '25',
    target: '#autoOut(append)',
  });
  registerElement(delayed);
  assert.equal(timers.at(-1).delayMs, 25);
  timers.at(-1).callback();
  await delay(0);

  const prefetch = new FakeElement('button', {
    get: '/prefetch-auto',
    auto: 'prefetch',
    target: '#autoOut(append)',
  });
  registerElement(prefetch);
  await delay(0);

  FakeIntersectionObserver.instances = [];
  const lazy = new FakeElement('button', {
    get: '/lazy-auto',
    auto: 'lazy',
    target: '#autoOut(append)',
  });
  registerElement(lazy);
  FakeIntersectionObserver.instances[0].callback([
    { isIntersecting: true },
  ], FakeIntersectionObserver.instances[0]);
  await delay(0);

  assert.equal(fetchCount, 3);
  assert.deepEqual(output.inserted.map(entry => entry.content), ['Auto 1', 'Auto 2', 'Auto 3']);
  assert.equal(FakeIntersectionObserver.instances[0].disconnected, true);
  assert.equal(lazy._htmlexLazyObserver, null);
});

test('initHTMLeX mutation observer registers child nodes and cleans removed attributes', () => {
  FakeMutationObserver.instances = [];
  globalThis.MutationObserver = FakeMutationObserver;
  const registered = new FakeElement('button', { get: '/existing' });
  const added = new FakeElement('button', { get: '/added' });
  const documentListeners = new Map();
  document.querySelectorAll = () => [registered];
  document.addEventListener = (eventName, callback) => {
    documentListeners.set(eventName, callback);
  };
  document.removeEventListener = () => {};

  initHTMLeX();
  const observer = FakeMutationObserver.instances.at(-1);

  observer.callback([{ type: 'childList', addedNodes: [added] }]);
  registered.removeAttribute('get');
  observer.callback([{ type: 'attributes', target: registered }]);

  assert.equal(added.getAttribute('data-htmlex-registered'), 'true');
  assert.equal(registered.hasAttribute('data-htmlex-registered'), false);
});

test('initHTMLeX processes every attribute mutation in one observer batch', () => {
  FakeMutationObserver.instances = [];
  globalThis.MutationObserver = FakeMutationObserver;
  const first = new FakeElement('button', { get: '/first' });
  const second = new FakeElement('button', { get: '/second' });
  document.querySelectorAll = () => [];
  document.addEventListener = () => {};
  document.removeEventListener = () => {};

  initHTMLeX();
  const observer = FakeMutationObserver.instances.at(-1);

  observer.callback([
    { type: 'attributes', target: first },
    { type: 'attributes', target: second },
  ]);

  assert.equal(first.getAttribute('data-htmlex-registered'), 'true');
  assert.equal(second.getAttribute('data-htmlex-registered'), 'true');
});
