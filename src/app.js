// ./src/app.js

import express from 'express';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import multer from 'multer';
import { renderDefaultIndexPage } from './components/Components.js';
import { getHttpsOptions } from './certificates.js';
import { logRequestError, logRequestWarning, serverLogger } from './serverLogger.js';

import { Server as SocketIOServer } from 'socket.io';

// Domain features
import * as todos from './features/todos.js';
import * as streaming from './features/streaming.js';
import * as chat from './features/chat.js';
import { setupSocketNamespaces } from './features/socket.js';
import { loadAndRenderDemos } from './features/demos.js';

/* =======================
   CONSTANTS / MAGIC STRINGS
   ======================= */
const PORT = process.env.PORT || 5500;
const PUBLIC_DIR = 'public';
const INDEX_FILE = 'index.html';
const SRC_DIR = import.meta.dirname;

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

// Global error handling
process.on('uncaughtException', (error) => {
  serverLogger.fatal('process', 'Uncaught exception. Exiting process.', error);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  serverLogger.error('process', 'Unhandled promise rejection.', reason, { promise });
});

// Create the Express app.
const app = express();

function getRequestId(req) {
  const incomingRequestId = req.get('x-request-id')?.trim();
  return incomingRequestId ? incomingRequestId.slice(0, 128) : randomUUID();
}

function requestContext(req, res, next) {
  req.requestId = getRequestId(req);
  res.setHeader('X-Request-Id', req.requestId);

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
  logRequestError(req, 'Unhandled Express route error.', error, {
    statusCode: res.headersSent ? res.statusCode : 500,
  });

  if (res.headersSent) {
    next(error);
    return;
  }

  res.status(500).type('text/plain').send(`Internal server error. Request ID: ${req.requestId}`);
}

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

// Configure multer for form data processing.
const upload = multer();

// Demo management route.
app.get('/demos', routeBoundary('demos.list', loadAndRenderDemos));

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

// Server-sent notifications
app.get(NOTIFICATIONS_DEMO_INIT, routeBoundary('streaming.notificationsInit', streaming.notificationsDemoInit));
app.get(NOTIFICATIONS_ROUTE, routeBoundary('streaming.fetchNotification', streaming.fetchNotification));

// Click Counter Demo
app.get(COUNTER_DEMO_INIT, routeBoundary('streaming.counterInit', streaming.incrementCounterDemoInit));
app.get(COUNTER_INCREMENT_ROUTE, routeBoundary('streaming.incrementCounter', streaming.incrementCounter));

// Multiple targets
app.get(MULTI_DEMO_INIT, routeBoundary('streaming.multiInit', streaming.multiFragmentDemoInit));
app.get(MULTI_FRAGMENT_ROUTE, routeBoundary('streaming.multiFragment', streaming.multiFragment));

// FIFO and intra request wait demo
app.get(SEQUENTIAL_DEMO_INIT, routeBoundary('streaming.sequentialInit', streaming.sequentialDemoInit));
app.get(SEQUENTIAL_POLL_NEXT, routeBoundary('streaming.sequentialNext', streaming.sequentialNext));

// Signal Chaining
app.get(PROCESS_DEMO_INIT, routeBoundary('streaming.processInit', streaming.processInit));
app.get(PROCESS_STEP1_ROUTE, routeBoundary('streaming.processStep1', streaming.processStep1));
app.get(PROCESS_STEP2_ROUTE, routeBoundary('streaming.processStep2', streaming.processStep2));
app.get(PROCESS_STEP3_ROUTE, routeBoundary('streaming.processStep3', streaming.processStep3));
app.get(PROCESS_STEP4_ROUTE, routeBoundary('streaming.processStep4', streaming.processStep4));
app.get(PROCESS_STEP5_ROUTE, routeBoundary('streaming.processStep5', streaming.processStep5));

// Handling loading state.
app.get(DEMO_DEMO_INIT, routeBoundary('streaming.demoInit', streaming.demoInit));
app.get(DEMO_LOADING_ROUTE, routeBoundary('streaming.demoLoading', streaming.demoLoading));

// Server-sent events
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
let socketServer;
app.get(CHAT_DEMO_INIT, routeBoundary('streaming.chatInit', streaming.chatDemoInit));
app.post(CHAT_SEND_ROUTE, markRoute('chat.send'), upload.none(), routeBoundary('chat.send', async (req, res) => {
  await chat.sendChatMessage(req, res, socketServer.of(SOCKET_NS_CHAT));
}));

app.use(notFoundBoundary);
app.use(expressErrorBoundary);

// ------------------------------
// Server Setup with TLS
// ------------------------------
const projectRoot = path.resolve(SRC_DIR, '..');
const httpsOptions = await getHttpsOptions(projectRoot);

const server = https.createServer(httpsOptions, app);

// ------------------------------
// Socket.IO Setup
// ------------------------------
socketServer = new SocketIOServer(server);
setupSocketNamespaces(socketServer, chat.getChatHistory);

// ------------------------------
// Start Server
// ------------------------------
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

export function startServer(port = PORT) {
  if (server.listening) {
    return Promise.resolve(server);
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

process.on('SIGTERM', () => {
  serverLogger.info('process', 'SIGTERM received. Closing HTTP server.');
  server.close(() => {
    serverLogger.info('server', 'HTTP server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  serverLogger.info('process', 'SIGINT received. Closing HTTP server.');
  server.close(() => {
    serverLogger.info('server', 'HTTP server closed.');
    process.exit(0);
  });
});

if (process.argv[1] === import.meta.filename) {
  try {
    await startServer();
  } catch (error) {
    serverLogger.fatal('server', 'Failed to start server.', error);
    process.exit(1);
  }
}

export default server;
export { app };
