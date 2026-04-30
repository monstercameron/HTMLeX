import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chatDemoInit,
  demoInit,
  fetchNotification,
  hoverDemoInit,
  hoverMessage,
  incrementCounter,
  incrementCounterDemoInit,
  infiniteScrollDemoInit,
  loadMoreItems,
  multiFragment,
  multiFragmentDemoInit,
  notificationsDemoInit,
  pollingDemoInit,
  pollingTick,
  processInit,
  processStep1,
  processStep2,
  processStep3,
  processStep4,
  processStep5,
  sequentialDemoInit,
  sequentialNext,
  sseDemoInit,
  sseSubscribe,
  sseSubscribeMessage,
  webSocketUpdatesDemoInit,
} from '../../src/features/streaming.js';

process.env.HTMLEX_LOG_LEVEL = 'silent';
process.env.HTMLEX_TEST_FAST = '1';

function createResponse() {
  return {
    body: '',
    chunks: [],
    headers: {},
    headersSent: false,
    statusCode: 200,
    writableEnded: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    type(value) {
      this.headers['Content-Type'] = value;
      return this;
    },
    write(chunk) {
      this.chunks.push(String(chunk));
      this.body += String(chunk);
      this.headersSent = true;
      return true;
    },
    send(body = '') {
      this.body += String(body);
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    end(chunk = '') {
      if (chunk) {
        this.body += String(chunk);
      }
      this.writableEnded = true;
      return this;
    },
  };
}

function createRequest(routeName = 'streaming.unit') {
  return {
    requestId: 'streaming-unit',
    routeName,
  };
}

test('streaming init handlers render each demo into the demo canvas', async () => {
  const cases = [
    [infiniteScrollDemoInit, /Infinite Scrolling List/, /target="#demoCanvas\(innerHTML\)"/],
    [notificationsDemoInit, /Notifications/, /target="#demoCanvas\(innerHTML\)"/],
    [incrementCounterDemoInit, /Clicker Counter/, /target="#demoCanvas\(innerHTML\)"/],
    [multiFragmentDemoInit, /Multi-Fragment Updates/, /target="#demoCanvas\(innerHTML\)"/],
    [sequentialDemoInit, /Sequential API Calls/, /target="#demoCanvas\(innerHTML\)"/],
    [processInit, /Signal Chaining/, /target="#demoCanvas\(innerHTML\)"/],
    [demoInit, /Loading State Demo/, /target="#demoCanvas\(innerHTML\)"/],
    [sseDemoInit, /SSE Subscriber \(Simulated\)/, /target="#demoCanvas\(innerHTML\)"/],
    [chatDemoInit, /Chat Interface/, /target="#demoCanvas\(innerHTML\)"/],
    [webSocketUpdatesDemoInit, /Live WebSocket Feed/, /target="#demoCanvas\(innerHTML\)"/],
    [pollingDemoInit, /Polling Demo/, /target="#demoCanvas\(innerHTML\)"/],
    [hoverDemoInit, /Hover Trigger Demo/, /target="#demoCanvas\(innerHTML\)"/],
  ];

  for (const [handler, expectedTitle, expectedTarget] of cases) {
    const response = createResponse();
    await handler(createRequest(), response);

    assert.equal(response.statusCode, 200, handler.name);
    assert.equal(response.writableEnded, true, handler.name);
    assert.match(response.body, expectedTitle, handler.name);
    assert.match(response.body, expectedTarget, handler.name);
  }
});

test('streaming response handlers write targeted fragments and headers', async () => {
  const multiResponse = createResponse();
  await multiFragment(createRequest(), multiResponse);

  assert.match(multiResponse.body, /target="#multiUpdate1\(innerHTML\)"/);
  assert.match(multiResponse.body, /target="#multiUpdate2\(append\)"/);
  assert.match(multiResponse.body, /Primary Content Loaded/);
  assert.match(multiResponse.body, /Additional Content Appended/);
  assert.equal(multiResponse.writableEnded, true);

  const sseResponse = createResponse();
  await sseSubscribe(createRequest(), sseResponse);

  assert.equal(sseResponse.headers.Emit, 'sseUpdate');
  assert.equal(sseResponse.body, '');
  assert.equal(sseResponse.writableEnded, true);

  const messageResponse = createResponse();
  await sseSubscribeMessage(createRequest(), messageResponse);

  assert.match(messageResponse.body, /target="this\(innerHTML\)"/);
  assert.match(messageResponse.body, /SSE action performed/);
});

test('streaming delayed handlers render final payloads with expected targets', async () => {
  const notificationResponse = createResponse();
  await fetchNotification(createRequest(), notificationResponse);

  assert.match(notificationResponse.body, /Fetching notification in 2500ms/);
  assert.match(notificationResponse.body, /You have a new notification/);
  assert.match(notificationResponse.body, /timer="5000"/);
  assert.equal(notificationResponse.writableEnded, true);

  const sequentialResponse = createResponse();
  await sequentialNext(createRequest(), sequentialResponse);

  assert.match(sequentialResponse.body, /target="#sequentialOutput\(append\)"/);
  assert.match(sequentialResponse.body, /\d{4}-\d{2}-\d{2}T/);
  assert.equal(sequentialResponse.writableEnded, true);
});

test('streaming fast-mode environment flag is trimmed before delays', async () => {
  const originalFastMode = process.env.HTMLEX_TEST_FAST;
  process.env.HTMLEX_TEST_FAST = ' 1 ';
  const response = createResponse();
  const startedAt = performance.now();

  try {
    await fetchNotification(createRequest(), response);
  } finally {
    process.env.HTMLEX_TEST_FAST = originalFastMode;
  }

  assert.ok(performance.now() - startedAt < 500);
  assert.match(response.body, /You have a new notification/);
});

test('streaming handlers use fallback timestamps when Date APIs fail', async () => {
  const OriginalDate = globalThis.Date;
  class ThrowingDate {
    constructor() {
      return {
        toISOString() {
          throw new Error('iso denied');
        },
        toLocaleTimeString() {
          throw new Error('time denied');
        },
      };
    }

    static now() {
      throw new Error('now denied');
    }
  }

  globalThis.Date = ThrowingDate;

  try {
    const loadMoreResponse = createResponse();
    await loadMoreItems(createRequest(), loadMoreResponse);
    assert.match(loadMoreResponse.body, /Item 0/);
    assert.equal(loadMoreResponse.writableEnded, true);

    const sequentialResponse = createResponse();
    await sequentialNext(createRequest(), sequentialResponse);
    assert.match(sequentialResponse.body, /1970-01-01T00:00:00\.000Z/);

    const processResponse = createResponse();
    await processStep1(createRequest(), processResponse);
    assert.match(processResponse.body, /Step 1: Data received at now/);

    const pollingResponse = createResponse();
    await pollingTick(createRequest(), pollingResponse);
    assert.match(pollingResponse.body, /Polling update at 1970-01-01T00:00:00\.000Z/);
  } finally {
    globalThis.Date = OriginalDate;
  }
});

test('sseSubscribe fails closed when response methods throw', async () => {
  const response = {
    headersSent: false,
    req: createRequest('streaming.sseSubscribe'),
    writableEnded: false,
    end() {
      throw new Error('end denied');
    },
    send() {
      throw new Error('send denied');
    },
    setHeader() {
      throw new Error('header denied');
    },
    status() {
      throw new Error('status denied');
    },
  };

  await assert.doesNotReject(() => sseSubscribe(createRequest(), response));

  const hostileStateResponse = {};
  Object.defineProperties(hostileStateResponse, {
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

  await assert.doesNotReject(() => sseSubscribe(createRequest(), hostileStateResponse));
});

test('process step handlers use innerHTML for step one and append afterwards', async () => {
  const stepHandlers = [
    [processStep1, /target="#chainOutput\(innerHTML\)"/, /Step 1:/],
    [processStep2, /target="#chainOutput\(append\)"/, /Step 2:/],
    [processStep3, /target="#chainOutput\(append\)"/, /Step 3:/],
    [processStep4, /target="#chainOutput\(append\)"/, /Step 4:/],
    [processStep5, /target="#chainOutput\(append\)"/, /Step 5:/],
  ];

  for (const [handler, expectedTarget, expectedMessage] of stepHandlers) {
    const response = createResponse();
    await handler(createRequest(), response);

    assert.match(response.body, expectedTarget, handler.name);
    assert.match(response.body, expectedMessage, handler.name);
    assert.equal(response.writableEnded, true, handler.name);
  }
});

test('simple streaming endpoints render counter, polling, and hover fragments', async () => {
  const counterResponse = createResponse();
  await incrementCounter(createRequest(), counterResponse);

  assert.match(counterResponse.body, /target="#counterDisplay\(innerHTML\)"/);
  assert.match(counterResponse.body, /Counter: \d+/);

  const pollingResponse = createResponse();
  await pollingTick(createRequest(), pollingResponse);

  assert.match(pollingResponse.body, /target="#pollingOutput\(innerHTML\)"/);
  assert.match(pollingResponse.body, /Polling update at/);

  const hoverResponse = createResponse();
  await hoverMessage(createRequest(), hoverResponse);

  assert.match(hoverResponse.body, /target="#hoverOutput\(innerHTML\)"/);
  assert.match(hoverResponse.body, /Hover action loaded/);
});
