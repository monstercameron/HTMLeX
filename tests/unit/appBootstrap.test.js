import assert from 'node:assert/strict';
import https from 'node:https';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const processEvents = ['SIGTERM', 'SIGINT', 'uncaughtException', 'unhandledRejection'];

process.env.HTMLEX_LOG_LEVEL = 'silent';

function listenerCounts() {
  return Object.fromEntries(processEvents.map(eventName => [eventName, process.listenerCount(eventName)]));
}

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

function postMultipart(port, pathname, fields) {
  const boundary = `----htmlex-unit-${Date.now()}`;
  const body = Object.entries(fields)
    .map(([name, value]) => (
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
      `${value}\r\n`
    ))
    .join('') + `--${boundary}--\r\n`;

  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: 'localhost',
      port,
      path: pathname,
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });

    request.on('error', reject);
    request.end(body);
  });
}

function getPath(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: 'localhost',
      port,
      path: pathname,
      method: 'GET',
      rejectUnauthorized: false,
      headers,
    }, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });

    request.on('error', reject);
    request.end();
  });
}

test('importing app.js does not install process handlers or start network services', async () => {
  const beforeImport = listenerCounts();
  const appUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/app.js'));

  const appModule = await import(`${appUrl.href}?side-effect-check=${Date.now()}`);

  assert.equal(typeof appModule.createApp, 'function');
  assert.equal(typeof appModule.createHttpsServer, 'function');
  assert.equal(typeof appModule.startServer, 'function');
  assert.deepEqual(listenerCounts(), beforeImport);
});

test('server entrypoint imports without installing process handlers', async () => {
  const beforeImport = listenerCounts();
  const serverUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/server.js'));

  const serverModule = await import(`${serverUrl.href}?side-effect-check=${Date.now()}`);

  assert.equal(typeof serverModule.runServer, 'function');
  assert.deepEqual(listenerCounts(), beforeImport);
});

test('browser entrypoint imports safely without DOM globals', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  delete globalThis.window;
  delete globalThis.document;
  const mainUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/public/src/main.js'));

  try {
    await assert.doesNotReject(() => import(`${mainUrl.href}?no-dom=${Date.now()}`));
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  }
});

test('browser entrypoint initializes ready documents and lifecycle markers', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalMutationObserver = globalThis.MutationObserver;
  globalThis.window = {};
  globalThis.document = {
    readyState: 'complete',
    body: {},
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll() {
      return [];
    },
  };
  delete globalThis.MutationObserver;
  const mainUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/public/src/main.js'));

  try {
    await import(`${mainUrl.href}?ready-document=${Date.now()}`);
    const { runLifecycleHook } = await import('../../src/public/src/hooks.js');
    const element = {
      hasAttribute(name) {
        return name === 'onbefore';
      },
      getAttribute(name) {
        return name === 'onbefore' ? 'todo:create:before' : null;
      },
      dispatchEvent() {},
    };

    runLifecycleHook(element, 'onbefore');

    assert.equal(globalThis.window.__htmlexLifecycle, 'beforeTodoCreate');
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
    if (originalMutationObserver === undefined) {
      delete globalThis.MutationObserver;
    } else {
      globalThis.MutationObserver = originalMutationObserver;
    }
  }
});

test('browser entrypoint registers DOMContentLoaded for loading documents', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalMutationObserver = globalThis.MutationObserver;
  const listeners = [];
  globalThis.window = {};
  globalThis.document = {
    readyState: 'loading',
    body: {},
    addEventListener(eventName, callback, options) {
      listeners.push({ eventName, callback, options });
    },
    removeEventListener() {},
    querySelectorAll() {
      return [];
    },
  };
  delete globalThis.MutationObserver;
  const mainUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/public/src/main.js'));

  try {
    await import(`${mainUrl.href}?loading-document=${Date.now()}`);

    assert.equal(listeners.length, 1);
    assert.deepEqual({
      eventName: listeners[0].eventName,
      options: listeners[0].options,
    }, {
      eventName: 'DOMContentLoaded',
      options: { once: true },
    });
    assert.doesNotThrow(() => listeners[0].callback());
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
    if (originalMutationObserver === undefined) {
      delete globalThis.MutationObserver;
    } else {
      globalThis.MutationObserver = originalMutationObserver;
    }
  }
});

