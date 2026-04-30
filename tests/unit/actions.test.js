import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { handleAction, processResponse } from '../../src/public/src/actions.js';
import { clearLifecycleHooksForTests, registerLifecycleHook } from '../../src/public/src/hooks.js';
import { Logger } from '../../src/public/src/logger.js';

let originalDocument;
let originalFetch;
let originalFile;
let originalFormData;
let originalHTMLInputElement;
let originalHTMLSelectElement;
let originalRequestAnimationFrame;
let originalSetTimeout;
let originalURLSearchParams;
let originalWindow;
let originalHistory;
let originalLoggerEnabled;

beforeEach(() => {
  originalDocument = globalThis.document;
  originalFetch = globalThis.fetch;
  originalFile = globalThis.File;
  originalFormData = globalThis.FormData;
  originalHTMLInputElement = globalThis.HTMLInputElement;
  originalHTMLSelectElement = globalThis.HTMLSelectElement;
  originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  originalSetTimeout = globalThis.setTimeout;
  originalURLSearchParams = globalThis.URLSearchParams;
  originalWindow = globalThis.window;
  originalHistory = globalThis.history;
  originalLoggerEnabled = Logger.enabled;
  Logger.enabled = false;
  clearLifecycleHooksForTests();
  globalThis.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  globalThis.HTMLInputElement = FakeInput;
  globalThis.HTMLSelectElement = FakeSelect;
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

  if (originalFile === undefined) {
    delete globalThis.File;
  } else {
    globalThis.File = originalFile;
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

  if (originalSetTimeout === undefined) {
    delete globalThis.setTimeout;
  } else {
    globalThis.setTimeout = originalSetTimeout;
  }

  if (originalURLSearchParams === undefined) {
    delete globalThis.URLSearchParams;
  } else {
    globalThis.URLSearchParams = originalURLSearchParams;
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
  delete globalThis.__actionSignals;
  delete globalThis.__unsafeHookRan;
  clearLifecycleHooksForTests();
  Logger.enabled = originalLoggerEnabled;
});

class FakeInput {
  constructor({ name, value = '', type = 'text', checked = true, disabled = false, files = [] } = {}) {
    this.tagName = 'INPUT';
    this.name = name;
    this.value = value;
    this.type = type;
    this.checked = checked;
    this.disabled = disabled;
    this.files = files;
  }
}

class FakeSelect {
  constructor({ name, multiple = false, selectedOptions = [], value = '', disabled = false } = {}) {
    this.tagName = 'SELECT';
    this.name = name;
    this.multiple = multiple;
    this.selectedOptions = selectedOptions;
    this.value = value;
    this.disabled = disabled;
    this.type = 'select-one';
  }
}

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
    dispatchedEvents: [],
    body: {
      contains(element) {
        return element.connected !== false;
      },
    },
    createElement(tagName) {
      assert.equal(tagName, 'template');
      return {
        content: {},
        set innerHTML(html) {
          const attributes = Object.fromEntries(
            [...html.matchAll(/\s([A-Za-z][\w:-]*)="([^"]*)"/g)]
              .map(([, name, value]) => [name, value])
          );
          this.content.firstElementChild = {
            getAttribute(name) {
              return attributes[name] ?? null;
            },
          };
        },
      };
    },
    dispatchEvent(event) {
      this.dispatchedEvents.push(event);
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
      onafterSwap: 'record:after-swap',
    },
  });
  globalThis.__actionHooks = [];
  registerLifecycleHook('record:after-swap', ({ event }) => {
    globalThis.__actionHooks.push(`afterSwap:${event.type}`);
  });
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
  element._htmlexFragmentErrorStatus = '500';
  element._htmlexDefaultUpdated = true;

  assert.equal(await processResponse({ body: null }, element), '');
  assert.equal(element._htmlexFragmentErrorStatus, null);
  assert.equal(element._htmlexDefaultUpdated, false);
  assert.equal(element._htmlexStreamingActive, false);
  assert.equal(element._htmlexStreaming, false);
});

