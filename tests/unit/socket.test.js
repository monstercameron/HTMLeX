import assert from 'node:assert/strict';
import test from 'node:test';
import { setupChatNamespace, setupSocketNamespaces } from '../../src/features/socket.js';

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