test('createHttpsServer wires its generated app to the local Socket.IO server', async () => {
  const appUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/app.js'));
  const { createHttpsServer } = await import(`${appUrl.href}?standalone-server=${Date.now()}`);
  const { server } = await createHttpsServer();

  try {
    await listen(server);
    const response = await postMultipart(server.address().port, '/chat/send', {
      username: 'Unit',
      message: 'Standalone server chat message'
    });

    assert.equal(response.statusCode, 204);
    assert.equal(response.body, '');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('createHttpsServer wires caller-created apps to their local Socket.IO server', async () => {
  const appUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/app.js'));
  const { createApp, createHttpsServer } = await import(`${appUrl.href}?custom-app-server=${Date.now()}`);
  const customApp = createApp();
  const { server } = await createHttpsServer({ app: customApp });

  try {
    await listen(server);
    const response = await postMultipart(server.address().port, '/chat/send', {
      username: 'Unit',
      message: 'Custom app server chat message'
    });

    assert.equal(response.statusCode, 204);
    assert.equal(response.body, '');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('responses include baseline security and request-id headers', async () => {
  const appUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/app.js'));
  const { createHttpsServer } = await import(`${appUrl.href}?security-headers=${Date.now()}`);
  const { server } = await createHttpsServer();

  try {
    await listen(server);
    const response = await getPath(server.address().port, '/');

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-powered-by'], undefined);
    assert.equal(response.headers['x-frame-options'], 'DENY');
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
    assert.equal(response.headers['cross-origin-opener-policy'], 'same-origin');
    assert.equal(response.headers['permissions-policy'], 'camera=(), geolocation=(), microphone=()');
    assert.match(response.headers['content-security-policy'], /default-src 'self'/);
    assert.match(response.headers['content-security-policy'], /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
    assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.match(response.headers['x-request-id'], /^[\da-f-]{36}$/i);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('invalid incoming request ids are replaced before being echoed', async () => {
  const appUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/app.js'));
  const { createHttpsServer } = await import(`${appUrl.href}?request-id=${Date.now()}`);
  const { server } = await createHttpsServer();

  try {
    await listen(server);
    const response = await getPath(server.address().port, '/missing', {
      'x-request-id': '<script>alert(1)</script>',
    });

    assert.equal(response.statusCode, 404);
    assert.match(response.headers['x-request-id'], /^[\da-f-]{36}$/i);
    assert.doesNotMatch(response.body, /<script>/i);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('valid incoming request ids are preserved in headers and text responses', async () => {
  const appUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/app.js'));
  const { createHttpsServer } = await import(`${appUrl.href}?valid-request-id=${Date.now()}`);
  const { server } = await createHttpsServer();
  const requestId = 'unit.request:123';

  try {
    await listen(server);
    const response = await getPath(server.address().port, '/missing', {
      'x-request-id': requestId,
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.headers['x-request-id'], requestId);
    assert.match(response.body, new RegExp(`Request ID: ${requestId}`));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('multipart payload limits return client errors with request ids', async () => {
  const appUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/app.js'));
  const { createHttpsServer } = await import(`${appUrl.href}?multipart-limit=${Date.now()}`);
  const { server } = await createHttpsServer();

  try {
    await listen(server);
    const response = await postMultipart(server.address().port, '/todos/create', {
      todo: 'x'.repeat(33 * 1024),
    });

    assert.equal(response.statusCode, 413);
    assert.match(response.body, /^Invalid form payload\. Request ID: /);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('stopServer gracefully closes the shared HTTPS and Socket.IO runtime', async () => {
  const appUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/app.js'));
  const { startServer, stopServer } = await import(`${appUrl.href}?shutdown=${Date.now()}`);
  const server = await startServer(0);

  const exitCode = await new Promise(resolve => {
    stopServer({ exit: resolve });
  });

  assert.equal(exitCode, 0);
  assert.equal(server.listening, false);
});

test('stopServer exits after closing even when shutdown timeout cleanup throws', async () => {
  const appUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/app.js'));
  const { startServer, stopServer } = await import(`${appUrl.href}?shutdown-clear-timeout=${Date.now()}`);
  const server = await startServer(0);
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let captureShutdownTimer = true;
  let shutdownTimer = null;

  globalThis.setTimeout = (callback, delay, ...args) => {
    const timerId = originalSetTimeout(callback, delay, ...args);
    if (captureShutdownTimer) {
      shutdownTimer = timerId;
      captureShutdownTimer = false;
    }
    return timerId;
  };
  globalThis.clearTimeout = (timerId) => {
    if (timerId === shutdownTimer) {
      shutdownTimer = null;
      throw new Error('clearTimeout denied');
    }
    return originalClearTimeout(timerId);
  };

  try {
    const exitCode = await new Promise(resolve => {
      stopServer({ exit: resolve });
    });

    assert.equal(exitCode, 0);
    assert.equal(server.listening, false);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    if (server.listening) {
      await new Promise(resolve => server.close(resolve));
    }
  }
});

test('client connection errors close sockets without crashing the server', async () => {
  const appUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/app.js'));
  const { createHttpsServer } = await import(`${appUrl.href}?client-error=${Date.now()}`);
  const { server, socketServer } = await createHttpsServer();
  const endedPayloads = [];
  const writableSocket = {
    destroyed: false,
    writable: true,
    end(payload) {
      endedPayloads.push(payload);
      this.destroyed = true;
    },
  };
  const resetSocket = {
    destroyed: false,
    destroyCalled: false,
    destroy() {
      this.destroyCalled = true;
      this.destroyed = true;
    },
  };

  try {
    assert.equal(server.emit('clientError', { code: 'HTTP_PARSE_ERROR', message: 'Bad request' }, writableSocket), true);
    assert.deepEqual(endedPayloads, ['HTTP/1.1 400 Bad Request\r\n\r\n']);
    assert.equal(server.emit('clientError', { code: 'ECONNRESET' }, resetSocket), true);
    assert.equal(resetSocket.destroyCalled, true);
  } finally {
    socketServer.close();
  }
});

test('startServer rejects conflicting port requests for the shared runtime', async () => {
  const appUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/app.js'));
  const { startServer, stopServer } = await import(`${appUrl.href}?conflicting-port=${Date.now()}`);
  const server = await startServer(0);
  const currentPort = server.address().port;

  try {
    await assert.rejects(
      () => startServer(currentPort + 1),
      new RegExp(`already listening on port ${currentPort}`)
    );
    assert.equal(await startServer(0), server);
  } finally {
    await new Promise(resolve => stopServer({ exit: resolve }));
  }
});

test('startServer rejects malformed numeric ports before binding', async () => {
  const appUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/app.js'));
  const { startServer } = await import(`${appUrl.href}?invalid-port=${Date.now()}`);

  await assert.rejects(
    () => startServer('5500abc'),
    /Invalid port/
  );
  await assert.rejects(
    () => startServer(65536),
    /Invalid port/
  );
  await assert.rejects(
    () => startServer(-1),
    /Invalid port/
  );
});

test('startServer rejects unstringifiable ports before binding', async () => {
  const appUrl = pathToFileURL(path.resolve(import.meta.dirname, '../../src/app.js'));
  const { startServer } = await import(`${appUrl.href}?unstringifiable-port=${Date.now()}`);
  const hostilePort = {
    toString() {
      throw new Error('toString denied');
    },
    valueOf() {
      throw new Error('valueOf denied');
    },
  };

  await assert.rejects(
    () => startServer(hostilePort),
    /Invalid port "\[Unstringifiable\]"/
  );
});
