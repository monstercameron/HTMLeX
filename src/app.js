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
const SLOW_REQUEST_THRESHOLD_MS = Number.parseInt(process.env.HTMLEX_SLOW_REQUEST_MS || '1000', 10);
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

function getShutdownTimeoutMs() {
  const shutdownTimeoutMs = Number.parseInt(
    process.env.HTMLEX_SHUTDOWN_TIMEOUT_MS || String(DEFAULT_SHUTDOWN_TIMEOUT_MS),
    10
  );
  return Number.isFinite(shutdownTimeoutMs) && shutdownTimeoutMs > 0
    ? shutdownTimeoutMs
    : DEFAULT_SHUTDOWN_TIMEOUT_MS;
}

function getRequestId(req) {
  const incomingRequestId = req.get('x-request-id')?.trim();
  return incomingRequestId && REQUEST_ID_PATTERN.test(incomingRequestId)
    ? incomingRequestId
    : randomUUID();
}

function requestContext(req, res, next) {
  req.requestId = getRequestId(req);
  res.setHeader('X-Request-Id', req.requestId);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }

  const startedAt = performance.now();
  res.on('finish', () => {
    const durationMs = Math.round(performance.now() - startedAt);
    const details = {
      statusCode: res.statusCode,
      durationMs,
    };

    if (res.statusCode >= 500 && !req._htmlexIssueLogged) {
      logRequestError(req, `Request completed with HTTP ${res.statusCode}.`, null, details);
      return;
    }

    if (res.statusCode >= 400 && !req._htmlexIssueLogged) {
      logRequestWarning(req, `Request completed with HTTP ${res.statusCode}.`, details);
      return;
    }

    if (durationMs >= SLOW_REQUEST_THRESHOLD_MS) {
      logRequestWarning(req, 'Slow request completed.', details);
    }
  });

  next();
}

