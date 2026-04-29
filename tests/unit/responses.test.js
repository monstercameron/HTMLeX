import assert from 'node:assert/strict';
import test from 'node:test';
import {
  endResponse,
  endServerError,
  sendFragmentResponse,
  sendServerError,
  writeFragmentResponse,
} from '../../src/features/responses.js';

function createResponse({ headersSent = false, writableEnded = false } = {}) {
  return {
    body: '',
    chunks: [],
    headers: {},
    headersSent,
    statusCode: 200,
    writableEnded,
    setHeader(name, value) {
      if (this.headersSent) {
        throw new Error('Cannot set headers after they are sent');
      }
      this.headers[name] = value;
    },
    send(body) {
      this.body = body;
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    write(chunk) {
      this.chunks.push(chunk);
      this.headersSent = true;
      return true;
    },
    end() {
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
}

test('sendFragmentResponse sets an HTML content type and sends a fragment', () => {
  const res = createResponse();

  sendFragmentResponse(res, '#target(innerHTML)', '<strong>Ready</strong>');

  assert.equal(res.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(
    res.body,
    '<fragment target="#target(innerHTML)"><strong>Ready</strong></fragment>'
  );
  assert.equal(res.writableEnded, true);
});

test('writeFragmentResponse does not mutate headers after streaming starts', () => {
  const res = createResponse({ headersSent: true });

  writeFragmentResponse(res, '#target(append)', '<span>Next</span>');

  assert.deepEqual(res.headers, {});
  assert.deepEqual(res.chunks, [
    '<fragment target="#target(append)"><span>Next</span></fragment>'
  ]);
  assert.equal(res.writableEnded, false);
});

test('sendServerError only writes when headers are still open', () => {
  const openResponse = createResponse();
  const streamingResponse = createResponse({ headersSent: true });

  sendServerError(openResponse, 'Broken');
  sendServerError(streamingResponse, 'Ignored');

  assert.equal(openResponse.statusCode, 500);
  assert.equal(openResponse.body, 'Broken');
  assert.equal(streamingResponse.statusCode, 200);
  assert.equal(streamingResponse.body, '');
});

test('endServerError ends open or already-started responses safely', () => {
  const openResponse = createResponse();
  const streamingResponse = createResponse({ headersSent: true });

  endServerError(openResponse);
  endServerError(streamingResponse);

  assert.equal(openResponse.statusCode, 500);
  assert.equal(openResponse.writableEnded, true);
  assert.equal(streamingResponse.statusCode, 200);
  assert.equal(streamingResponse.writableEnded, true);
});

test('endResponse is idempotent for already-ended responses', () => {
  const res = createResponse({ headersSent: true, writableEnded: true });

  endResponse(res);

  assert.equal(res.writableEnded, true);
});
