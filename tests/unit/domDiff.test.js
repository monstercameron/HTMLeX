import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import {
  diffAndUpdate,
  diffChildren,
  performInnerHTMLUpdate,
} from '../../src/public/src/dom.js';
import { Logger } from '../../src/public/src/logger.js';

let originalDocument;
let originalNode;
let originalLoggerEnabled;

beforeEach(() => {
  originalDocument = globalThis.document;
  originalNode = globalThis.Node;
  originalLoggerEnabled = Logger.enabled;
  Logger.enabled = false;
  globalThis.Node = {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3,
  };
});

afterEach(() => {
  if (originalDocument === undefined) {
    delete globalThis.document;
  } else {
    globalThis.document = originalDocument;
  }

  if (originalNode === undefined) {
    delete globalThis.Node;
  } else {
    globalThis.Node = originalNode;
  }

  Logger.enabled = originalLoggerEnabled;
});

class FakeTextNode {
  constructor(text) {
    this.nodeType = Node.TEXT_NODE;
    this.nodeName = '#text';
    this.textContent = text;
  }

  cloneNode() {
    return new FakeTextNode(this.textContent);
  }

  replaceWith(node) {
    this.replacedWith = node;
    if (!this.parentElement) return;

    const index = this.parentElement.childNodes.indexOf(this);
    if (index >= 0) {
      this.parentElement.childNodes.splice(index, 1, node);
      node.parentElement = this.parentElement;
    }
  }

  remove() {
    this.removed = true;
    if (this.parentElement) {
      this.parentElement.childNodes = this.parentElement.childNodes.filter(child => child !== this);
    }
  }
}

class FakeElementNode {
  constructor(nodeName, attributes = {}, children = []) {
    this.nodeType = Node.ELEMENT_NODE;
    this.nodeName = nodeName.toUpperCase();
    this.tagName = this.nodeName;
    this.attributeMap = { ...attributes };
    this.childNodes = children;
    this.inserted = [];
    for (const child of this.childNodes) {
      child.parentElement = this;
    }
  }

  get attributes() {
    return Object.entries(this.attributeMap).map(([name, value]) => ({ name, value }));
  }

  get innerHTML() {
    return this.childNodes.map(child => {
      if (child.nodeType === Node.TEXT_NODE) return child.textContent;
      return child.outerHTML;
    }).join('');
  }

  set innerHTML(value) {
    this.childNodes = [new FakeTextNode(value)];
    this.childNodes[0].parentElement = this;
  }

  get outerHTML() {
    const attrs = Object.entries(this.attributeMap)
      .map(([name, value]) => ` ${name}="${value}"`)
      .join('');
    return `<${this.nodeName.toLowerCase()}${attrs}>${this.innerHTML}</${this.nodeName.toLowerCase()}>`;
  }

  hasAttribute(name) {
    return Object.hasOwn(this.attributeMap, name);
  }

  getAttribute(name) {
    return this.attributeMap[name] ?? null;
  }

