import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import {
  createHTMLeXElementClass,
  defineHTMLeXElement,
} from '../../src/public/src/htmlex.js';
import { Logger } from '../../src/public/src/logger.js';

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
  const observedAttributes = ElementClass.observedAttributes;
  observedAttributes.push('mutated-attribute');
  assert.equal(ElementClass.observedAttributes.includes('mutated-attribute'), false);

  element.disconnectedCallback();

  assert.equal(element.hasAttribute('data-htmlex-registered'), false);
  assert.equal(element.listeners.has('click'), false);
});

test('custom element adapter isolates hostile lifecycle and queued flag failures', async () => {
  const wasEnabled = Logger.enabled;
  Logger.enabled = false;
  try {
    const ElementClass = createHTMLeXElementClass(FakeHTMLElement);
    const tokenHostileElement = new ElementClass();
    tokenHostileElement.setAttribute('get', '/hostile-lifecycle');
    tokenHostileElement.isConnected = true;
    Object.defineProperty(tokenHostileElement, '_htmlexRegistrationToken', {
      configurable: true,
      set() {
        throw new Error('token denied');
      },
    });

    assert.doesNotThrow(() => tokenHostileElement.connectedCallback());
    assert.doesNotThrow(() => tokenHostileElement.disconnectedCallback());

    const queueHostileElement = new ElementClass();
    queueHostileElement.isConnected = true;
    Object.defineProperty(queueHostileElement, '_htmlexAdapterRegistrationQueued', {
      configurable: true,
      get() {
        throw new Error('queued read denied');
      },
      set() {
        throw new Error('queued write denied');
      },
    });

    assert.doesNotThrow(() => queueHostileElement.attributeChangedCallback());
    await new Promise(resolve => queueMicrotask(resolve));
  } finally {
    Logger.enabled = wasEnabled;
  }
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

test('custom element adapter falls back when microtasks or HTMLElement are unavailable', () => {
  const originalQueueMicrotask = globalThis.queueMicrotask;
  const originalSetTimeout = globalThis.setTimeout;
  const callbacks = [];
  delete globalThis.queueMicrotask;
  delete globalThis.HTMLElement;
  globalThis.setTimeout = (callback) => {
    callbacks.push(callback);
    return callbacks.length;
  };

  try {
    const FallbackElementClass = createHTMLeXElementClass();
    const fallbackElement = new FallbackElementClass();
    assert.equal(fallbackElement instanceof FallbackElementClass, true);
    assert.equal(FallbackElementClass.observedAttributes.includes('get'), true);

    const ElementClass = createHTMLeXElementClass(FakeHTMLElement);
    const element = new ElementClass();
    element.setAttribute('get', '/queued-adapter');
    element.isConnected = true;

    element.attributeChangedCallback();

    assert.equal(element._htmlexAdapterRegistrationQueued, true);
    assert.equal(callbacks.length, 1);

    callbacks[0]();

    assert.equal(element._htmlexAdapterRegistrationQueued, false);
    assert.equal(element.getAttribute('data-htmlex-registered'), 'true');
  } finally {
    if (originalQueueMicrotask === undefined) {
      delete globalThis.queueMicrotask;
    } else {
      globalThis.queueMicrotask = originalQueueMicrotask;
    }
    globalThis.setTimeout = originalSetTimeout;
    globalThis.HTMLElement = FakeHTMLElement;
  }
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

test('defineHTMLeXElement normalizes options and reports invalid registries', () => {
  const ElementClass = defineHTMLeXElement('x-htmlex-null-options', null);
  assert.equal(globalThis.customElements.get('x-htmlex-null-options'), ElementClass);

  globalThis.customElements = {};
  assert.throws(
    () => defineHTMLeXElement('x-invalid-registry'),
    /customElements is not available/
  );

  globalThis.customElements = {
    get() {
      throw new Error('invalid name');
    },
    define() {},
  };
  assert.throws(
    () => defineHTMLeXElement('bad-name'),
    /Invalid custom element name/
  );
});

test('defineHTMLeXElement reports unavailable custom element registries', () => {
  delete globalThis.customElements;

  assert.throws(
    () => defineHTMLeXElement('x-missing-registry'),
    /customElements is not available/
  );
});

test('defineHTMLeXElement safely reports hostile registries and names', () => {
  Object.defineProperty(globalThis, 'customElements', {
    configurable: true,
    get() {
      throw new Error('registry denied');
    },
  });
  assert.throws(
    () => defineHTMLeXElement('x-hostile-registry'),
    /customElements is not available/
  );

  Object.defineProperty(globalThis, 'customElements', {
    configurable: true,
    writable: true,
    value: {
      get() {
        throw new Error('name denied');
      },
      define() {},
    },
  });
  assert.throws(
    () => defineHTMLeXElement({
      toString() {
        throw new Error('string denied');
      },
    }),
    /Invalid custom element name "\[Unstringifiable\]"/
  );

  globalThis.customElements = {
    get() {
      return null;
    },
    define() {
      throw new Error('define denied');
    },
  };
  assert.throws(
    () => defineHTMLeXElement('x-define-denied', { baseClass: FakeHTMLElement }),
    /Unable to define custom element "x-define-denied"/
  );
  assert.throws(
    () => defineHTMLeXElement(null, { baseClass: FakeHTMLElement }),
    /Unable to define custom element "\[Unstringifiable\]"/
  );
});
