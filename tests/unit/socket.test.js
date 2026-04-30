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
  assert.match(namespace.emitted[0].payload.id, /^.+-socket-1-\d+$/);

  socket.handlers.get('chatMessage')({ username: 'Ada', text: '   ' });
  assert.equal(namespace.emitted.length, 1);
});

test('socket chat ids fall back when Date.now is unusable', () => {
  const originalDateNow = Date.now;
  const server = new FakeSocketServer();
  setupChatNamespace(server, () => []);
  const namespace = server.of('/chat');
  const socket = new FakeSocket();
  namespace.handlers.get('connection')(socket);
  Date.now = () => Infinity;

  try {
    socket.handlers.get('chatMessage')({ username: 'Ada', text: 'Hello' });
    assert.match(namespace.emitted[0].payload.id, /^0-socket-1-\d+$/u);
  } finally {
    Date.now = originalDateNow;
  }
});

test('setupChatNamespace persists direct socket messages into later connection history', () => {
  const server = new FakeSocketServer();
  const history = [];
  setupChatNamespace(
    server,
    () => history,
    (message) => {
      const chatMessage = {
        id: history.length + 1,
        username: message.username,
        text: message.text
      };
      history.push(chatMessage);
      return chatMessage;
    }
  );
  const namespace = server.of('/chat');
  const firstSocket = new FakeSocket();
  const secondSocket = new FakeSocket();

  namespace.handlers.get('connection')(firstSocket);
  firstSocket.handlers.get('chatMessage')({ username: ' Ada ', text: ' Hello ' });
  namespace.handlers.get('connection')(secondSocket);

  assert.deepEqual(namespace.emitted, [{
    eventName: 'chatMessage',
    payload: {
      id: 1,
      username: 'Ada',
      text: 'Hello'
    }
  }]);
  assert.deepEqual(secondSocket.emitted, [{
    eventName: 'chatHistory',
    payload: {
      history: [{
        id: 1,
        username: 'Ada',
        text: 'Hello'
      }]
    }
  }]);
});

test('setupChatNamespace falls back when history loading or broadcast emits fail', () => {
  class ThrowingNamespace extends FakeNamespace {
    emit(eventName, payload) {
      super.emit(eventName, payload);
      throw new Error('broadcast failed');
    }
  }
  class ThrowingServer extends FakeSocketServer {
    of(name) {
      if (!this.namespaces.has(name)) {
        this.namespaces.set(name, new ThrowingNamespace(name));
      }
      return this.namespaces.get(name);
    }
  }

  const server = new ThrowingServer();
  setupChatNamespace(
    server,
    () => {
      throw new Error('history unavailable');
    },
    message => ({ id: 1, ...message })
  );
  const namespace = server.of('/chat');
  const socket = new FakeSocket();

  assert.doesNotThrow(() => namespace.handlers.get('connection')(socket));
  assert.deepEqual(socket.emitted, [{
    eventName: 'chatHistory',
    payload: { history: [] }
  }]);

  assert.doesNotThrow(() => socket.handlers.get('chatMessage')({ username: 'Ada', text: 'Hello' }));
  assert.deepEqual(namespace.emitted, [{
    eventName: 'chatMessage',
    payload: {
      id: 1,
      username: 'Ada',
      text: 'Hello'
    }
  }]);
});

test('setupChatNamespace defers socket message storage until broadcast succeeds', () => {
  class ThrowingNamespace extends FakeNamespace {
    emit(eventName, payload) {
      super.emit(eventName, payload);
      throw new Error('broadcast failed');
    }
  }
  class ThrowingServer extends FakeSocketServer {
    of(name) {
      if (!this.namespaces.has(name)) {
        this.namespaces.set(name, new ThrowingNamespace(name));
      }
      return this.namespaces.get(name);
    }
  }

  const history = [];
  const server = new ThrowingServer();
  setupChatNamespace(
    server,
    () => history,
    message => ({ id: 'prepared-1', ...message }),
    message => {
      history.push(message);
      return message;
    }
  );
  const namespace = server.of('/chat');
  const socket = new FakeSocket();

  namespace.handlers.get('connection')(socket);
  assert.doesNotThrow(() => socket.handlers.get('chatMessage')({ username: 'Ada', text: 'Hello' }));

  assert.deepEqual(namespace.emitted, [{
    eventName: 'chatMessage',
    payload: {
      id: 'prepared-1',
      username: 'Ada',
      text: 'Hello'
    }
  }]);
  assert.deepEqual(history, []);
});