test('processResponse tolerates hostile response attribute APIs', async () => {
  const element = new FakeElement({
    attributes: {
      cache: '1000',
      target: '#out(append)',
      maxresponsechars: '100',
    },
  });
  element.hasAttribute = () => {
    throw new Error('attribute check denied');
  };
  element.getAttribute = () => {
    throw new Error('attribute read denied');
  };
  installDocument({ '#out': new FakeElement() });

  const responseText = await processResponse(new Response('Plain hostile attribute response'), element);

  assert.equal(responseText, 'Plain hostile attribute response');
  assert.equal(element._htmlexStreamingActive, false);
  assert.equal(element._htmlexStreaming, false);
});

test('processResponse rejects responses that exceed the configured buffer limit', async () => {
  const output = new FakeElement();
  const element = new FakeElement({
    attributes: {
      target: '#out(append)',
      maxresponsechars: '8',
    },
  });
  installDocument({ '#out': output });

  await assert.rejects(
    () => processResponse(new Response('0123456789'), element),
    {
      name: 'ResponseBufferLimitError',
      message: /8 character safety limit/
    }
  );
  assert.deepEqual(output.inserted, []);
  assert.equal(element._htmlexStreamingActive, false);
  assert.equal(element._htmlexStreaming, false);
});

test('processResponse releases retained text for uncached fragment-only responses', async () => {
  installDocument();
  const element = new FakeElement();
  const fragmentResponse = '<fragment target="this(innerHTML)"><span>Fragment only</span></fragment>';

  const responseText = await processResponse(new Response(fragmentResponse), element);

  assert.equal(responseText, '');
  assert.equal(element.innerHTML, '<span>Fragment only</span>');
});

