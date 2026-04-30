import assert from 'node:assert/strict';
import test from 'node:test';
import {
  endResponse,
  endServerError,
  sendEmptyResponse,
  sendFragmentResponse,
  sendHtmlResponse,
  sendServerError,
  sendTextResponse,
  sendTypedResponse,
  setHtmlResponse,
  setResponseHeader,
  writeFragmentResponse,
} from '../../src/features/responses.js';

process.env.HTMLEX_LOG_LEVEL = 'silent';

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
    type(value) {
      this.headers['Content-Type'] = value;
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

test('text, empty, and header response helpers guard response state', () => {
  const textResponse = createResponse();
  const typedResponse = createResponse();
  const htmlResponse = createResponse();
  const emptyResponse = createResponse();
  const headerResponse = createResponse();
  const sentResponse = createResponse({ headersSent: true });

  assert.equal(setResponseHeader(headerResponse, 'Emit', 'unit:update'), true);
  assert.equal(sendTextResponse(textResponse, 400, 'Bad input'), true);
  assert.equal(sendTypedResponse(typedResponse, 202, 'Accepted', 'application/custom'), true);
  assert.equal(sendHtmlResponse(htmlResponse, 200, '<main>Ready</main>'), true);
  assert.equal(sendEmptyResponse(emptyResponse), true);
  assert.equal(setResponseHeader(sentResponse, 'Late', 'nope'), false);
  assert.equal(sendTextResponse(sentResponse, 409, 'Too late'), false);
  assert.equal(sendTypedResponse(sentResponse, 409, 'Too late', 'text/plain'), false);
  assert.equal(sendHtmlResponse(sentResponse, 409, '<main>Too late</main>'), false);
  assert.equal(sendEmptyResponse(sentResponse, 204), false);

  assert.equal(headerResponse.headers.Emit, 'unit:update');
  assert.equal(textResponse.statusCode, 400);
  assert.equal(textResponse.headers['Content-Type'], 'text/plain');
  assert.equal(textResponse.body, 'Bad input');
  assert.equal(typedResponse.statusCode, 202);
  assert.equal(typedResponse.headers['Content-Type'], 'application/custom');
  assert.equal(typedResponse.body, 'Accepted');
  assert.equal(htmlResponse.statusCode, 200);
  assert.equal(htmlResponse.headers['Content-Type'], 'html');
  assert.equal(htmlResponse.body, '<main>Ready</main>');
  assert.equal(emptyResponse.statusCode, 204);
  assert.equal(emptyResponse.writableEnded, true);
  assert.equal(sentResponse.body, '');
});

test('response helpers tolerate hostile response state and methods', () => {
  const hostileStateResponse = {};
  Object.defineProperties(hostileStateResponse, {
    headersSent: {
      get() {
        throw new Error('headers state denied');
      },
    },
    req: {
      get() {
        throw new Error('request denied');
      },
    },
    writableEnded: {
      get() {
        throw new Error('writable state denied');
      },
    },
  });

  assert.doesNotThrow(() => setHtmlResponse(hostileStateResponse));
  assert.doesNotThrow(() => setResponseHeader(hostileStateResponse, 'Emit', 'unit:update'));
  assert.doesNotThrow(() => sendTextResponse(hostileStateResponse, 400, 'Ignored'));
  assert.doesNotThrow(() => sendTypedResponse(hostileStateResponse, 400, 'Ignored', 'text/plain'));
  assert.doesNotThrow(() => sendHtmlResponse(hostileStateResponse, 400, '<main>Ignored</main>'));
  assert.doesNotThrow(() => sendEmptyResponse(hostileStateResponse));
  assert.doesNotThrow(() => sendServerError(hostileStateResponse, 'Ignored'));
  assert.doesNotThrow(() => endServerError(hostileStateResponse));
  assert.doesNotThrow(() => endResponse(hostileStateResponse));

  const throwingMethodsResponse = {
    headersSent: false,
    writableEnded: false,
    end() {
      throw new Error('end denied');
    },
    send() {
      throw new Error('send denied');
    },
    setHeader() {
      throw new Error('set header denied');
    },
    status() {
      throw new Error('status denied');
    },
    write() {
      throw new Error('write denied');
    },
  };

  assert.doesNotThrow(() => setResponseHeader(throwingMethodsResponse, 'Emit', 'unit:update'));
  assert.doesNotThrow(() => sendTextResponse(throwingMethodsResponse, 400, {
    toString() {
      throw new Error('text denied');
    },
  }));
  assert.doesNotThrow(() => sendTypedResponse(throwingMethodsResponse, 400, 'Ignored', {
    toString() {
      throw new Error('type denied');
    },
  }));
  assert.doesNotThrow(() => sendHtmlResponse(throwingMethodsResponse, 400, {
    toString() {
      throw new Error('html denied');
    },
  }));
  assert.doesNotThrow(() => sendEmptyResponse(throwingMethodsResponse));
  assert.doesNotThrow(() => sendFragmentResponse(throwingMethodsResponse, '#target(innerHTML)', '<b>Ready</b>'));
  assert.doesNotThrow(() => writeFragmentResponse(throwingMethodsResponse, '#target(append)', '<b>Ready</b>'));
  assert.doesNotThrow(() => sendServerError(throwingMethodsResponse, {
    toString() {
      throw new Error('message denied');
    },
  }));
  assert.doesNotThrow(() => endServerError(throwingMethodsResponse));
  assert.doesNotThrow(() => endResponse(throwingMethodsResponse));
});

test('fragment response helpers fail closed for invalid fragment metadata', () => {
  const sendResponse = createResponse();
  const writeResponse = createResponse();

  assert.equal(
    sendFragmentResponse(sendResponse, '#target(innerHTML)', '<b>Ready</b>', { 'bad attr': 'nope' }),
    false
  );
  assert.equal(
    writeFragmentResponse(writeResponse, '#target(append)', '<b>Ready</b>', { 'bad attr': 'nope' }),
    false
  );

  assert.equal(sendResponse.body, '');
  assert.equal(writeResponse.body, '');
  assert.equal(sendResponse.writableEnded, false);
  assert.equal(writeResponse.writableEnded, false);
});