test('setupChatNamespace isolates message recorder failures', () => {
  const server = new FakeSocketServer();
  setupChatNamespace(
    server,
    () => [],
    () => {
      throw new Error('record failed');
    }
  );
  const namespace = server.of('/chat');
  const socket = new FakeSocket();

  namespace.handlers.get('connection')(socket);

  assert.doesNotThrow(() => socket.handlers.get('chatMessage')({ username: 'Ada', text: 'Hello' }));
  assert.deepEqual(namespace.emitted, []);
});

test('setupChatNamespace tolerates hostile message fields and socket ids', () => {
  const server = new FakeSocketServer();
  setupChatNamespace(
    server,
    () => [],
    message => ({ id: 'prepared', ...message })
  );
  const namespace = server.of('/chat');
  const socket = new FakeSocket();
  Object.defineProperty(socket, 'id', {
    get() {
      throw new Error('socket id denied');
    },
  });
  namespace.handlers.get('connection')(socket);

  const hostileMessage = {};
  Object.defineProperties(hostileMessage, {
    message: {
      value: ' Hello through fallback ',
    },
    text: {
      get() {
        throw new Error('text denied');
      },
    },
    username: {
      get() {
        throw new Error('username denied');
      },
    },
  });

  assert.doesNotThrow(() => socket.handlers.get('chatMessage')(hostileMessage));
  assert.deepEqual(namespace.emitted, [{
    eventName: 'chatMessage',
    payload: {
      id: 'prepared',
      username: 'Anonymous',
      text: 'Hello through fallback',
    },
  }]);
});

test('setupSocketNamespaces registers all expected namespaces', () => {
  const server = new FakeSocketServer();

  setupSocketNamespaces(server, () => []);

  assert.deepEqual([...server.namespaces.keys()].sort(), ['/chat', '/counter', '/updates']);
  assert.equal(typeof server.of('/counter').handlers.get('connection'), 'function');
  assert.equal(typeof server.of('/chat').handlers.get('connection'), 'function');
  assert.equal(typeof server.of('/updates').handlers.get('connection'), 'function');
});

test('setupSocketNamespaces tolerates namespace initialization failures', () => {
  const server = {
    of() {
      throw new Error('namespace denied');
    },
  };

  assert.doesNotThrow(() => setupSocketNamespaces(server, () => []));
});

test('socket namespaces tolerate listener registration and interval failures', () => {
  class ThrowingSocket extends FakeSocket {
    on() {
      throw new Error('listener denied');
    }
  }
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  globalThis.setInterval = () => {
    throw new Error('interval denied');
  };
  globalThis.clearInterval = () => {
    throw new Error('clear denied');
  };

  try {
    const server = new FakeSocketServer();
    setupCounterNamespace(server);
    setupUpdatesNamespace(server);

    assert.doesNotThrow(() => server.of('/counter').handlers.get('connection')(new ThrowingSocket()));
    assert.doesNotThrow(() => server.of('/updates').handlers.get('connection')(new ThrowingSocket()));
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test('counter and updates namespaces clear intervals when socket emits fail', () => {
  class ThrowingSocket extends FakeSocket {
    emit() {
      throw new Error('emit failed');
    }
  }
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const intervals = [];
  globalThis.setInterval = (callback, intervalMs) => {
    intervals.push({ callback, intervalMs, cleared: false });
    return intervals.length - 1;
  };
  globalThis.clearInterval = (intervalId) => {
    intervals[intervalId].cleared = true;
  };

  try {
    const server = new FakeSocketServer();
    setupCounterNamespace(server);
    setupUpdatesNamespace(server);
    server.of('/counter').handlers.get('connection')(new ThrowingSocket());
    server.of('/updates').handlers.get('connection')(new ThrowingSocket());

    assert.doesNotThrow(() => intervals[0].callback());
    assert.doesNotThrow(() => intervals[1].callback());
    assert.equal(intervals[0].cleared, true);
    assert.equal(intervals[1].cleared, true);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
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
  process.env.HTMLEX_TEST_FAST = ' 1 ';

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