test('processResponse retains text for cacheable fragment responses', async () => {
  installDocument();
  const element = new FakeElement({
    attributes: {
      cache: '1000',
    },
  });
  const fragmentResponse = '<fragment target="this(innerHTML)"><span>Cached fragment</span></fragment>';

  const responseText = await processResponse(new Response(fragmentResponse), element);

  assert.equal(responseText, fragmentResponse);
  assert.equal(element.innerHTML, '<span>Cached fragment</span>');
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
      onbefore: 'record:before',
      onbeforeSwap: 'record:before-swap',
      onafterSwap: 'record:after-swap',
      onafter: 'record:after',
    },
  });
  registerLifecycleHook('record:before', ({ event }) => {
    globalThis.__actionHooks.push(`before:${event.type}`);
  });
  registerLifecycleHook('record:before-swap', ({ event }) => {
    globalThis.__actionHooks.push(`beforeSwap:${event.type}`);
  });
  registerLifecycleHook('record:after-swap', ({ event }) => {
    globalThis.__actionHooks.push(`afterSwap:${event.type}`);
  });
  registerLifecycleHook('record:after', ({ event }) => {
    globalThis.__actionHooks.push(`after:${event.type}`);
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

test('handleAction ignores script-like lifecycle values instead of executing them', async () => {
  installDocument();
  globalThis.fetch = async () => new Response('');

  const element = new FakeElement({
    attributes: {
      onbefore: 'globalThis.__unsafeHookRan = true',
    },
  });

  await handleAction(element, 'GET', '/unsafe-hook');

  assert.equal(globalThis.__unsafeHookRan, undefined);
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

test('handleAction treats partial retry and timeout attributes as invalid', async () => {
  const errorTarget = new FakeElement();
  installDocument({ '#error': errorTarget });
  let fetchCount = 0;
  globalThis.fetch = async (_url, options = {}) => {
    fetchCount += 1;
    assert.equal(options.signal, undefined);
    return new Response('Down', {
      status: 503,
      statusText: 'Unavailable',
    });
  };

  const element = new FakeElement({
    attributes: {
      retry: '1abc',
      timeout: '25ms',
      onerror: '#error(append)',
    },
  });

  await handleAction(element, 'GET', `/unit-partial-retry-${Date.now()}`);

  assert.equal(fetchCount, 1);
  assert.equal(errorTarget.inserted.length, 1);
  assert.equal(element._htmlexRequestPending, false);
});

test('handleAction applies configurable retry delay and backoff before later attempts', async () => {
  const timers = [];
  globalThis.setTimeout = (callback, delayMs) => {
    timers.push({ callback, delayMs });
    return timers.length - 1;
  };
  const output = new FakeElement();
  installDocument({ '#out': output });
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    if (fetchCount < 3) {
      return new Response('Down', {
        status: 503,
        statusText: 'Unavailable',
      });
    }
    return new Response('Recovered');
  };
  const element = new FakeElement({
    attributes: {
      retry: '2',
      retrydelay: '10',
      retrybackoff: '2',
      retrymaxdelay: '15',
      target: '#out(append)',
    },
  });

  const actionPromise = handleAction(element, 'GET', `/unit-retry-backoff-${Date.now()}`);
  await new Promise(resolve => originalSetTimeout(resolve, 0));

  assert.equal(fetchCount, 1);
  assert.deepEqual(timers.map(timer => timer.delayMs), [10]);

  timers[0].callback();
  await new Promise(resolve => originalSetTimeout(resolve, 0));
  await new Promise(resolve => originalSetTimeout(resolve, 0));

  assert.equal(fetchCount, 2);
  assert.deepEqual(timers.map(timer => timer.delayMs), [10, 15]);

  timers[1].callback();
  await actionPromise;

  assert.equal(fetchCount, 3);
  assert.deepEqual(output.inserted, [{
    position: 'beforeend',
    content: 'Recovered',
  }]);
});

test('handleAction treats partial retry delay, backoff, and max-delay attributes as invalid', async () => {
  const timers = [];
  globalThis.setTimeout = (callback, delayMs) => {
    timers.push({ callback, delayMs });
    return timers.length - 1;
  };
  const output = new FakeElement();
  installDocument({ '#out': output });

  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    if (fetchCount < 3) {
      return new Response('Down', {
        status: 503,
        statusText: 'Unavailable',
      });
    }
    return new Response('Recovered strict');
  };
  const element = new FakeElement({
    attributes: {
      retry: '2',
      retrydelay: '10',
      retrybackoff: '2x',
      retrymaxdelay: '15ms',
      target: '#out(append)',
    },
  });

  const actionPromise = handleAction(element, 'GET', `/unit-strict-retry-backoff-${Date.now()}`);
  await new Promise(resolve => originalSetTimeout(resolve, 0));

  assert.equal(fetchCount, 1);
  assert.deepEqual(timers.map(timer => timer.delayMs), [10]);

  timers[0].callback();
  await new Promise(resolve => originalSetTimeout(resolve, 0));
  await new Promise(resolve => originalSetTimeout(resolve, 0));

  assert.equal(fetchCount, 2);
  assert.deepEqual(timers.map(timer => timer.delayMs), [10, 10]);

  timers[1].callback();
  await actionPromise;

  assert.equal(fetchCount, 3);
  assert.deepEqual(output.inserted, [{
    position: 'beforeend',
    content: 'Recovered strict',
  }]);

  fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    if (fetchCount === 1) {
      return new Response('Down', {
        status: 503,
        statusText: 'Unavailable',
      });
    }
    return new Response('Recovered no delay');
  };
  const noDelayElement = new FakeElement({
    attributes: {
      retry: '1',
      retrydelay: '10ms',
      target: '#out(append)',
    },
  });

  await handleAction(noDelayElement, 'GET', `/unit-strict-retry-delay-${Date.now()}`);

  assert.equal(fetchCount, 2);
  assert.deepEqual(timers.map(timer => timer.delayMs), [10, 10]);
});

test('handleAction treats error-status fragments as failed swaps without success side effects', async () => {
  const output = new FakeElement();
  const historyCalls = [];
  globalThis.__actionHooks = [];
  globalThis.__actionSignals = [];
  globalThis.history = {
    replaceState(_state, _title, url) {
      historyCalls.push(url);
    },
  };
  installDocument({ '#out': output });
  globalThis.fetch = async () => new Response(
    '<fragment target="#out(append)" status="500"><span>Fragment failed</span></fragment>'
  );
  const { registerSignalListener } = await import('../../src/public/src/signals.js');
  const cleanupSignal = registerSignalListener('fragment:success', () => {
    globalThis.__actionSignals.push('success');
  });
  registerLifecycleHook('record:after-fragment-error', () => {
    globalThis.__actionHooks.push('after');
  });

  try {
    const element = new FakeElement({
      attributes: {
        target: '#out(append)',
        publish: 'fragment:success',
        push: 'status=success',
        onafter: 'record:after-fragment-error',
      },
    });

    await handleAction(element, 'GET', `/unit-fragment-status-${Date.now()}`);

    assert.deepEqual(output.inserted, [{
      position: 'beforeend',
      content: '<span>Fragment failed</span>',
    }]);
    assert.deepEqual(globalThis.__actionSignals, []);
    assert.deepEqual(historyCalls, []);
    assert.deepEqual(globalThis.__actionHooks, []);
    assert.equal(element._htmlexRequestPending, false);
  } finally {
    cleanupSignal();
  }
});

test('handleAction escapes error messages before rendering onerror content', async () => {
  const errorTarget = new FakeElement();
  installDocument({ '#error': errorTarget });
  globalThis.fetch = async () => {
    throw new Error('bad <img src=x onerror=alert(1)> & "quoted"');
  };

  const element = new FakeElement({
    attributes: {
      onerror: '#error(append)',
    },
  });

  await handleAction(element, 'GET', `/unit-unsafe-error-${Date.now()}`);

  assert.equal(errorTarget.inserted.length, 1);
  assert.match(
    errorTarget.inserted[0].content,
    /bad &lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;quoted&quot;/
  );
  assert.doesNotMatch(errorTarget.inserted[0].content, /<img/i);
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

test('handleAction serializes POST controls, multi-selects, files, form sources, and cache keys', async () => {
  class FakeFile {
    constructor(name, size, type, lastModified) {
      this.name = name;
      this.size = size;
      this.type = type;
      this.lastModified = lastModified;
    }
  }
  class FakeFormData {
    constructor(form = null) {
      this.values = [];
      if (form?.formEntries) {
        for (const [key, value] of form.formEntries) {
          this.append(key, value);
        }
      }
    }

    append(key, value) {
      this.values.push([key, value]);
    }

    entries() {
      return this.values[Symbol.iterator]();
    }

    [Symbol.iterator]() {
      return this.entries();
    }
  }
  globalThis.File = FakeFile;
  globalThis.FormData = FakeFormData;

  const uploadedFile = new FakeFile('report.txt', 12, 'text/plain', 123);
  const output = new FakeElement();
  const sourceForm = new FakeElement({
    tagName: 'form',
  });
  sourceForm.formEntries = [['fromForm', 'source-form']];
  const sourceFallback = new FakeElement({
    controls: [new FakeInput({ name: 'fromFallback', value: 'split-source' })],
  });
  const element = new FakeElement({
    attributes: {
      source: '#sourceForm #fallback',
      extras: 'extraOnly',
      target: '#out(append)',
      cache: '500',
    },
    controls: [
      new FakeInput({ name: 'title', value: 'Post title' }),
      new FakeInput({ name: 'ignoredRadio', value: 'no', type: 'radio', checked: false }),
      new FakeInput({ name: 'attachment', type: 'file', files: [uploadedFile] }),
      new FakeSelect({
        name: 'choice',
        multiple: true,
        selectedOptions: [{ value: 'a' }, { value: 'b' }],
      }),
    ],
  });
  installDocument({
    '#out': output,
    '#sourceForm': sourceForm,
    '#fallback': sourceFallback,
  });
  const originalQuerySelectorAll = document.querySelectorAll;
  document.querySelectorAll = (selector) => {
    if (selector === '#sourceForm #fallback') {
      throw new Error('compound selector intentionally unsupported');
    }
    return originalQuerySelectorAll(selector);
  };

  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options, bodyEntries: [...options.body.entries()] });
    return new Response('Posted response');
  };

  await handleAction(element, 'POST', '/post-action');
  await handleAction(element, 'POST', '/post-action');

  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0].url, '/post-action');
  assert.equal(fetchCalls[0].options.method, 'POST');
  assert.deepEqual(fetchCalls[0].bodyEntries, [
    ['title', 'Post title'],
    ['attachment', uploadedFile],
    ['choice', 'a'],
    ['choice', 'b'],
    ['fromForm', 'source-form'],
    ['fromFallback', 'split-source'],
    ['extraOnly', ''],
  ]);
  assert.equal(output.inserted.filter(entry => entry.content === 'Posted response').length, 2);
});

