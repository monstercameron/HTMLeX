import assert from 'node:assert/strict';
import test from 'node:test';
import {
  setupChatNamespace,
  setupCounterNamespace,
  setupSocketNamespaces,
  setupUpdatesNamespace,
} from '../../src/features/socket.js';

process.env.HTMLEX_LOG_LEVEL = 'silent';

class FakeNamespace {
  constructor(name) {
    this.name = name;
    this.emitted = [];
    this.handlers = new Map();
  }

  emit(eventName, payload) {
    this.emitted.push({ eventName, payload });
  }

  on(eventName, callback) {
    this.handlers.set(eventName, callback);
  }
}

class FakeSocket {
  constructor() {
    this.emitted = [];
    this.handlers = new Map();
    this.id = 'socket-1';
  }

  emit(eventName, payload) {
    this.emitted.push({ eventName, payload });
  }

  on(eventName, callback) {
    this.handlers.set(eventName, callback);
  }
}

class FakeSocketServer {
  constructor() {
    this.namespaces = new Map();
  }

  of(name) {
    if (!this.namespaces.has(name)) {
      this.namespaces.set(name, new FakeNamespace(name));
    }
    return this.namespaces.get(name);
  }
}

test('setupChatNamespace sends history and broadcasts normalized messages', () => {
  const server = new FakeSocketServer();
  setupChatNamespace(server, () => [{ username: 'Ada', text: 'Existing' }]);
  const namespace = server.of('/chat');
  const socket = new FakeSocket();

  namespace.handlers.get('connection')(socket);

  assert.deepEqual(socket.emitted, [{
    eventName: 'chatHistory',
    payload: {
      history: [{ username: 'Ada', text: 'Existing' }]
    }
  }]);

  socket.handlers.get('chatMessage')({
    username: ` ${'u'.repeat(60)} `,
    text: ` ${'hello '.repeat(200)} `
  });

  assert.equal(namespace.emitted.length, 1);
  assert.equal(namespace.emitted[0].eventName, 'chatMessage');
  assert.equal(namespace.emitted[0].payload.username, 'u'.repeat(50));
  assert.equal(namespace.emitted[0].payload.text.length, 1000);

  socket.handlers.get('chatMessage')({ username: 'Ada', text: '   ' });
  assert.equal(namespace.emitted.length, 1);
});

test('setupSocketNamespaces registers all expected namespaces', () => {
  const server = new FakeSocketServer();

  setupSocketNamespaces(server, () => []);

  assert.deepEqual([...server.namespaces.keys()].sort(), ['/chat', '/counter', '/updates']);
  assert.equal(typeof server.of('/counter').handlers.get('connection'), 'function');
  assert.equal(typeof server.of('/chat').handlers.get('connection'), 'function');
  assert.equal(typeof server.of('/updates').handlers.get('connection'), 'function');
});

test('counter namespace emits increments and clears its interval on disconnect', () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalFastMode = process.env.HTMLEX_TEST_FAST;
  const intervals = [];
  globalThis.setInterval = (callback, intervalMs) => {
    intervals.push({ callback, intervalMs, cleared: false });
    return intervals.length - 1;
  };
  globalThis.clearInterval = (intervalId) => {
    intervals[intervalId].cleared = true;
  };
  process.env.HTMLEX_TEST_FAST = '1';

  try {
    const server = new FakeSocketServer();
    setupCounterNamespace(server);
    const socket = new FakeSocket();
    server.of('/counter').handlers.get('connection')(socket);

    assert.equal(intervals[0].intervalMs, 25);

    intervals[0].callback();
    intervals[0].callback();

    assert.deepEqual(socket.emitted, [
      { eventName: 'counter', payload: 1 },
      { eventName: 'counter', payload: 2 },
    ]);

    socket.handlers.get('disconnect')();
    assert.equal(intervals[0].cleared, true);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    if (originalFastMode === undefined) {
      delete process.env.HTMLEX_TEST_FAST;
    } else {
      process.env.HTMLEX_TEST_FAST = originalFastMode;
    }
  }
});

test('updates namespace emits live-update HTML and clears its interval on disconnect', () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalFastMode = process.env.HTMLEX_TEST_FAST;
  const intervals = [];
  globalThis.setInterval = (callback, intervalMs) => {
    intervals.push({ callback, intervalMs, cleared: false });
    return intervals.length - 1;
  };
  globalThis.clearInterval = (intervalId) => {
    intervals[intervalId].cleared = true;
  };
  delete process.env.HTMLEX_TEST_FAST;

  try {
    const server = new FakeSocketServer();
    setupUpdatesNamespace(server);
    const socket = new FakeSocket();
    server.of('/updates').handlers.get('connection')(socket);

    assert.equal(intervals[0].intervalMs, 3000);

    intervals[0].callback();

    assert.equal(socket.emitted[0].eventName, 'update');
    assert.match(socket.emitted[0].payload, /Live update at/);

    socket.handlers.get('disconnect')();
    assert.equal(intervals[0].cleared, true);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    if (originalFastMode === undefined) {
      delete process.env.HTMLEX_TEST_FAST;
    } else {
      process.env.HTMLEX_TEST_FAST = originalFastMode;
    }
  }
});
