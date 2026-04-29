import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { handleAction, processResponse } from '../../src/public/src/actions.js';
import { Logger } from '../../src/public/src/logger.js';

let originalDocument;
let originalFetch;
let originalFormData;
let originalHTMLInputElement;
let originalHTMLSelectElement;
let originalRequestAnimationFrame;
let originalWindow;
let originalHistory;
let originalLoggerEnabled;

beforeEach(() => {
  originalDocument = globalThis.document;
  originalFetch = globalThis.fetch;
  originalFormData = globalThis.FormData;
  originalHTMLInputElement = globalThis.HTMLInputElement;
  originalHTMLSelectElement = globalThis.HTMLSelectElement;
  originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  originalWindow = globalThis.window;
  originalHistory = globalThis.history;
  originalLoggerEnabled = Logger.enabled;
  Logger.enabled = false;
  globalThis.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  globalThis.HTMLInputElement = FakeInput;
  globalThis.HTMLSelectElement = FakeSelect;
});

afterEach(() => {
  if (originalDocument === undefined) {
    delete globalThis.document;
  } else {
    globalThis.document = originalDocument;
  }

  if (originalFetch === undefined) {
    delete globalThis.fetch;
  } else {
    globalThis.fetch = originalFetch;
  }

  if (originalFormData === undefined) {
    delete globalThis.FormData;
  } else {
    globalThis.FormData = originalFormData;
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

  if (originalRequestAnimationFrame === undefined) {
    delete globalThis.requestAnimationFrame;
  } else {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }

  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }

  if (originalHistory === undefined) {
    delete globalThis.history;
  } else {
    globalThis.history = originalHistory;
  }

  delete globalThis.__actionHooks;
  Logger.enabled = originalLoggerEnabled;
});

class FakeInput {
  constructor({ name, value = '', type = 'text', checked = true, disabled = false } = {}) {
    this.name = name;
    this.value = value;
    this.type = type;
    this.checked = checked;
    this.disabled = disabled;
  }
}

class FakeSelect {}

class FakeElement {
  constructor({ tagName = 'button', attributes = {}, controls = [] } = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.controls = controls;
    this.inserted = [];
    this.connected = true;
  }