test('handleAction still caches POST bodies that do not include binary values', async () => {
  class FakeFormData {
    constructor() {
      this.values = [];
    }

    append(key, value) {
      this.values.push([key, value]);
    }

    entries() {
      return this.values[Symbol.iterator]();
    }

    [Symbol.iterator]() {
      return this.entries();
    }
  }
  globalThis.FormData = FakeFormData;

  const output = new FakeElement();
  const element = new FakeElement({
    attributes: {
      target: '#out(append)',
      cache: '500',
    },
    controls: [
      new FakeInput({ name: 'title', value: 'Post title' }),
    ],
  });
  installDocument({ '#out': output });

  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options, bodyEntries: [...options.body.entries()] });
    return new Response('Cached POST response');
  };

  await handleAction(element, 'POST', '/cached-post-action');
  await handleAction(element, 'POST', '/cached-post-action');

  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(fetchCalls[0].bodyEntries, [['title', 'Post title']]);
  assert.equal(output.inserted.filter(entry => entry.content === 'Cached POST response').length, 2);
});

test('handleAction tolerates non-constructor File globals when building POST cache keys', async () => {
  class FakeFormData {
    constructor() {
      this.values = [];
    }

    append(key, value) {
      this.values.push([key, value]);
    }

    entries() {
      return this.values[Symbol.iterator]();
    }

    [Symbol.iterator]() {
      return this.entries();
    }
  }
  globalThis.File = {};
  globalThis.FormData = FakeFormData;

  const uploadedFile = { name: 'not-a-real-file' };
  const output = new FakeElement();
  const element = new FakeElement({
    attributes: {
      target: '#out(append)',
      cache: '500',
    },
    controls: [
      new FakeInput({ name: 'attachment', type: 'file', files: [uploadedFile] }),
    ],
  });
  installDocument({ '#out': output });

  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, bodyEntries: [...options.body.entries()] });
    return new Response('Posted with fake File global');
  };

  await handleAction(element, 'POST', '/fake-file-global');

  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(fetchCalls[0].bodyEntries, [['attachment', uploadedFile]]);
  assert.equal(output.inserted[0].content, 'Posted with fake File global');
});

