// ./src/app.js

import express from 'express';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import multer from 'multer';
import { Server as SocketIOServer } from 'socket.io';
import { renderDefaultIndexPage } from './components/Components.js';
import { getHttpsOptions } from './certificates.js';
import { logRequestError, logRequestWarning, serverLogger } from './serverLogger.js';

// Domain features
import * as todos from './features/todos.js';
import * as streaming from './features/streaming.js';
import * as chat from './features/chat.js';
import { setupSocketNamespaces } from './features/socket.js';
import { loadAndRenderDemos, renderDemoDetails } from './features/demos.js';

/* =======================
   CONSTANTS / MAGIC STRINGS
   ======================= */
const PORT = process.env.PORT || 5500;
const PUBLIC_DIR = 'public';
const INDEX_FILE = 'index.html';
const SRC_DIR = import.meta.dirname;
const PROJECT_ROOT = path.resolve(SRC_DIR, '..');

// Todo routes
const TODO_INIT_DEMO = '/todos/init';
const TODO_CREATE_ROUTE = '/todos/create';
const TODO_LIST_ROUTE = '/todos/list';
const TODO_ITEM_ROUTE = '/todos/item/:id';
const TODO_EDIT_ROUTE = '/todos/edit/:id';
const TODO_UPDATE_ROUTE = '/todos/:id';
const TODO_DELETE_ROUTE = '/todos/:id';

// Streaming routes
// Infinite scrolling
const ITEMS_LOAD_MORE_ROUTE = '/items/loadMore';
const ITEMS_DEMO_INIT = '/items/init';
// SSE notifications
const NOTIFICATIONS_DEMO_INIT = '/notifications/init';
const NOTIFICATIONS_ROUTE = '/notifications';
// Click counter
const COUNTER_DEMO_INIT = '/counter/init';
const COUNTER_INCREMENT_ROUTE = '/counter/increment';
// Single request, multiple targets
const MULTI_DEMO_INIT = '/multi/init';
const MULTI_FRAGMENT_ROUTE = '/multi/fragment';
// Polling
const SEQUENTIAL_DEMO_INIT = '/sequential/init';
const SEQUENTIAL_POLL_NEXT = '/sequential/next';
// Sequential FIFO with pacing
const PROCESS_DEMO_INIT = '/process/init';
const PROCESS_STEP1_ROUTE = '/process/step1';
const PROCESS_STEP2_ROUTE = '/process/step2';
const PROCESS_STEP3_ROUTE = '/process/step3';
const PROCESS_STEP4_ROUTE = '/process/step4';
const PROCESS_STEP5_ROUTE = '/process/step5';
// Demo route handling
const DEMO_DEMO_INIT = '/demo/init';
const DEMO_LOADING_ROUTE = '/demo/loading';
// Server Sent Events
const SSE_DEMO_INIT = '/sse/init';
const SSE_SUBSCRIBE_ROUTE = '/sse/subscribe';
const SSE_SUBSCRIBE_MESSAGE_ROUTE = '/sse/subscribe/message';

// Chat route
const CHAT_DEMO_INIT = '/chat/init';
const CHAT_SEND_ROUTE = '/chat/send';
const UPDATES_DEMO_INIT = '/updates/init';
const POLLING_DEMO_INIT = '/polling/init';
const POLLING_TICK_ROUTE = '/polling/tick';
const HOVER_DEMO_INIT = '/hover/init';
const HOVER_MESSAGE_ROUTE = '/hover/message';

// Socket.IO namespaces
const SOCKET_NS_COUNTER = '/counter';
const SOCKET_NS_CHAT = '/chat';
const SOCKET_NS_UPDATES = '/updates';
const SLOW_REQUEST_THRESHOLD_MS = parseBoundedInteger(
  process.env.HTMLEX_SLOW_REQUEST_MS || '1000',
  { min: 1, defaultValue: 1000 }
);
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5000;
const MULTIPART_FIELD_SIZE_LIMIT_BYTES = 32 * 1024;
const MULTIPART_FIELD_COUNT_LIMIT = 50;
const MULTIPART_PART_COUNT_LIMIT = 60;
const MULTIPART_PAYLOAD_LIMIT_CODES = new Set([
  'LIMIT_FIELD_COUNT',
  'LIMIT_FIELD_VALUE',
  'LIMIT_FILE_COUNT',
  'LIMIT_FILE_SIZE',
  'LIMIT_PART_COUNT',
]);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "style-src 'self' https://cdn.jsdelivr.net",
    "script-src 'self' https://cdn.jsdelivr.net",
    "connect-src 'self' wss:",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; '),
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

