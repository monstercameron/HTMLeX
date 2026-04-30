import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { processFragmentBuffer } from '../../src/public/src/fragments.js';
import { Logger } from '../../src/public/src/logger.js';

let originalCustomEvent;
let originalDocument;
let originalLoggerEnabled;

beforeEach(() => {
  originalCustomEvent = globalThis.CustomEvent;
  originalDocument = globalThis.document;
  originalLoggerEnabled = Logger.enabled;
  Logger.enabled = false;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.document = {
    dispatchedEvents: [],
    body: {
      contains() {
        return true;
      },
    },
    createElement(tagName) {
      assert.equal(tagName, 'template');
      return {
        content: {},
        set innerHTML(html) {
          const targetMatch = html.match(/\starget="([^"]+)"/i);
          this.content.firstElementChild = {
            getAttribute(name) {
              return name === 'target' ? targetMatch?.[1] || null : null;
            },
          };
        },
      };
    },
    dispatchEvent(event) {
      this.dispatchedEvents.push(event);
    },
  };
});

afterEach(() => {
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

  Logger.enabled = originalLoggerEnabled;
});

class FakeElement {
  constructor(attributes = {}) {
    this.attributes = { ...attributes };
    this.innerHTML = '';
    this.appended = [];
  }

  hasAttribute(name) {
    return Object.hasOwn(this.attributes, name);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  insertAdjacentHTML(position, content) {
    this.appended.push({ position, content });
    if (position === 'beforeend') {
      this.innerHTML += content;
    }
  }
}

test('processFragmentBuffer defaults missing targets to this and appends later default fragments', () => {
  const element = new FakeElement();
  const remaining = processFragmentBuffer(
    '<fragment><span GET="/unit">First</span></fragment>' +
    '<fragment target="this(innerHTML)"><span>Second</span></fragment>' +
    'tail',
    element
  );

  assert.equal(remaining, 'tail');
  assert.equal(element._htmlexFragmentsProcessed, true);
  assert.equal(
    element.innerHTML,
    '<span GET="/unit">First</span><span>Second</span>'
  );
  assert.equal(document.dispatchedEvents.length, 1);
  assert.equal(document.dispatchedEvents[0].type, 'htmlex:dom-updated');
  assert.equal(document.dispatchedEvents[0].detail.root, element);
});

test('processFragmentBuffer lets caller targets override this fragments', () => {
  const element = new FakeElement({ target: 'this(innerHTML)' });
  const remaining = processFragmentBuffer(
    '<fragment target="this(innerHTML)"><strong>Override</strong></fragment>',
    element
  );

  assert.equal(remaining, '');
  assert.equal(element.innerHTML, '<strong>Override</strong>');
});

test('processFragmentBuffer updates each resolved selector target exactly once', () => {
  const first = new FakeElement();
  const second = new FakeElement();
  document.querySelectorAll = selector => selector === '.item' ? [first, second] : [];

  processFragmentBuffer(
    '<fragment target=".item(append)"><span>Resolved</span></fragment>',
    new FakeElement()
  );

  assert.deepEqual(first.appended, [{ position: 'beforeend', content: '<span>Resolved</span>' }]);
  assert.deepEqual(second.appended, [{ position: 'beforeend', content: '<span>Resolved</span>' }]);
});

test('processFragmentBuffer falls back missing explicit targets to the triggering element', () => {
  const element = new FakeElement();
  document.querySelectorAll = () => [];

  processFragmentBuffer(
    '<fragment target="#missing(append)"><span>Fallback</span></fragment>',
    element
  );

  assert.deepEqual(element.appended, [{ position: 'beforeend', content: '<span>Fallback</span>' }]);
});

test('processFragmentBuffer applies streaming fragments immediately through resolved targets', () => {
  const output = new FakeElement();
  const triggeringElement = new FakeElement();
  triggeringElement._htmlexStreaming = true;
  const afterUpdateCalls = [];
  const swapLifecycle = {
    createUpdateCallback() {
      return () => afterUpdateCalls.push('after');
    },
  };
  document.querySelectorAll = selector => selector === '#streamOut' ? [output] : [];

  processFragmentBuffer(
    '<fragment target="#streamOut(append)"><span GET="/next">Stream</span></fragment>',
    triggeringElement,
    null,
    swapLifecycle
  );

  assert.deepEqual(output.appended, [{ position: 'beforeend', content: '<span GET="/next">Stream</span>' }]);
  assert.deepEqual(afterUpdateCalls, ['after']);
  assert.equal(document.dispatchedEvents.at(-1).type, 'htmlex:dom-updated');
});

test('processFragmentBuffer queues sequential updates without mutating immediately', () => {
  const element = new FakeElement();
  element._htmlexSequentialMode = true;
  const sequentialEntry = {};
  const afterUpdateCalls = [];
  const swapLifecycle = {
    createUpdateCallback() {
      return () => afterUpdateCalls.push('after');
    },
  };

  processFragmentBuffer(
    '<fragment target="this(innerHTML)"><em>Queued</em></fragment>',
    element,
    sequentialEntry,
    swapLifecycle
  );

  assert.equal(element.innerHTML, '');
  assert.equal(sequentialEntry.updates.length, 1);

  sequentialEntry.updates[0]();

  assert.equal(element.innerHTML, '<em>Queued</em>');
  assert.deepEqual(afterUpdateCalls, ['after']);
});