test('handleAction collects controls without browser control constructors and skips hostile source subtrees', async () => {
  class FakeFormData {
    constructor() {
      this.values = [];
    }

    append(key, value) {
      this.values.push([key, value]);
    }

    entries() {
      return this.values[Symbol.iterator]();
    }

    [Symbol.iterator]() {
      return this.entries();
    }
  }
  delete globalThis.HTMLInputElement;
  globalThis.HTMLSelectElement = {};
  globalThis.FormData = FakeFormData;

  const output = new FakeElement();
  const hostileSource = new FakeElement();
  hostileSource.matches = () => {
    throw new Error('matches unavailable');
  };
  hostileSource.querySelectorAll = () => {
    throw new Error('subtree unavailable');
  };
  const element = new FakeElement({
    attributes: {
      source: '#hostile',
      target: '#out(append)',
    },
    controls: [
      new FakeInput({ name: 'title', value: 'Constructor-free title' }),
      new FakeInput({ name: 'skipUnchecked', value: 'no', type: 'checkbox', checked: false }),
      new FakeSelect({
        name: 'choice',
        multiple: true,
        selectedOptions: [{ value: 'a' }, { value: 'b' }],
      }),
    ],
  });
  installDocument({
    '#out': output,
    '#hostile': hostileSource,
  });

  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, bodyEntries: [...options.body.entries()] });
    return new Response('Constructor-free controls');
  };

  await handleAction(element, 'POST', '/constructor-free-controls');

  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(fetchCalls[0].bodyEntries, [
    ['title', 'Constructor-free title'],
    ['choice', 'a'],
    ['choice', 'b'],
  ]);
  assert.equal(output.inserted[0].content, 'Constructor-free controls');
});