  setAttribute(name, value) {
    this.attributeMap[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributeMap[name];
  }

  appendChild(child) {
    const appended = child.cloneNode(true);
    appended.parentElement = this;
    this.childNodes.push(appended);
    return appended;
  }

  insertBefore(child, referenceNode = null) {
    const currentIndex = this.childNodes.indexOf(child);
    if (currentIndex >= 0) {
      this.childNodes.splice(currentIndex, 1);
    }
    const nextIndex = referenceNode ? this.childNodes.indexOf(referenceNode) : this.childNodes.length;
    const insertedIndex = nextIndex >= 0 ? nextIndex : this.childNodes.length;
    this.childNodes.splice(insertedIndex, 0, child);
    child.parentElement = this;
    return child;
  }

  cloneNode(deep = false) {
    return new FakeElementNode(
      this.nodeName,
      { ...this.attributeMap },
      deep ? this.childNodes.map(child => child.cloneNode(true)) : []
    );
  }

  replaceWith(node) {
    this.replacedWith = node;
    if (!this.parentElement) return;

    const index = this.parentElement.childNodes.indexOf(this);
    if (index >= 0) {
      this.parentElement.childNodes.splice(index, 1, node);
      node.parentElement = this.parentElement;
    }
  }

  remove() {
    this.removed = true;
    if (this.parentElement) {
      this.parentElement.childNodes = this.parentElement.childNodes.filter(child => child !== this);
    }
  }
}

function createFragment(children) {
  return { childNodes: children };
}

test('diffAndUpdate synchronizes attributes, text, and child lists', () => {
  const existing = new FakeElementNode('div', { class: 'old', stale: 'remove' }, [
    new FakeTextNode('Old'),
  ]);
  const next = new FakeElementNode('div', { class: 'new', id: 'card' }, [
    new FakeTextNode('New'),
    new FakeElementNode('span', { title: 'child' }, [new FakeTextNode('Child')]),
  ]);

  diffAndUpdate(existing, next);

  assert.equal(existing.getAttribute('class'), 'new');
  assert.equal(existing.getAttribute('id'), 'card');
  assert.equal(existing.hasAttribute('stale'), false);
  assert.equal(existing.childNodes[0].textContent, 'New');
  assert.equal(existing.childNodes[1].outerHTML, '<span title="child">Child</span>');
});

test('diffAndUpdate replaces nodes when type or HTMLeX behavior changes', () => {
  const textNode = new FakeTextNode('Plain');
  const elementNode = new FakeElementNode('div', {}, []);

  diffAndUpdate(textNode, elementNode);
  assert.equal(textNode.replacedWith?.nodeName, 'DIV');

  const existing = new FakeElementNode('button', { get: '/old' }, []);
  const next = new FakeElementNode('button', { get: '/new' }, []);

  diffAndUpdate(existing, next);

  assert.equal(existing.replacedWith.getAttribute('get'), '/new');
});

test('diffChildren removes extra nodes and appends missing clones', () => {
  const existing = new FakeElementNode('div', {}, [
    new FakeTextNode('keep'),
    new FakeTextNode('remove'),
  ]);
  const next = createFragment([
    new FakeTextNode('keep'),
    new FakeElementNode('strong', {}, [new FakeTextNode('add')]),
  ]);

  diffChildren(existing, next);

  assert.equal(existing.childNodes.length, 2);
  assert.equal(existing.childNodes[0].textContent, 'keep');
  assert.equal(existing.childNodes[1].outerHTML, '<strong>add</strong>');
});

test('diffChildren reorders keyed children without replacing live nodes', () => {
  const first = new FakeElementNode('li', { id: 'first' }, [new FakeTextNode('First')]);
  const second = new FakeElementNode('li', { id: 'second' }, [new FakeTextNode('Second')]);
  const existing = new FakeElementNode('ul', {}, [first, second]);
  const next = createFragment([
    new FakeElementNode('li', { id: 'second' }, [new FakeTextNode('Second updated')]),
    new FakeElementNode('li', { id: 'first' }, [new FakeTextNode('First updated')]),
  ]);

  diffChildren(existing, next);

  assert.equal(existing.childNodes[0], second);
  assert.equal(existing.childNodes[1], first);
  assert.equal(second.innerHTML, 'Second updated');
  assert.equal(first.innerHTML, 'First updated');
});

test('diffAndUpdate preserves focused input value and selection state', () => {
  const input = new FakeElementNode('input', { id: 'title', value: 'server-old' }, []);
  input.value = 'draft value';
  input.checked = true;
  input.selectionStart = 2;
  input.selectionEnd = 7;
  input.selectionDirection = 'forward';
  input.setSelectionRange = (start, end, direction) => {
    input.restoredSelection = { start, end, direction };
  };
  input.focus = (options) => {
    input.focusOptions = options;
  };
  globalThis.document = {
    activeElement: input,
  };

  diffAndUpdate(input, new FakeElementNode('input', { id: 'title', value: 'server-new' }, []));

  assert.equal(input.getAttribute('value'), 'server-new');
  assert.equal(input.value, 'draft value');
  assert.equal(input.checked, true);
  assert.deepEqual(input.restoredSelection, {
    start: 2,
    end: 7,
    direction: 'forward',
  });
  assert.deepEqual(input.focusOptions, { preventScroll: true });
});

test('performInnerHTMLUpdate skips identical content and diffs changed content', () => {
  const element = new FakeElementNode('div', {}, [new FakeTextNode('same')]);
  let rangeCreated = false;
  globalThis.document = {
    createRange() {
      rangeCreated = true;
      return {
        selectNodeContents(node) {
          this.node = node;
        },
        createContextualFragment(html) {
          return createFragment([new FakeTextNode(html)]);
        },
      };
    },
  };

  performInnerHTMLUpdate(element, 'same');
  assert.equal(rangeCreated, false);

  performInnerHTMLUpdate(element, 'changed');
  assert.equal(rangeCreated, true);
  assert.equal(element.innerHTML, 'changed');
});
