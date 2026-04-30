import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import {
  createHTMLeXElementClass,
  defineHTMLeXElement,
} from '../../src/public/src/htmlex.js';

let originalCustomElements;
let originalDocument;
let originalElement;
let originalHTMLElement;
let originalNode;

beforeEach(() => {
  originalCustomElements = globalThis.customElements;
  originalDocument = globalThis.document;
  originalElement = globalThis.Element;
  originalHTMLElement = globalThis.HTMLElement;
  originalNode = globalThis.Node;

  globalThis.Node = { ELEMENT_NODE: 1 };
  globalThis.Element = FakeHTMLElement;
  globalThis.HTMLElement = FakeHTMLElement;
  globalThis.document = {
    body: {
      contains(element) {
        return element.isConnected;
      },
    },
    dispatchEvent() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  globalThis.customElements = {
    definitions: new Map(),
    define(name, ElementClass) {
      this.definitions.set(name, ElementClass);
    },
    get(name) {
      return this.definitions.get(name);
    },
  };
});

afterEach(() => {
  if (originalCustomElements === undefined) {
    delete globalThis.customElements;
  } else {
    globalThis.customElements = originalCustomElements;
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

  if (originalNode === undefined) {
    delete globalThis.Node;
  } else {
    globalThis.Node = originalNode;
  }
});

class FakeHTMLElement {
  constructor() {
    this.nodeType = Node.ELEMENT_NODE;
    this.tagName = 'HTMLEX-ELEMENT';
    this.attributes = {};
    this.listeners = new Map();
    this.isConnected = false;
  }

  addEventListener(eventName, callback) {
    this.listeners.set(eventName, callback);
  }

  removeEventListener(eventName, callback) {
    if (this.listeners.get(eventName) === callback) {
      this.listeners.delete(eventName);
    }
  }

  closest() {
    return null;
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

  matches(selector) {
    const selectors = selector.split(',').map(part => part.trim().toLowerCase());
    return selectors.some(selectorPart => (
      selectorPart.startsWith('[') &&
      selectorPart.endsWith(']') &&
      this.hasAttribute(selectorPart.slice(1, -1))
    ));
  }

  querySelectorAll() {
    return [];
  }
}

test('custom element adapter registers and unregisters HTMLeX behavior', () => {
  const ElementClass = createHTMLeXElementClass(FakeHTMLElement);
  const element = new ElementClass();
  element.setAttribute('get', '/adapter');
  element.setAttribute('target', '#out(append)');
  element.isConnected = true;

  element.connectedCallback();

  assert.equal(element.getAttribute('data-htmlex-registered'), 'true');
  assert.equal(typeof element.listeners.get('click'), 'function');
  assert.equal(ElementClass.observedAttributes.includes('retry-delay'), true);

  element.disconnectedCallback();

  assert.equal(element.hasAttribute('data-htmlex-registered'), false);
  assert.equal(element.listeners.has('click'), false);
});

test('custom element adapter re-registers connected attribute changes once per microtask', async () => {
  const ElementClass = createHTMLeXElementClass(FakeHTMLElement);
  const element = new ElementClass();
  element.setAttribute('get', '/adapter-one');
  element.isConnected = true;

  element.connectedCallback();
  element.setAttribute('get', '/adapter-two');
  element.attributeChangedCallback();
  element.attributeChangedCallback();

  assert.equal(element._htmlexAdapterRegistrationQueued, true);

  await new Promise(resolve => queueMicrotask(resolve));

  assert.equal(element._htmlexAdapterRegistrationQueued, false);
  assert.equal(element.getAttribute('data-htmlex-registered'), 'true');
  assert.equal(typeof element.listeners.get('click'), 'function');

  const disconnected = new ElementClass();
  disconnected.attributeChangedCallback();

  assert.equal(disconnected._htmlexAdapterRegistrationQueued, undefined);
});

test('custom element adapter exposes manual register and unregister methods', () => {
  const ElementClass = createHTMLeXElementClass(FakeHTMLElement);
  const element = new ElementClass();
  element.setAttribute('get', '/manual-adapter');
  element.isConnected = true;

  element.htmlexRegister();
  assert.equal(element.getAttribute('data-htmlex-registered'), 'true');

  element.htmlexUnregister();
  assert.equal(element.hasAttribute('data-htmlex-registered'), false);
});

test('defineHTMLeXElement defines once and returns existing custom element classes', () => {
  const ElementClass = defineHTMLeXElement('x-htmlex-unit', {
    baseClass: FakeHTMLElement,
  });
  const ExistingClass = defineHTMLeXElement('x-htmlex-unit', {
    baseClass: FakeHTMLElement,
  });

  assert.equal(globalThis.customElements.get('x-htmlex-unit'), ElementClass);
  assert.equal(ExistingClass, ElementClass);
});

test('defineHTMLeXElement reports unavailable custom element registries', () => {
  delete globalThis.customElements;

  assert.throws(
    () => defineHTMLeXElement('x-missing-registry'),
    /customElements is not available/
  );
});