test('handleAction builds GET requests without FormData or URLSearchParams globals', async () => {
  delete globalThis.FormData;
  globalThis.URLSearchParams = {};

  const output = new FakeElement();
  const element = new FakeElement({
    attributes: {
      target: '#out(append)',
    },
    controls: [
      new FakeInput({ name: 'title', value: 'fallback query' }),
      new FakeInput({ name: 'empty', value: '' }),
    ],
  });
  installDocument({ '#out': output });
  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return new Response('Fallback query response');
  };

  await handleAction(element, 'GET', '/fallback-query');

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, '/fallback-query?title=fallback%20query&empty=');
  assert.equal(fetchCalls[0].options.method, 'GET');
  assert.equal(output.inserted[0].content, 'Fallback query response');
});

test('handleAction manual query serialization replaces invalid Unicode', async () => {
  class FakeFormData {
    constructor() {
      this.values = [];
    }

    append(key, value) {
      this.values.push([key, value]);
    }

    entries() {
      return this.values[Symbol.iterator]();
    }

    [Symbol.iterator]() {
      return this.entries();
    }
  }
  globalThis.FormData = FakeFormData;
  globalThis.URLSearchParams = class ThrowingURLSearchParams {
    constructor() {
      throw new Error('URLSearchParams denied');
    }
  };

  const output = new FakeElement();
  const element = new FakeElement({
    attributes: {
      target: '#out(append)',
    },
    controls: [
      new FakeInput({ name: 'bad\uD800', value: 'value\uD800' }),
    ],
  });
  installDocument({ '#out': output });
  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return new Response('Unicode query response');
  };

  await handleAction(element, 'GET', '/unicode-query');

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, '/unicode-query?bad%EF%BF%BD=value%EF%BF%BD');
  assert.equal(output.inserted[0].content, 'Unicode query response');
});

test('handleAction skips malformed FormData entries while building cache metadata', async () => {
  class HostileFormData {
    constructor() {
      this.values = [];
    }

    append(key, value) {
      this.values.push([key, value]);
    }

    entries() {
      return [
        ...this.values,
        null,
        {
          [Symbol.iterator]() {
            throw new Error('entry iterator denied');
          },
        },
        ['blank'],
      ][Symbol.iterator]();
    }

    [Symbol.iterator]() {
      return this.entries();
    }
  }
  globalThis.FormData = HostileFormData;

  const output = new FakeElement();
  const element = new FakeElement({
    attributes: {
      target: '#out(append)',
      cache: '500',
    },
    controls: [
      new FakeInput({ name: 'title', value: 'Cache title' }),
    ],
  });
  installDocument({ '#out': output });
  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return new Response('Cached malformed form data response');
  };

  await handleAction(element, 'POST', '/malformed-form-data');
  await handleAction(element, 'POST', '/malformed-form-data');

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, '/malformed-form-data');
  assert.equal(output.inserted.filter(entry => entry.content === 'Cached malformed form data response').length, 2);
});

