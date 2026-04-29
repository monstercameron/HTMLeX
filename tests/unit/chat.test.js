import assert from 'node:assert/strict';
import test from 'node:test';
import { getChatHistory, sendChatMessage } from '../../src/features/chat.js';

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
  assert.equal(getChatHistory().at(-1), namespace.events[0].payload);
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
