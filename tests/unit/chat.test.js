import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createChatMessage,
  getChatHistory,
  recordChatMessage,
  sendChatMessage,
  storeChatMessage,
} from '../../src/features/chat.js';

process.env.HTMLEX_LOG_LEVEL = 'silent';

function createResponse() {
  return {
    body: '',
    headersSent: false,
    statusCode: 200,
    writableEnded: false,
    end() {
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    send(body) {
      this.body = body;
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    }
  };
}

function createNamespace() {
  return {
    events: [],
    emit(eventName, payload) {
      this.events.push({ eventName, payload });
    }
  };
}

test('sendChatMessage validates, normalizes, stores, and broadcasts messages', async () => {
  const res = createResponse();
  const namespace = createNamespace();
  const longUsername = ` ${'u'.repeat(60)} `;
  const longMessage = ` ${'m'.repeat(1100)} `;

  await sendChatMessage({
    body: {
      username: longUsername,
      message: longMessage
    }
  }, res, namespace);

  assert.equal(res.statusCode, 204);
  assert.equal(res.writableEnded, true);
  assert.equal(namespace.events.length, 1);
  assert.equal(namespace.events[0].eventName, 'chatMessage');
  assert.equal(namespace.events[0].payload.username, 'u'.repeat(50));
  assert.equal(namespace.events[0].payload.text, 'm'.repeat(1000));
  assert.equal(typeof namespace.events[0].payload.id, 'string');
  assert.deepEqual(getChatHistory().at(-1), namespace.events[0].payload);
  assert.notEqual(getChatHistory().at(-1), namespace.events[0].payload);
});

test('sendChatMessage rejects blank messages without broadcasting', async () => {
  const res = createResponse();
  const namespace = createNamespace();

  await sendChatMessage({
    body: {
      username: 'Cam',
      message: '   '
    }
  }, res, namespace);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body, 'Missing chat message');
  assert.deepEqual(namespace.events, []);
});

test('sendChatMessage does not store messages when broadcasting fails', async () => {
  const before = getChatHistory();
  const res = createResponse();
  const namespace = {
    emit() {
      throw new Error('broadcast failed');
    },
  };

  await sendChatMessage({
    body: {
      username: 'Unit',
      message: 'should not persist'
    }
  }, res, namespace);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body, 'Internal server error');
  assert.deepEqual(getChatHistory(), before);
});

test('sendChatMessage fails closed for hostile request and response objects', async () => {
  const before = getChatHistory();
  const hostileRequest = {};
  Object.defineProperty(hostileRequest, 'body', {
    get() {
      throw new Error('body denied');
    },
  });
  const hostileResponse = {};
  Object.defineProperties(hostileResponse, {
    headersSent: {
      get() {
        throw new Error('headers denied');
      },
    },
    writableEnded: {
      get() {
        throw new Error('ended denied');
      },
    },
  });
  const throwingResponse = {
    headersSent: false,
    writableEnded: false,
    end() {
      throw new Error('end denied');
    },
    send() {
      throw new Error('send denied');
    },
    status() {
      throw new Error('status denied');
    },
    type() {
      throw new Error('type denied');
    },
  };
  const namespace = createNamespace();

  await assert.doesNotReject(() => sendChatMessage(hostileRequest, hostileResponse, namespace));
  await assert.doesNotReject(() => sendChatMessage({
    body: {
      username: 'Unit',
      message: 'response failure still stays handled',
    },
  }, throwingResponse, namespace));

  assert.equal(namespace.events.length, 1);
  assert.equal(namespace.events[0].payload.text, 'response failure still stays handled');
  assert.deepEqual(getChatHistory().slice(0, before.length), before);
});

test('chat history is capped to the newest 100 messages', async () => {
  const namespace = createNamespace();
  const prefix = `cap-${Date.now()}-`;

  for (let index = 0; index < 105; index += 1) {
    await sendChatMessage({
      body: {
        username: 'Unit',
        message: `${prefix}${index}`
      }
    }, createResponse(), namespace);
  }

  const history = getChatHistory();
  assert.equal(history.length, 100);
  assert.equal(history.some(message => message.text === `${prefix}0`), false);
  assert.equal(history.at(-1).text, `${prefix}104`);
});

test('recordChatMessage rejects null input and generates unique ids', () => {
  assert.equal(recordChatMessage(null), null);

  const first = recordChatMessage({ username: 'Unit', message: 'same millisecond' });
  const second = recordChatMessage({ username: 'Unit', message: 'same millisecond' });

  assert.notEqual(first.id, second.id);
});

test('chat message ids fall back when Date.now is unusable', () => {
  const originalDateNow = Date.now;
  Date.now = () => Infinity;

  try {
    const message = recordChatMessage({ username: 'Unit', message: 'bad clock' });
    assert.match(message.id, /^0-\d+$/u);
  } finally {
    Date.now = originalDateNow;
  }
});

test('chat message normalization tolerates hostile fields', () => {
  const hostileBlankInput = {};
  Object.defineProperties(hostileBlankInput, {
    id: {
      get() {
        throw new Error('id denied');
      },
    },
    message: {
      get() {
        throw new Error('message denied');
      },
    },
    text: {
      value: {
        toString() {
          throw new Error('text denied');
        },
      },
    },
    username: {
      get() {
        throw new Error('username denied');
      },
    },
  });

  assert.equal(createChatMessage(hostileBlankInput), null);

  const fallbackInput = {};
  Object.defineProperties(fallbackInput, {
    id: {
      get() {
        throw new Error('id denied');
      },
    },
    message: {
      get() {
        throw new Error('message denied');
      },
    },
    text: {
      value: ' Stored from fallback ',
    },
    username: {
      get() {
        throw new Error('username denied');
      },
    },
  });

  const message = createChatMessage(fallbackInput);
  assert.equal(message.username, 'Anonymous');
  assert.equal(message.text, 'Stored from fallback');
  assert.match(message.id, /^\d+-\d+$/);
});

test('chat storage sanitizes hostile records before history cloning', () => {
  const hostileRecord = {};
  Object.defineProperties(hostileRecord, {
    id: {
      get() {
        throw new Error('id denied');
      },
    },
    message: {
      value: ' Stored safely ',
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

  const stored = storeChatMessage(hostileRecord);
  assert.equal(stored.username, 'Anonymous');
  assert.equal(stored.text, 'Stored safely');

  const history = getChatHistory();
  assert.equal(history.at(-1).text, 'Stored safely');
  assert.notEqual(history.at(-1), stored);
});

test('getChatHistory returns a defensive copy', () => {
  recordChatMessage({ username: 'Unit', message: 'copy check' });
  const before = getChatHistory();
  before.at(-1).text = 'mutated';
  before.length = 0;

  assert.notEqual(getChatHistory().length, 0);
  assert.notEqual(getChatHistory().at(-1).text, 'mutated');
});