test('handleAction ignores unsafe prototype-style fetch option keys', async () => {
  installDocument();
  const extraOptions = {
    headers: { 'x-unit': '1' },
  };
  Object.defineProperty(extraOptions, '__proto__', {
    enumerable: true,
    value: { polluted: true },
  });
  Object.defineProperty(extraOptions, 'constructor', {
    enumerable: true,
    value: 'polluted constructor',
  });
  Object.defineProperty(extraOptions, 'prototype', {
    enumerable: true,
    value: { polluted: true },
  });
  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return new Response('');
  };

  await handleAction(new FakeElement(), 'GET', '/safe-options', extraOptions);

  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(fetchCalls[0].options.headers, { 'x-unit': '1' });
  assert.equal(Object.hasOwn(fetchCalls[0].options, '__proto__'), false);
  assert.equal(Object.hasOwn(fetchCalls[0].options, 'constructor'), false);
  assert.equal(Object.hasOwn(fetchCalls[0].options, 'prototype'), false);
  assert.equal(Object.getPrototypeOf(fetchCalls[0].options), Object.prototype);
});

test('handleAction tolerates hostile controls and failing FormData constructors', async () => {
  globalThis.FormData = class ThrowingFormData {
    constructor() {
      throw new Error('FormData denied');
    }
  };

  const hostileControl = {
    get name() {
      throw new Error('control name denied');
    },
    get tagName() {
      throw new Error('control tag denied');
    },
  };
  const throwingValueControl = {
    tagName: 'INPUT',
    name: 'safe',
    type: 'text',
    get value() {
      throw new Error('control value denied');
    },
  };
  const element = new FakeElement({
    controls: [hostileControl, throwingValueControl],
  });
  installDocument();
  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return new Response('');
  };

  await handleAction(element, 'GET', '/hostile-controls');

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, '/hostile-controls?safe=');
});

test('handleAction tolerates hostile action strings and option getters', async () => {
  installDocument();
  const hostileString = {
    toString() {
      throw new Error('string denied');
    },
  };
  const hostileOptions = {};
  Object.defineProperty(hostileOptions, 'htmlexEvent', {
    enumerable: true,
    get() {
      throw new Error('event option denied');
    },
  });
  Object.defineProperty(hostileOptions, 'signal', {
    enumerable: true,
    get() {
      throw new Error('signal option denied');
    },
  });
  const element = new FakeElement({
    attributes: {
      source: hostileString,
      extras: hostileString,
    },
  });
  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return new Response('');
  };

  await assert.doesNotReject(() => handleAction(element, hostileString, hostileString, hostileOptions));

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, '');
  assert.equal(fetchCalls[0].options.method, '');
  assert.equal(fetchCalls[0].options.signal, undefined);
  assert.equal(element._htmlexRequestPending, false);
});

test('handleAction renders fallback error text for unstringifiable failures', async () => {
  const errorTarget = new FakeElement();
  installDocument({ '#error': errorTarget });
  globalThis.fetch = async () => {
    throw {
      toString() {
        throw new Error('error string denied');
      },
    };
  };

  const element = new FakeElement({
    attributes: {
      onerror: '#error(append)',
    },
  });

  await handleAction(element, 'GET', '/unstringifiable-error');

  assert.equal(errorTarget.inserted.length, 1);
  assert.match(errorTarget.inserted[0].content, /Error: Unknown error/);
  assert.equal(element._htmlexRequestPending, false);
});

test('handleAction retries and skips delayed signals when timers fail', async () => {
  const originalClearTimeout = globalThis.clearTimeout;
  const output = new FakeElement();
  const signals = [];
  const { registerSignalListener } = await import('../../src/public/src/signals.js');
  const cleanupHeader = registerSignalListener('timerFailHeader', () => signals.push('header'));
  const cleanupPublish = registerSignalListener('timerFailPublish', () => signals.push('publish'));
  globalThis.setTimeout = () => {
    throw new Error('timer denied');
  };
  globalThis.clearTimeout = () => {
    throw new Error('clear denied');
  };

  try {
    installDocument({ '#out': output });
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Response('Down', {
          status: 503,
          statusText: 'Unavailable',
        });
      }
      return new Response('Recovered without timers', {
        headers: {
          Emit: 'timerFailHeader; delay=10',
        },
      });
    };
    const element = new FakeElement({
      attributes: {
        retry: '1',
        retrydelay: '25',
        target: '#out(append)',
        publish: 'timerFailPublish',
        timer: '15',
      },
    });

    await handleAction(element, 'GET', '/timer-failures');

    assert.equal(fetchCount, 2);
    assert.deepEqual(output.inserted, [{
      position: 'beforeend',
      content: 'Recovered without timers',
    }]);
    assert.deepEqual(signals, ['publish']);
    assert.equal(element._htmlexRequestPending, false);
  } finally {
    globalThis.clearTimeout = originalClearTimeout;
    cleanupHeader();
    cleanupPublish();
  }
});

