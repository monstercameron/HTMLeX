import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import {
  diffAndUpdate,
  diffChildren,
  performInnerHTMLUpdate,
  updateTarget,
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

test('diffAndUpdate applies server values to inactive controls', () => {
  const input = new FakeElementNode('input', { id: 'title', value: 'server-old' }, []);
  input.value = 'stale client value';
  input.checked = true;
  const nextInput = new FakeElementNode('input', { id: 'title', value: 'server-new' }, []);
  nextInput.value = 'server-new';
  nextInput.checked = false;
  globalThis.document = {
    activeElement: null,
  };

  diffAndUpdate(input, nextInput);

  assert.equal(input.getAttribute('value'), 'server-new');
  assert.equal(input.value, 'server-new');
  assert.equal(input.checked, false);
});

test('diffAndUpdate tolerates hostile node mutation and attribute APIs', () => {
  const hostileAttributeValue = {
    toString() {
      throw new Error('attribute string denied');
    },
  };
  const existingBehaviorElement = new FakeElementNode('button', { get: hostileAttributeValue }, []);
  const nextBehaviorElement = new FakeElementNode('button', { get: '/safe' }, []);

  assert.doesNotThrow(() => diffAndUpdate(existingBehaviorElement, nextBehaviorElement));

  const keyedParent = new FakeElementNode('div', {}, []);
  const keyedNext = new FakeElementNode('div', {}, [
    new FakeElementNode('span', { id: hostileAttributeValue }, []),
  ]);

  assert.doesNotThrow(() => diffChildren(keyedParent, keyedNext));

  const throwingReplacement = {
    nodeType: Node.ELEMENT_NODE,
    nodeName: 'SECTION',
    cloneNode() {
      throw new Error('clone denied');
    },
  };
  const existingDifferentType = {
    nodeType: Node.TEXT_NODE,
    nodeName: '#text',
    replaceWith() {
      throw new Error('replace denied');
    },
  };

  assert.doesNotThrow(() => diffAndUpdate(existingDifferentType, throwingReplacement));

  const existingElement = new FakeElementNode('div', { stale: 'yes' }, []);
  Object.defineProperty(existingElement, 'attributes', {
    get() {
      throw new Error('attributes denied');
    },
  });
  Object.defineProperty(existingElement, 'childNodes', {
    get() {
      throw new Error('children denied');
    },
  });

  assert.doesNotThrow(() => diffAndUpdate(existingElement, new FakeElementNode('div', { id: 'safe' }, [])));

  const existingText = new FakeTextNode('old');
  Object.defineProperty(existingText, 'textContent', {
    get() {
      return 'old';
    },
    set() {
      throw new Error('text mutation denied');
    },
  });

  assert.doesNotThrow(() => diffAndUpdate(existingText, new FakeTextNode('new')));
});

test('diffAndUpdate tolerates control restoration failures', () => {
  const input = new FakeElementNode('input', { id: 'title', value: 'server-old' }, []);
  input.value = 'draft value';
  input.checked = true;
  input.selectionStart = 2;
  input.selectionEnd = 7;
  input.selectionDirection = 'forward';
  input.setSelectionRange = () => {
    throw new Error('selection denied');
  };
  input.focus = () => {
    throw new Error('focus denied');
  };
  globalThis.document = {
    activeElement: input,
  };

  assert.doesNotThrow(() => {
    diffAndUpdate(input, new FakeElementNode('input', { id: 'title', value: 'server-new' }, []));
  });

  const select = new FakeElementNode('select', {}, []);
  const hostileOption = {};
  Object.defineProperty(hostileOption, 'value', {
    get() {
      throw new Error('option value denied');
    },
  });
  Object.defineProperty(hostileOption, 'selected', {
    get() {
      throw new Error('option selected denied');
    },
    set() {
      throw new Error('option selected mutation denied');
    },
  });
  select.options = [hostileOption];
  globalThis.document = {
    activeElement: select,
  };

  assert.doesNotThrow(() => {
    diffAndUpdate(select, new FakeElementNode('select', {}, []));
  });
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

test('performInnerHTMLUpdate and updateTarget fail closed for hostile mutation APIs', () => {
  const hostileElement = {
    get innerHTML() {
      throw new Error('innerHTML read denied');
    },
    set innerHTML(_value) {
      throw new Error('innerHTML write denied');
    },
  };
  delete globalThis.document;

  assert.doesNotThrow(() => performInnerHTMLUpdate(hostileElement, {
    toString() {
      throw new Error('html string denied');
    },
  }));

  const target = {
    parentElement: { id: 'parent' },
    insertAdjacentHTML() {
      throw new Error('insert denied');
    },
    remove() {
      throw new Error('remove denied');
    },
    set outerHTML(_value) {
      throw new Error('outerHTML denied');
    },
  };
  globalThis.document = {
    body: { id: 'body' },
    querySelectorAll() {
      return [target];
    },
  };

  assert.doesNotThrow(() => updateTarget({ selector: '#target', strategy: 'append' }, '<b>append</b>'));
  assert.doesNotThrow(() => updateTarget({ selector: '#target', strategy: 'before' }, '<b>before</b>'));
  assert.doesNotThrow(() => updateTarget({ selector: '#target', strategy: 'remove' }, ''));
  assert.doesNotThrow(() => updateTarget({ selector: '#target', strategy: 'outerHTML' }, '<section></section>'));
  assert.doesNotThrow(() => updateTarget({ selector: '#target', strategy: 'unknown' }, '<p>fallback</p>'));

  const hostileInstruction = {};
  Object.defineProperty(hostileInstruction, 'selector', {
    get() {
      throw new Error('target selector denied');
    },
  });
  Object.defineProperty(hostileInstruction, 'strategy', {
    get() {
      throw new Error('target strategy denied');
    },
  });
  const hostileOptions = {};
  Object.defineProperty(hostileOptions, 'forceResolvedElement', {
    get() {
      throw new Error('force resolved denied');
    },
  });

  assert.doesNotThrow(() => updateTarget(hostileInstruction, {
    toString() {
      throw new Error('content string denied');
    },
  }, target, hostileOptions));
});

test('performInnerHTMLUpdate preserves intentional surrounding whitespace', () => {
  const element = new FakeElementNode('div', {}, [new FakeTextNode('same')]);
  globalThis.document = {
    createRange() {
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

  performInnerHTMLUpdate(element, '  padded  ');

  assert.equal(element.innerHTML, '  padded  ');
});