  hasAttribute(name) {
    return Object.hasOwn(this.attributes, name);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  matches(selector) {
    return selector.split(',').map(part => part.trim().toLowerCase()).includes(this.tagName.toLowerCase());
  }

  querySelectorAll() {
    return this.controls;
  }

  insertAdjacentHTML(position, content) {
    this.inserted.push({ position, content });
  }
}

function installDocument(targets = {}) {
  globalThis.document = {
    body: {
      contains(element) {
        return element.connected !== false;
      },
    },
    querySelector(selector) {
      return targets[selector] || null;
    },
    querySelectorAll(selector) {
      const result = targets[selector];
      if (!result) return [];
      return Array.isArray(result) ? result : [result];
    },
  };
}

test('processResponse falls back to the caller target for non-fragment response bodies', async () => {
  const output = new FakeElement();
  const element = new FakeElement({
    attributes: {
      target: '#out(append)',
      onafterSwap: "globalThis.__actionHooks.push('afterSwap:' + event.type)",
    },
  });
  globalThis.__actionHooks = [];
  installDocument({ '#out': output });

  const responseText = await processResponse(
    new Response('Plain response'),
    element,
    null,
    () => globalThis.__actionHooks.push('after'),
    { type: 'click' },
    element._htmlexRequestId
  );

  assert.equal(responseText, 'Plain response');
  assert.equal(element._htmlexFallbackUpdated, true);
  assert.deepEqual(output.inserted, [{
    position: 'beforeend',
    content: 'Plain response',
  }]);
  assert.deepEqual(globalThis.__actionHooks, ['afterSwap:click', 'after']);
});

test('processResponse handles empty response bodies without leaving streaming flags set', async () => {
  const element = new FakeElement();

  assert.equal(await processResponse({ body: null }, element), '');
  assert.equal(element._htmlexStreamingActive, false);
  assert.equal(element._htmlexStreaming, false);
});

test('handleAction assembles GET params, loading state, hooks, URL state, and cache hits', async () => {
  const endpoint = `/unit-action-${Date.now()}`;
  const output = new FakeElement();
  const loading = new FakeElement();
  const source = new FakeElement({
    controls: [
      new FakeInput({ name: 'sourceValue', value: 'from-source' }),
      new FakeInput({ name: 'skipDisabled', value: 'nope', disabled: true }),
      new FakeInput({ name: 'skipUnchecked', value: 'nope', type: 'checkbox', checked: false }),
    ],
  });
  const historyCalls = [];
  globalThis.__actionHooks = [];
  globalThis.window = {
    location: {
      href: 'https://example.test/old?remove=1',
    },
  };
  globalThis.history = {
    replaceState(_state, _title, url) {
      historyCalls.push(url);
    },
  };
  installDocument({
    '#out': output,
    '#loading': loading,
    '#source': source,
  });

  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return new Response('Fresh response');
  };

  const element = new FakeElement({
    attributes: {
      source: '#source',
      extras: 'locale=en token=a=b',
      loading: '#loading(append)',
      target: '#out(append)',
      cache: '1000',
      push: 'q=ok',
      pull: 'remove',
      path: '/new-path',
      history: 'replace',
      onbefore: "globalThis.__actionHooks.push('before:' + event.type)",
      onbeforeSwap: "globalThis.__actionHooks.push('beforeSwap:' + event.type)",
      onafterSwap: "globalThis.__actionHooks.push('afterSwap:' + event.type)",
      onafter: "globalThis.__actionHooks.push('after:' + event.type)",
    },
  });

  await handleAction(element, 'GET', endpoint, { htmlexEvent: { type: 'unit' } });
  await handleAction(element, 'GET', endpoint, { htmlexEvent: { type: 'unit' } });

  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, new RegExp(`^${endpoint}\\?`));
  assert.match(fetchCalls[0].url, /sourceValue=from-source/);
  assert.match(fetchCalls[0].url, /locale=en/);
  assert.match(fetchCalls[0].url, /token=a%3Db/);
  assert.doesNotMatch(fetchCalls[0].url, /skipDisabled|skipUnchecked/);
  assert.match(loading.inserted[0].content, /Loading/);
  assert.equal(output.inserted.filter(entry => entry.content === 'Fresh response').length, 2);
  assert.deepEqual(globalThis.__actionHooks, [
    'before:unit',
    'beforeSwap:unit',
    'afterSwap:unit',
    'after:unit',
    'before:unit',
    'beforeSwap:unit',
    'afterSwap:unit',
    'after:unit',
  ]);
  assert.equal(historyCalls.at(-1), 'https://example.test/new-path?q=ok');
  assert.equal(element._htmlexRequestPending, false);
});

test('handleAction retries failures and writes the configured error target', async () => {
  const errorTarget = new FakeElement();
  installDocument({ '#error': errorTarget });
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response('Down', {
      status: 503,
      statusText: 'Unavailable',
    });
  };

  const element = new FakeElement({
    attributes: {
      retry: '1',
      onerror: '#error(append)',
    },
  });

  await handleAction(element, 'GET', `/unit-error-${Date.now()}`);

  assert.equal(fetchCount, 2);
  assert.equal(errorTarget.inserted.length, 1);
  assert.match(errorTarget.inserted[0].content, /Error: HTTP 503 Unavailable/);
  assert.equal(element._htmlexRequestPending, false);
});

test('handleAction exits cleanly for disabled polling and abort errors', async () => {
  const disabledElement = new FakeElement();
  disabledElement._pollDisabled = true;
  let fetchCount = 0;
  globalThis.fetch = async (_url, options = {}) => {
    fetchCount += 1;
    if (options.signal?.aborted) {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      throw abortError;
    }
    return new Response('Never');
  };
  installDocument();

  await handleAction(disabledElement, 'GET', '/disabled');
  assert.equal(fetchCount, 0);
  assert.equal(disabledElement._htmlexRequestPending, false);

  const abortElement = new FakeElement();
  const controller = new AbortController();
  controller.abort();
  await handleAction(abortElement, 'GET', '/aborted', { signal: controller.signal });

  assert.equal(fetchCount, 1);
  assert.equal(abortElement._htmlexRequestPending, false);
});