test('handleAction emits header and publish signals immediately or through guarded timers', async () => {
  const timers = [];
  globalThis.setTimeout = (callback, delayMs) => {
    timers.push({ callback, delayMs });
    return timers.length - 1;
  };
  globalThis.__actionSignals = [];
  const { registerSignalListener } = await import('../../src/public/src/signals.js');
  const cleanupHeader = registerSignalListener('headerSignal', () => globalThis.__actionSignals.push('header'));
  const cleanupPublish = registerSignalListener('publishSignal', () => globalThis.__actionSignals.push('publish'));

  try {
    installDocument();
    globalThis.fetch = async () => new Response('', {
      headers: {
        Emit: 'headerSignal; Delay=25',
      },
    });
    const element = new FakeElement({
      attributes: {
        publish: 'publishSignal',
        timer: '15',
      },
    });
    element._htmlexRegistrationToken = Symbol('registration');

    await handleAction(element, 'GET', '/signals');

    assert.deepEqual(globalThis.__actionSignals, ['publish']);
    assert.deepEqual(timers.map(timer => timer.delayMs), [25, 15]);

    timers[0].callback();
    timers[1].callback();

    assert.deepEqual(globalThis.__actionSignals, ['publish', 'header', 'publish']);

    element._htmlexRegistrationToken = Symbol('stale');
    timers[0].callback();

    assert.deepEqual(globalThis.__actionSignals, ['publish', 'header', 'publish']);
  } finally {
    cleanupHeader();
    cleanupPublish();
  }
});

test('handleAction ignores partial delayed signal timers', async () => {
  const timers = [];
  globalThis.setTimeout = (callback, delayMs) => {
    timers.push({ callback, delayMs });
    return timers.length - 1;
  };
  globalThis.__actionSignals = [];
  const { registerSignalListener } = await import('../../src/public/src/signals.js');
  const cleanupHeader = registerSignalListener('partialHeaderSignal', () => globalThis.__actionSignals.push('header'));
  const cleanupPublish = registerSignalListener('partialPublishSignal', () => globalThis.__actionSignals.push('publish'));

  try {
    installDocument();
    globalThis.fetch = async () => new Response('', {
      headers: {
        Emit: 'partialHeaderSignal; delay=25ms',
      },
    });
    const element = new FakeElement({
      attributes: {
        publish: 'partialPublishSignal',
        timer: '15ms',
      },
    });

    await handleAction(element, 'GET', '/partial-signals');

    assert.deepEqual(globalThis.__actionSignals, ['header', 'publish']);
    assert.deepEqual(timers, []);
  } finally {
    cleanupHeader();
    cleanupPublish();
  }
});

test('handleAction delayed signals fail closed when document containment throws', async () => {
  const timers = [];
  globalThis.setTimeout = (callback, delayMs) => {
    timers.push({ callback, delayMs });
    return timers.length - 1;
  };
  globalThis.__actionSignals = [];
  const { registerSignalListener } = await import('../../src/public/src/signals.js');
  const cleanupSignal = registerSignalListener('guardedSignal', () => globalThis.__actionSignals.push('signal'));

  try {
    installDocument();
    document.body.contains = () => {
      throw new Error('contains failed');
    };
    globalThis.fetch = async () => new Response('', {
      headers: {
        Emit: 'guardedSignal; delay=10',
      },
    });
    const element = new FakeElement();

    await handleAction(element, 'GET', '/guarded-signal');
    assert.equal(timers[0].delayMs, 10);
    assert.doesNotThrow(() => timers[0].callback());
    assert.deepEqual(globalThis.__actionSignals, []);
  } finally {
    cleanupSignal();
  }
});