let sharedRuntime = null;
let processHandlersInstalled = false;
let fallbackRequestIdSequence = 0;

function safeString(value, fallback = '') {
  try {
    return String(value ?? fallback);
  } catch {
    return fallback;
  }
}

function getField(target, fieldName, fallback = undefined) {
  try {
    return target?.[fieldName] ?? fallback;
  } catch {
    return fallback;
  }
}

function setField(target, fieldName, value) {
  try {
    if (target && typeof target === 'object') {
      target[fieldName] = value;
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function deleteField(target, fieldName) {
  try {
    if (target && typeof target === 'object') {
      delete target[fieldName];
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function callMethod(target, methodName, args = [], fallback = undefined) {
  try {
    const method = target?.[methodName];
    if (typeof method !== 'function') return fallback;
    return method.apply(target, args);
  } catch {
    return fallback;
  }
}

function getMethod(target, methodName) {
  try {
    const method = target?.[methodName];
    return typeof method === 'function' ? method : null;
  } catch {
    return null;
  }
}

function safeCall(callback, args = [], fallback = undefined) {
  try {
    return typeof callback === 'function' ? callback(...args) : fallback;
  } catch {
    return fallback;
  }
}

function safeNow() {
  const timestamp = callMethod(globalThis.performance, 'now');
  if (Number.isFinite(timestamp)) return timestamp;

  const epochTimestamp = callMethod(Date, 'now');
  return Number.isFinite(epochTimestamp) ? epochTimestamp : 0;
}

function safeRandomUUID() {
  const generatedId = safeCall(randomUUID);
  if (typeof generatedId === 'string' && REQUEST_ID_PATTERN.test(generatedId)) {
    return generatedId;
  }

  fallbackRequestIdSequence = (fallbackRequestIdSequence + 1) % Number.MAX_SAFE_INTEGER;
  const timestampPart = Math.trunc(safeNow()).toString(36);
  const randomValue = safeCall(Math.random, [], 0);
  const randomPart = Number.isFinite(randomValue)
    ? randomValue.toString(36).slice(2, 12)
    : 'fallback';

  return `${timestampPart}-${randomPart}-${fallbackRequestIdSequence.toString(36)}`;
}

function parseBoundedInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER, defaultValue = null } = {}) {
  const normalizedValue = safeString(value).trim();
  if (!/^\d+$/u.test(normalizedValue)) return defaultValue;

  const parsed = Number.parseInt(normalizedValue, 10);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : defaultValue;
}

function getShutdownTimeoutMs() {
  return parseBoundedInteger(
    process.env.HTMLEX_SHUTDOWN_TIMEOUT_MS || safeString(DEFAULT_SHUTDOWN_TIMEOUT_MS),
    { min: 1, defaultValue: DEFAULT_SHUTDOWN_TIMEOUT_MS }
  );
}

function getRequestHeader(req, headerName) {
  return safeString(callMethod(req, 'get', [headerName])).trim();
}

function getRequestId(req) {
  const incomingRequestId = getRequestHeader(req, 'x-request-id');
  return incomingRequestId && REQUEST_ID_PATTERN.test(incomingRequestId)
    ? incomingRequestId
    : safeRandomUUID();
}

function getRequestIdForResponse(req) {
  return safeString(getField(req, 'requestId', 'unknown'), 'unknown');
}

function setResponseHeader(res, name, value) {
  callMethod(res, 'setHeader', [name, value]);
}

function onResponseFinish(res, callback) {
  callMethod(res, 'on', ['finish', callback]);
}

function getResponseStatusCode(res, fallback = 500) {
  const statusCode = getField(res, 'statusCode', fallback);
  return Number.isInteger(statusCode) ? statusCode : fallback;
}

function hasLoggedRequestIssue(req) {
  return getField(req, '_htmlexIssueLogged', false) === true;
}

function headersWereSent(res) {
  return getField(res, 'headersSent', false) === true;
}

function safeNext(next, error = undefined) {
  if (error === undefined) {
    safeCall(next);
    return;
  }
  safeCall(next, [error]);
}

function sendPlainText(res, statusCode, body) {
  const statusResult = callMethod(res, 'status', [statusCode], res);
  const typeResult = callMethod(statusResult || res, 'type', ['text/plain'], statusResult || res);
  callMethod(typeResult || res, 'send', [body]);
}

function requestContext(req, res, next) {
  const requestId = getRequestId(req);
  setField(req, 'requestId', requestId);
  setResponseHeader(res, 'X-Request-Id', requestId);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    setResponseHeader(res, name, value);
  }

  const startedAt = safeNow();
  onResponseFinish(res, () => {
    const durationMs = Math.max(0, Math.round(safeNow() - startedAt));
    const statusCode = getResponseStatusCode(res);
    const details = {
      statusCode,
      durationMs,
    };

    if (statusCode >= 500 && !hasLoggedRequestIssue(req)) {
      logRequestError(req, `Request completed with HTTP ${statusCode}.`, null, details);
      return;
    }

    if (statusCode >= 400 && !hasLoggedRequestIssue(req)) {
      logRequestWarning(req, `Request completed with HTTP ${statusCode}.`, details);
      return;
    }

    if (durationMs >= SLOW_REQUEST_THRESHOLD_MS) {
      logRequestWarning(req, 'Slow request completed.', details);
    }
  });

  safeNext(next);
}

function routeBoundary(routeName, handler) {
  return async (req, res, next) => {
    setField(req, 'routeName', routeName);
    try {
      await handler(req, res, next);
    } catch (error) {
      safeNext(next, error);
    }
  };
}

function markRoute(routeName) {
  return (req, res, next) => {
    setField(req, 'routeName', routeName);
    safeNext(next);
  };
}

function notFoundBoundary(req, res) {
  logRequestWarning(req, 'No route matched request.', { statusCode: 404 });
  sendPlainText(res, 404, `Not found. Request ID: ${getRequestIdForResponse(req)}`);
}

function expressErrorBoundary(error, req, res, next) {
  if (error instanceof multer.MulterError) {
    const errorCode = getField(error, 'code');
    const statusCode = MULTIPART_PAYLOAD_LIMIT_CODES.has(errorCode) ? 413 : 400;
    logRequestWarning(req, 'Rejected multipart form payload.', {
      code: errorCode,
      field: getField(error, 'field'),
      statusCode,
    });

    if (headersWereSent(res)) {
      safeNext(next, error);
      return;
    }

    sendPlainText(res, statusCode, `Invalid form payload. Request ID: ${getRequestIdForResponse(req)}`);
    return;
  }

  logRequestError(req, 'Unhandled Express route error.', error, {
    statusCode: headersWereSent(res) ? getResponseStatusCode(res) : 500,
  });

  if (headersWereSent(res)) {
    safeNext(next, error);
    return;
  }

  sendPlainText(res, 500, `Internal server error. Request ID: ${getRequestIdForResponse(req)}`);
}

function registerServerHandler(server, eventName, handler) {
  callMethod(server, 'on', [eventName, handler]);
}

function unregisterServerHandler(server, eventName, handler) {
  callMethod(server, 'off', [eventName, handler]);
}

function registerOneTimeServerHandler(server, eventName, handler) {
  callMethod(server, 'once', [eventName, handler]);
}

function isSocketDestroyed(socket) {
  return getField(socket, 'destroyed', true) === true;
}

function destroySocket(socket) {
  if (!socket || isSocketDestroyed(socket)) return;
  try {
    const destroy = getMethod(socket, 'destroy');
    if (destroy) destroy.call(socket);
  } catch (destroyError) {
    serverLogger.error('server', 'Error destroying client socket.', destroyError);
  }
}

function endSocket(socket, payload) {
  if (!socket || isSocketDestroyed(socket)) return;
  if (getField(socket, 'writable', false) === true) {
    const result = callMethod(socket, 'end', [payload], false);
    if (result !== false) return;
  }
  destroySocket(socket);
}

function attachServerErrorHandlers(server) {
  registerServerHandler(server, 'error', (error) => {
    serverLogger.error('server', 'HTTPS server error.', error);
  });

  registerServerHandler(server, 'clientError', (error, socket) => {
    const errorCode = getField(error, 'code');
    if (errorCode === 'ERR_SSL_SSL/TLS_ALERT_CERTIFICATE_UNKNOWN' || errorCode === 'ECONNRESET') {
      destroySocket(socket);
      return;
    }

    serverLogger.warn('server', 'Client connection error.', {
      code: errorCode,
      message: getField(error, 'message'),
    });
    endSocket(socket, 'HTTP/1.1 400 Bad Request\r\n\r\n');
  });
}

function serverIsListening(server) {
  return getField(server, 'listening', false) === true;
}

function getServerAddress(server) {
  return callMethod(server, 'address', [], null);
}

function listen(server, port) {
  if (serverIsListening(server)) {
    return server;
  }

  return new Promise((resolve, reject) => {
    const onError = (error) => {
      serverLogger.error('server', 'Failed to start server.', error, { port });
      reject(error);
    };

    registerOneTimeServerHandler(server, 'error', onError);
    const serverListen = getMethod(server, 'listen');
    if (!serverListen) {
      unregisterServerHandler(server, 'error', onError);
      reject(new Error('HTTPS server does not expose a listen method.'));
      return;
    }

    try {
      serverListen.call(server, port, () => {
        unregisterServerHandler(server, 'error', onError);
        const address = getServerAddress(server);
        const actualPort = typeof address === 'object' && address ? address.port : port;
        serverLogger.info('server', `Express HTTPS server listening on https://localhost:${actualPort}`, {
          features: [
            'HTTPS',
            `Socket.IO namespaces: ${SOCKET_NS_COUNTER}, ${SOCKET_NS_CHAT}, ${SOCKET_NS_UPDATES}`,
            'Todo API endpoints',
            'Streaming support',
          ],
        });
        resolve(server);
      });
    } catch (error) {
      unregisterServerHandler(server, 'error', onError);
      reject(error);
    }
  });
}

function getListeningPort(server) {
  const address = getServerAddress(server);
  return typeof address === 'object' && address ? address.port : null;
}

function getRequestedPort(port) {
  return parseBoundedInteger(port, { min: 0, max: 65535, defaultValue: null });
}

function normalizeListenTarget(port) {
  const requestedPort = getRequestedPort(port);
  if (requestedPort !== null) return requestedPort;

  throw new TypeError(`Invalid port "${safeString(port, '[Unstringifiable]')}". Expected an integer from 0 through 65535.`);
}

function safeClearTimer(timerId) {
  try {
    clearTimeout(timerId);
  } catch (error) {
    serverLogger.warn('server', 'Failed to clear shutdown timeout.', { message: getField(error, 'message') });
  }
}

function safeSetTimer(callback, delayMs) {
  try {
    return setTimeout(callback, delayMs);
  } catch (error) {
    serverLogger.error('server', 'Failed to schedule shutdown timeout.', error);
    return null;
  }
}

function closeAllHttpConnections(server) {
  callMethod(server, 'closeAllConnections');
}

function closeIdleHttpConnections(server) {
  callMethod(server, 'closeIdleConnections');
}

function safeExit(exit, exitCode) {
  safeCall(exit, [exitCode]);
}

function closeSharedServer(exit) {
  const runtime = sharedRuntime;
  if (!getField(runtime, 'server')) {
    safeExit(exit, 0);
    return;
  }

  const { server, socketServer } = runtime;
  let settled = false;

  const finish = (exitCode = 0) => {
    if (settled) return;
    settled = true;
    safeClearTimer(timeoutId);
    if (sharedRuntime === runtime) {
      sharedRuntime = null;
    }
    safeExit(exit, exitCode);
  };

  const timeoutId = safeSetTimer(() => {
    serverLogger.warn('server', 'Timed out waiting for graceful shutdown. Forcing open HTTP connections closed.', {
      timeoutMs: getShutdownTimeoutMs(),
    });
    closeAllHttpConnections(server);
    finish(1);
  }, getShutdownTimeoutMs());

  const closeHttpServer = () => {
    if (!serverIsListening(server)) {
      finish(0);
      return;
    }

    try {
      const closeServer = getMethod(server, 'close');
      if (!closeServer) {
        serverLogger.error('server', 'HTTP server does not expose a close method.');
        finish(1);
        return;
      }

      closeServer.call(server, (error) => {
        if (error) {
          serverLogger.error('server', 'HTTP server close failed.', error);
          finish(1);
          return;
        }

        serverLogger.info('server', 'HTTP server closed.');
        finish(0);
      });
      closeIdleHttpConnections(server);
    } catch (error) {
      if (getField(error, 'code') === 'ERR_SERVER_NOT_RUNNING') {
        finish(0);
        return;
      }

      serverLogger.error('server', 'HTTP server close threw unexpectedly.', error);
      finish(1);
    }
  };

  if (socketServer) {
    try {
      const closeSocketServer = getMethod(socketServer, 'close');
      if (!closeSocketServer) {
        serverLogger.error('server', 'Socket.IO server does not expose a close method.');
        closeHttpServer();
        return;
      }

      closeSocketServer.call(socketServer, () => {
        serverLogger.info('server', 'Socket.IO server closed.');
        closeHttpServer();
      });
      return;
    } catch (error) {
      serverLogger.error('server', 'Socket.IO server close failed.', error);
    }
  }

  closeHttpServer();
}

function createUploadMiddleware() {
  return multer({
    limits: {
      fieldSize: MULTIPART_FIELD_SIZE_LIMIT_BYTES,
      fields: MULTIPART_FIELD_COUNT_LIMIT,
      files: 0,
      parts: MULTIPART_PART_COUNT_LIMIT,
    },
  });
}

/**
 * Creates an Express app without starting TLS, Socket.IO, or process-level handlers.
 *
 * @param {object} [options]
 * @param {Function} [options.getSocketServer]
 * @returns {import('express').Express}
 */
export function createApp({ getSocketServer = null } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const upload = createUploadMiddleware();
  const resolveSocketServer = () => (
    getSocketServer ? getSocketServer() : app.locals.htmlexSocketServer
  );

  // Serve static files from the PUBLIC_DIR directory.
  app.use(requestContext);
  app.use(express.static(path.join(SRC_DIR, PUBLIC_DIR)));

  // Default root route to serve an index page.
  app.get('/', routeBoundary('root.index', async (req, res) => {
    const indexPath = path.join(SRC_DIR, PUBLIC_DIR, INDEX_FILE);
    try {
      await access(indexPath);
      const sendFileResult = callMethod(res, 'sendFile', [indexPath], false);
      if (sendFileResult !== false) return sendFileResult;
    } catch {
      // Fall through to the rendered fallback page.
    }
    return callMethod(res, 'send', [renderDefaultIndexPage()]);
  }));

  // Demo management route.
  app.get('/demos', routeBoundary('demos.list', loadAndRenderDemos));
  app.get('/:demoSlug/details', routeBoundary('demos.details', renderDemoDetails));

  // ------------------------------
  // Todo API Endpoints (Async)
  // ------------------------------
  app.get(TODO_INIT_DEMO, routeBoundary('todos.init', todos.getToDoWidget));
  app.post(TODO_CREATE_ROUTE, markRoute('todos.create'), upload.none(), routeBoundary('todos.create', todos.createTodo));
  app.get(TODO_LIST_ROUTE, routeBoundary('todos.list', todos.listTodos));
  app.get(TODO_ITEM_ROUTE, routeBoundary('todos.item', todos.getTodoItem));
  app.get(TODO_EDIT_ROUTE, routeBoundary('todos.edit', todos.getEditTodoForm));
  app.put(TODO_UPDATE_ROUTE, markRoute('todos.update'), upload.none(), routeBoundary('todos.update', todos.updateTodo));
  app.delete(TODO_DELETE_ROUTE, routeBoundary('todos.delete', todos.deleteTodo));

  // ------------------------------
  // Streaming Endpoints
  // ------------------------------
  app.get(ITEMS_DEMO_INIT, routeBoundary('streaming.itemsInit', streaming.infiniteScrollDemoInit));
  app.get(ITEMS_LOAD_MORE_ROUTE, routeBoundary('streaming.loadMoreItems', streaming.loadMoreItems));
  app.get(NOTIFICATIONS_DEMO_INIT, routeBoundary('streaming.notificationsInit', streaming.notificationsDemoInit));
  app.get(NOTIFICATIONS_ROUTE, routeBoundary('streaming.fetchNotification', streaming.fetchNotification));
  app.get(COUNTER_DEMO_INIT, routeBoundary('streaming.counterInit', streaming.incrementCounterDemoInit));
  app.get(COUNTER_INCREMENT_ROUTE, routeBoundary('streaming.incrementCounter', streaming.incrementCounter));
  app.get(MULTI_DEMO_INIT, routeBoundary('streaming.multiInit', streaming.multiFragmentDemoInit));
  app.get(MULTI_FRAGMENT_ROUTE, routeBoundary('streaming.multiFragment', streaming.multiFragment));
  app.get(SEQUENTIAL_DEMO_INIT, routeBoundary('streaming.sequentialInit', streaming.sequentialDemoInit));
  app.get(SEQUENTIAL_POLL_NEXT, routeBoundary('streaming.sequentialNext', streaming.sequentialNext));
  app.get(PROCESS_DEMO_INIT, routeBoundary('streaming.processInit', streaming.processInit));
  app.get(PROCESS_STEP1_ROUTE, routeBoundary('streaming.processStep1', streaming.processStep1));
  app.get(PROCESS_STEP2_ROUTE, routeBoundary('streaming.processStep2', streaming.processStep2));
  app.get(PROCESS_STEP3_ROUTE, routeBoundary('streaming.processStep3', streaming.processStep3));
  app.get(PROCESS_STEP4_ROUTE, routeBoundary('streaming.processStep4', streaming.processStep4));
  app.get(PROCESS_STEP5_ROUTE, routeBoundary('streaming.processStep5', streaming.processStep5));
  app.get(DEMO_DEMO_INIT, routeBoundary('streaming.demoInit', streaming.demoInit));
  app.get(DEMO_LOADING_ROUTE, routeBoundary('streaming.demoLoading', streaming.demoLoading));
  app.get(SSE_DEMO_INIT, routeBoundary('streaming.sseInit', streaming.sseDemoInit));
  app.get(SSE_SUBSCRIBE_ROUTE, routeBoundary('streaming.sseSubscribe', streaming.sseSubscribe));
  app.get(SSE_SUBSCRIBE_MESSAGE_ROUTE, routeBoundary('streaming.sseSubscribeMessage', streaming.sseSubscribeMessage));
  app.get(UPDATES_DEMO_INIT, routeBoundary('streaming.updatesInit', streaming.webSocketUpdatesDemoInit));
  app.get(POLLING_DEMO_INIT, routeBoundary('streaming.pollingInit', streaming.pollingDemoInit));
  app.get(POLLING_TICK_ROUTE, routeBoundary('streaming.pollingTick', streaming.pollingTick));
  app.get(HOVER_DEMO_INIT, routeBoundary('streaming.hoverInit', streaming.hoverDemoInit));
  app.get(HOVER_MESSAGE_ROUTE, routeBoundary('streaming.hoverMessage', streaming.hoverMessage));

  // ------------------------------
  // Chat endpoints
  // ------------------------------
  app.get(CHAT_DEMO_INIT, routeBoundary('streaming.chatInit', streaming.chatDemoInit));
  app.post(CHAT_SEND_ROUTE, markRoute('chat.send'), upload.none(), routeBoundary('chat.send', async (req, res) => {
    const socketServer = resolveSocketServer();
    if (!socketServer) {
      throw new Error('Socket.IO server is not initialized.');
    }

    await chat.sendChatMessage(req, res, socketServer.of(SOCKET_NS_CHAT));
  }));

  app.use(notFoundBoundary);
  app.use(expressErrorBoundary);

  return app;
}

/**
 * Creates a TLS server and Socket.IO namespaces for a supplied Express app.
 *
 * @param {object} [options]
 * @param {import('express').Express} [options.app]
 * @param {string} [options.projectRoot]
 * @returns {Promise<{app: import('express').Express, server: import('node:https').Server, socketServer: SocketIOServer}>}
 */
export async function createHttpsServer({ app: expressApp = null, projectRoot = PROJECT_ROOT } = {}) {
  const httpsOptions = await getHttpsOptions(projectRoot);
  let socketServer;
  const serverApp = expressApp || createApp({ getSocketServer: () => socketServer });
  const server = https.createServer(httpsOptions, serverApp);
  socketServer = new SocketIOServer(server);
  setField(serverApp.locals, 'htmlexSocketServer', socketServer);
  setupSocketNamespaces(socketServer, chat.getChatHistory, chat.createChatMessage, chat.storeChatMessage);
  attachServerErrorHandlers(server);

  registerServerHandler(server, 'close', () => {
    if (getField(sharedRuntime, 'server') === server) {
      sharedRuntime = null;
    }
    if (getField(serverApp.locals, 'htmlexSocketServer') === socketServer) {
      deleteField(serverApp.locals, 'htmlexSocketServer');
    }
  });

  return { app: serverApp, server, socketServer };
}

export const app = createApp();

// ------------------------------
// Start Server
// ------------------------------
export async function startServer(port = PORT) {
  const listenTarget = normalizeListenTarget(port);
  const currentServer = getField(sharedRuntime, 'server');
  if (serverIsListening(currentServer)) {
    const currentPort = getListeningPort(currentServer);
    const requestedPort = getRequestedPort(listenTarget);
    if (requestedPort !== null && requestedPort !== 0 && currentPort !== requestedPort) {
      throw new Error(
        `HTMLeX server is already listening on port ${currentPort}; requested port ${requestedPort}.`
      );
    }
    return currentServer;
  }

  if (!sharedRuntime) {
    sharedRuntime = await createHttpsServer({ app });
  }

  return listen(sharedRuntime.server, listenTarget);
}

export function stopServer({ exit = process.exit } = {}) {
  closeSharedServer(exit);
}

export function installProcessHandlers({ exit = process.exit } = {}) {
  if (processHandlersInstalled) return;
  processHandlersInstalled = true;

  registerServerHandler(process, 'uncaughtException', (error) => {
    serverLogger.fatal('process', 'Uncaught exception. Exiting process.', error);
    safeExit(exit, 1);
  });
  registerServerHandler(process, 'unhandledRejection', (reason, promise) => {
    serverLogger.error('process', 'Unhandled promise rejection.', reason, { promise });
  });
  registerServerHandler(process, 'SIGTERM', () => {
    serverLogger.info('process', 'SIGTERM received. Closing HTTP server.');
    closeSharedServer(exit);
  });
  registerServerHandler(process, 'SIGINT', () => {
    serverLogger.info('process', 'SIGINT received. Closing HTTP server.');
    closeSharedServer(exit);
  });
}

if (process.argv[1] === import.meta.filename) {
  installProcessHandlers();
  try {
    await startServer();
  } catch (error) {
    serverLogger.fatal('server', 'Failed to start server.', error);
    safeExit(process.exit, 1);
  }
}

export default {
  app,
  createApp,
  createHttpsServer,
  installProcessHandlers,
  startServer,
  stopServer
};