function routeBoundary(routeName, handler) {
  return async (req, res, next) => {
    req.routeName = routeName;
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function markRoute(routeName) {
  return (req, res, next) => {
    req.routeName = routeName;
    next();
  };
}

function notFoundBoundary(req, res) {
  logRequestWarning(req, 'No route matched request.', { statusCode: 404 });
  res.status(404).type('text/plain').send(`Not found. Request ID: ${req.requestId}`);
}

function expressErrorBoundary(error, req, res, next) {
  if (error instanceof multer.MulterError) {
    const statusCode = MULTIPART_PAYLOAD_LIMIT_CODES.has(error.code) ? 413 : 400;
    logRequestWarning(req, 'Rejected multipart form payload.', {
      code: error.code,
      field: error.field,
      statusCode,
    });

    if (res.headersSent) {
      next(error);
      return;
    }

    res.status(statusCode).type('text/plain').send(`Invalid form payload. Request ID: ${req.requestId}`);
    return;
  }

  logRequestError(req, 'Unhandled Express route error.', error, {
    statusCode: res.headersSent ? res.statusCode : 500,
  });

  if (res.headersSent) {
    next(error);
    return;
  }

  res.status(500).type('text/plain').send(`Internal server error. Request ID: ${req.requestId}`);
}

function attachServerErrorHandlers(server) {
  server.on('error', (error) => {
    serverLogger.error('server', 'HTTPS server error.', error);
  });

  server.on('clientError', (error, socket) => {
    if (error?.code === 'ERR_SSL_SSL/TLS_ALERT_CERTIFICATE_UNKNOWN' || error?.code === 'ECONNRESET') {
      if (socket && !socket.destroyed) socket.destroy();
      return;
    }

    serverLogger.warn('server', 'Client connection error.', {
      code: error?.code,
      message: error?.message,
    });
    if (socket && socket.writable && !socket.destroyed) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    } else if (socket && !socket.destroyed) {
      try {
        socket.destroy();
      } catch (destroyError) {
        serverLogger.error('server', 'Error destroying client socket.', destroyError);
      }
    }
  });
}

function listen(server, port) {
  if (server.listening) {
    return server;
  }

  return new Promise((resolve, reject) => {
    const onError = (error) => {
      serverLogger.error('server', 'Failed to start server.', error, { port });
      reject(error);
    };

    server.once('error', onError);
    server.listen(port, () => {
      server.off('error', onError);
      const address = server.address();
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
  });
}

function getListeningPort(server) {
  const address = server.address();
  return typeof address === 'object' && address ? address.port : null;
}

function getRequestedPort(port) {
  const requestedPort = Number.parseInt(port, 10);
  return Number.isFinite(requestedPort) ? requestedPort : null;
}

function closeSharedServer(exit) {
  const runtime = sharedRuntime;
  if (!runtime?.server) {
    exit(0);
    return;
  }

  const { server, socketServer } = runtime;
  let settled = false;

  const finish = (exitCode = 0) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutId);
    if (sharedRuntime === runtime) {
      sharedRuntime = null;
    }
    exit(exitCode);
  };

  const timeoutId = setTimeout(() => {
    serverLogger.warn('server', 'Timed out waiting for graceful shutdown. Forcing open HTTP connections closed.', {
      timeoutMs: getShutdownTimeoutMs(),
    });
    server.closeAllConnections?.();
    finish(1);
  }, getShutdownTimeoutMs());

  const closeHttpServer = () => {
    if (!server.listening) {
      finish(0);
      return;
    }

    try {
      server.close((error) => {
        if (error) {
          serverLogger.error('server', 'HTTP server close failed.', error);
          finish(1);
          return;
        }

        serverLogger.info('server', 'HTTP server closed.');
        finish(0);
      });
      server.closeIdleConnections?.();
    } catch (error) {
      if (error?.code === 'ERR_SERVER_NOT_RUNNING') {
        finish(0);
        return;
      }

      serverLogger.error('server', 'HTTP server close threw unexpectedly.', error);
      finish(1);
    }
  };

  if (socketServer) {
    try {
      socketServer.close(() => {
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
      return res.sendFile(indexPath);
    } catch {
      return res.send(renderDefaultIndexPage());
    }
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
  serverApp.locals.htmlexSocketServer = socketServer;
  setupSocketNamespaces(socketServer, chat.getChatHistory, chat.recordChatMessage);
  attachServerErrorHandlers(server);

  server.on('close', () => {
    if (sharedRuntime?.server === server) {
      sharedRuntime = null;
    }
    if (serverApp.locals.htmlexSocketServer === socketServer) {
      delete serverApp.locals.htmlexSocketServer;
    }
  });

  return { app: serverApp, server, socketServer };
}

export const app = createApp();

// ------------------------------
// Start Server
// ------------------------------
export async function startServer(port = PORT) {
  if (sharedRuntime?.server?.listening) {
    const currentPort = getListeningPort(sharedRuntime.server);
    const requestedPort = getRequestedPort(port);
    if (requestedPort && currentPort !== requestedPort) {
      throw new Error(
        `HTMLeX server is already listening on port ${currentPort}; requested port ${requestedPort}.`
      );
    }
    return sharedRuntime.server;
  }

  if (!sharedRuntime) {
    sharedRuntime = await createHttpsServer({ app });
  }

  return listen(sharedRuntime.server, port);
}

export function stopServer({ exit = process.exit } = {}) {
  closeSharedServer(exit);
}

export function installProcessHandlers({ exit = process.exit } = {}) {
  if (processHandlersInstalled) return;
  processHandlersInstalled = true;

  process.on('uncaughtException', (error) => {
    serverLogger.fatal('process', 'Uncaught exception. Exiting process.', error);
    exit(1);
  });
  process.on('unhandledRejection', (reason, promise) => {
    serverLogger.error('process', 'Unhandled promise rejection.', reason, { promise });
  });
  process.on('SIGTERM', () => {
    serverLogger.info('process', 'SIGTERM received. Closing HTTP server.');
    closeSharedServer(exit);
  });
  process.on('SIGINT', () => {
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
    process.exit(1);
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
