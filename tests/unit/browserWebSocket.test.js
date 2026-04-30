import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { Logger } from '../../src/public/src/logger.js';
import { handleWebSocket } from '../../src/public/src/websocket.js';

let originalDocument;
let originalElement;
let originalIo;
let originalMutationObserver;
let originalRequestAnimationFrame;
let originalLoggerEnabled;

beforeEach(() => {
  originalDocument = globalThis.document;
  originalElement = globalThis.Element;
  originalIo = globalThis.io;
  originalMutationObserver = globalThis.MutationObserver;
  originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  originalLoggerEnabled = Logger.enabled;
  Logger.enabled = false;
});

afterEach(() => {
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

  Logger.enabled = originalLoggerEnabled;
});

class FakeElement {
  constructor(attributes = {}) {
    this.nodeType = 1;
    this.attributes = { ...attributes };
    this.inserted = [];
    this.connected = true;
  }

  hasAttribute(name) {
    return Object.hasOwn(this.attributes, name);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  insertAdjacentHTML(position, content) {
    this.inserted.push({ position, content });
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

function installSocketHarness({ targetElement = new FakeElement() } = {}) {
  FakeMutationObserver.instances = [];
  globalThis.Element = FakeElement;
  globalThis.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  globalThis.document = {
    body: {
      contains(element) {
        return element.connected;
      },
    },
    querySelectorAll(selector) {
      return selector === '#feed' ? [targetElement] : [];
    },
  };
  globalThis.MutationObserver = FakeMutationObserver;

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
    },
  };
  const ioCalls = [];
  globalThis.io = (socketUrl, options) => {
    ioCalls.push({ socketUrl, options });
    return socket;
  };

  return { ioCalls, socket, targetElement };
}

test('handleWebSocket ignores invalid setup inputs before opening sockets', () => {
  let ioCallCount = 0;
  globalThis.Element = FakeElement;
  globalThis.io = () => {
    ioCallCount += 1;
    return {};
  };

  handleWebSocket(new FakeElement(), '');
  handleWebSocket(new FakeElement(), '   ');
  handleWebSocket({}, '/updates');

  assert.equal(ioCallCount, 0);
});

test('handleWebSocket exits cleanly when the Socket.IO client is missing', () => {
  globalThis.Element = FakeElement;
  delete globalThis.io;

  const element = new FakeElement({ target: '#feed(append)' });

  handleWebSocket(element, '/updates');

  assert.equal(element._htmlexSocket, undefined);
});

test('handleWebSocket disconnects invalid sockets returned by the client', () => {
  globalThis.Element = FakeElement;
  const socket = {
    disconnected: false,
    disconnect() {
      this.disconnected = true;
    },
  };
  globalThis.io = () => socket;

  const element = new FakeElement({ target: '#feed(append)' });

  assert.doesNotThrow(() => handleWebSocket(element, '/updates'));

  assert.equal(socket.disconnected, true);
  assert.equal(element._htmlexSocket, undefined);
});

test('handleWebSocket disconnects when socket handler registration fails', () => {
  globalThis.Element = FakeElement;
  const socket = {
    disconnected: false,
    on() {
      throw new Error('handler denied');
    },
    onAny() {},
    disconnect() {
      this.disconnected = true;
    },
  };
  globalThis.io = () => socket;

  const element = new FakeElement({ target: '#feed(append)' });

  assert.doesNotThrow(() => handleWebSocket(element, '/updates'));

  assert.equal(socket.disconnected, true);
  assert.equal(element._htmlexSocket, undefined);
});

test('handleWebSocket tolerates non-constructor Element globals and missing MutationObserver', () => {
  globalThis.Element = {};
  delete globalThis.MutationObserver;
  const socket = {
    handlers: new Map(),
    on(eventName, callback) {
      this.handlers.set(eventName, callback);
    },
    onAny(callback) {
      this.anyHandler = callback;
    },
    disconnect() {},
  };
  const ioCalls = [];
  globalThis.io = (socketUrl, options) => {
    ioCalls.push({ socketUrl, options });
    return socket;
  };
  globalThis.document = {
    body: {
      contains() {
        return true;
      },
    },
    querySelectorAll() {
      return [];
    },
  };
  const element = new FakeElement({ target: '#feed(append)' });

  assert.doesNotThrow(() => handleWebSocket(element, '/updates'));

  assert.equal(element._htmlexSocket, socket);
  assert.equal(element._htmlexSocketObserver, undefined);
  assert.deepEqual(ioCalls, [{
    socketUrl: '/updates',
    options: { transports: ['websocket'] },
  }]);
});

test('handleWebSocket normalizes chat, history, string, and object payloads safely', () => {
  const { socket, targetElement } = installSocketHarness();
  const element = new FakeElement({ target: '#feed(append)' });

  handleWebSocket(element, '/chat');

  socket.anyHandler('chatMessage', {
    username: '<Ada>',
    text: '<hello>&"',
  });
  socket.anyHandler('chatHistory', { history: [] });
  socket.anyHandler('update', '<div>Live</div>');
  socket.anyHandler('custom', { html: '<script>' });

  const insertedHtml = targetElement.inserted.map(entry => entry.content).join('\n');
  assert.match(insertedHtml, /&lt;Ada&gt;/);
  assert.match(insertedHtml, /&lt;hello&gt;&amp;&quot;/);
  assert.match(insertedHtml, /Waiting for messages/);
  assert.match(insertedHtml, /<div>Live<\/div>/);
  assert.match(insertedHtml, /\{&quot;html&quot;:&quot;&lt;script&gt;&quot;\}/);
  assert.doesNotMatch(insertedHtml, /<script>/);
});

test('handleWebSocket tolerates hostile payloads and target attributes', () => {
  const { socket, targetElement } = installSocketHarness();
  const element = new FakeElement({ target: '#feed(append)' });

  handleWebSocket(element, '/chat');

  assert.doesNotThrow(() => socket.anyHandler('chatMessage', {
    get username() {
      throw new Error('username denied');
    },
    get text() {
      return {
        toString() {
          throw new Error('text denied');
        },
      };
    },
  }));

  element.hasAttribute = () => {
    throw new Error('target check denied');
  };

  assert.doesNotThrow(() => socket.anyHandler('update', {
    toJSON() {
      throw new Error('json denied');
    },
    toString() {
      throw new Error('string denied');
    },
  }));

  const insertedHtml = targetElement.inserted.map(entry => entry.content).join('\n');
  assert.match(insertedHtml, /Anonymous/);
});

test('handleWebSocket tolerates observer setup and cleanup failures', () => {
  const { socket } = installSocketHarness();
  const element = new FakeElement({ target: '#feed(append)' });
  class ThrowingMutationObserver {
    observe() {
      throw new Error('observe denied');
    }

    disconnect() {
      throw new Error('disconnect denied');
    }
  }
  globalThis.MutationObserver = ThrowingMutationObserver;

  assert.doesNotThrow(() => handleWebSocket(element, '/updates'));

  assert.equal(element._htmlexSocket, socket);
  assert.equal(element._htmlexSocketObserver, undefined);
});

test('handleWebSocket logs socket events and disconnects removed targets', () => {
  const { ioCalls, socket } = installSocketHarness();
  const element = new FakeElement({ target: '#feed(append)' });

  handleWebSocket(element, ' /updates ');

  assert.deepEqual(ioCalls, [{
    socketUrl: '/updates',
    options: { transports: ['websocket'] },
  }]);
  assert.equal(element._htmlexSocket, socket);
  assert.equal(typeof socket.handlers.get('connect'), 'function');
  assert.equal(typeof socket.handlers.get('error'), 'function');
  assert.equal(typeof socket.handlers.get('disconnect'), 'function');

  element.connected = false;
  socket.anyHandler('update', '<div>ignored</div>');

  assert.equal(socket.disconnected, true);

  FakeMutationObserver.instances[0].callback();
  assert.equal(element._htmlexSocket, undefined);
  assert.equal(FakeMutationObserver.instances[0].disconnected, true);
});

test('handleWebSocket isolates disconnect failures for removed elements', () => {
  const { socket } = installSocketHarness();
  const element = new FakeElement({ target: '#feed(append)' });
  socket.disconnect = () => {
    throw new Error('disconnect denied');
  };

  handleWebSocket(element, '/updates');

  element.connected = false;
  assert.doesNotThrow(() => socket.anyHandler('update', '<div>ignored</div>'));
  assert.doesNotThrow(() => FakeMutationObserver.instances[0].callback());
  assert.equal(element._htmlexSocket, undefined);
});
