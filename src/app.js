// ./src/app.js

import express from 'express';
import createHttp2Express from 'http2-express-bridge';
import path from 'path';
import fs from 'fs';
import http2 from 'http2';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { renderDefaultIndexPage } from './components/Components.js';

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
// SSE Notifications
const NOTIFICATIONS_DEMO_INIT = "/notifications/init"
const NOTIFICATIONS_ROUTE = '/notifications';
// click counter
const COUNTER_DEMO_INIT = '/counter/init';
const COUNTER_INCREMENT_ROUTE = '/counter/increment';
// Single request, multiple targets
const MULTI_DEMO_INIT = "/multi/init"
const MULTI_FRAGMENT_ROUTE = '/multi/fragment';
// Polling
const SEQUENTIAL_POLL_ROUTE = '/sequential/poll';
// Sequential FIFO with pacing
const PROCESS_STEP1_ROUTE = '/process/step1';
const PROCESS_STEP2_ROUTE = '/process/step2';
const PROCESS_STEP3_ROUTE = '/process/step3';
const PROCESS_STEP4_ROUTE = '/process/step4';
const PROCESS_STEP5_ROUTE = '/process/step5';
// Demo route handling
const DEMO_LOADING_ROUTE = '/demo/loading';
// Server Sent Events
const SSE_SUBSCRIBE_ROUTE = '/sse/subscribe';
const SSE_SUBSCRIBE_MESSAGE_ROUTE = '/sse/subscribe/message';

// Chat route
const CHAT_SEND_ROUTE = '/chat/send';

// TLS/Certificate file paths
const CERT_DIR = 'cert';
const TLS_KEY_FILE = 'localhost+2-key.pem';
const TLS_CERT_FILE = 'localhost+2.pem';

// Socket.IO namespaces
const SOCKET_NS_COUNTER = '/counter';
const SOCKET_NS_CHAT = '/chat';
const SOCKET_NS_UPDATES = '/updates';

// Global error handling
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

// Create an Express app using the HTTP/2 bridge.
const app = createHttp2Express(express);

// Get __dirname in ES modules.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from the PUBLIC_DIR directory.
app.use(express.static(path.join(__dirname, PUBLIC_DIR)));

// Default root route to serve an index page.
app.get('/', async (req, res) => {
  const indexPath = path.join(__dirname, PUBLIC_DIR, INDEX_FILE);
  try {
    await fs.promises.access(indexPath);
    return res.sendFile(indexPath);
  } catch (err) {
    return res.send(renderDefaultIndexPage());
  }
});

// Configure multer for form data processing.
const upload = multer();

// Demo management code load demo menu
app.get('/demos', loadAndRenderDemos)

// ------------------------------
// Todo API Endpoints (Async)
// ------------------------------
app.get(TODO_INIT_DEMO, todos.getToDoWidget);
app.post(TODO_CREATE_ROUTE, upload.none(), todos.createTodo);
app.get(TODO_LIST_ROUTE, todos.listTodos);
app.get(TODO_ITEM_ROUTE, todos.getTodoItem);
app.get(TODO_EDIT_ROUTE, todos.getEditTodoForm);
app.put(TODO_UPDATE_ROUTE, upload.none(), todos.updateTodo);
app.delete(TODO_DELETE_ROUTE, todos.deleteTodo);

// ------------------------------
// Streaming Endpoints (HTTP/2)
// ------------------------------
app.get(ITEMS_LOAD_MORE_ROUTE, streaming.loadMoreItems);

// SS notifications
app.get(NOTIFICATIONS_DEMO_INIT, streaming.notificationsDemoInit);
app.get(NOTIFICATIONS_ROUTE, streaming.fetchNotification);

// Click Counter Demo
app.get(COUNTER_DEMO_INIT, streaming.incrementCounterDemoInit);
app.get(COUNTER_INCREMENT_ROUTE, streaming.incrementCounter);

// Multiple targets
app.get(MULTI_DEMO_INIT, streaming.multiFragmentDemoInit);
app.get(MULTI_FRAGMENT_ROUTE, streaming.multiFragment);

// FIFO and intra request wait demo
app.get(SEQUENTIAL_POLL_ROUTE, streaming.sequentialPoll);

// Signal Chaining
app.get(PROCESS_STEP1_ROUTE, streaming.processStep1);
app.get(PROCESS_STEP2_ROUTE, streaming.processStep2);
app.get(PROCESS_STEP3_ROUTE, streaming.processStep3);
app.get(PROCESS_STEP4_ROUTE, streaming.processStep4);
app.get(PROCESS_STEP5_ROUTE, streaming.processStep5);
app.get(DEMO_LOADING_ROUTE, streaming.demoLoading);

// Server Sent events
app.get(SSE_SUBSCRIBE_ROUTE, streaming.sseSubscribe);
app.get(SSE_SUBSCRIBE_MESSAGE_ROUTE, streaming.sseSubscribeMessage);

// ------------------------------
// Chat Endpoint
// ------------------------------
let io; // Socket.IO instance will be assigned later.
app.post(CHAT_SEND_ROUTE, upload.none(), async (req, res) => {
  await chat.sendChatMessage(req, res, io.of(SOCKET_NS_CHAT));
});

// ------------------------------
// Server Setup with TLS (HTTP/2 with HTTP/1 fallback)
// ------------------------------
const http2Options = {
  key: fs.readFileSync(path.join(__dirname, CERT_DIR, TLS_KEY_FILE)),
  cert: fs.readFileSync(path.join(__dirname, CERT_DIR, TLS_CERT_FILE)),
  allowHTTP1: true // Enables fallback to HTTP/1.1 (and thus our Express bridge)
};

const server = http2.createSecureServer(http2Options, app);

// ------------------------------
// Socket.IO Setup
// ------------------------------
io = new SocketIOServer(server, {
  // Optional Socket.IO options
});
setupSocketNamespaces(io, chat.getChatHistory);

// ------------------------------
// Start Server
// ------------------------------
server.on('error', (err) => {
  console.error('Server error:', err);
});
server.on('clientError', (err, socket) => {
  console.error('Client connection error:', err);
  if (socket && socket.writable && !socket.destroyed) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  } else if (socket && !socket.destroyed) {
    try {
      socket.destroy();
    } catch (destroyError) {
      console.error("Error destroying socket:", destroyError);
    }
  }
});

export function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    const listener = server.listen(port, (err) => {
      if (err) {
        console.error('Failed to start server:', err);
        reject(err);
        return;
      }
      console.log(`Express HTTP/2 server (local dev) listening on https://localhost:${port}`);
      console.log('Server Features:');
      console.log('- HTTP/2 Enabled with HTTP/1 fallback (via http2-express-bridge)');
      console.log(`- Socket.IO Namespaces: ${SOCKET_NS_COUNTER}, ${SOCKET_NS_CHAT}, ${SOCKET_NS_UPDATES}`);
      console.log('- Todo API Endpoints');
      console.log('- Streaming Support');
      resolve(server);
    });
    listener.on('error', err => {
      console.error("Server LISTENER error", err);
    });
  });
}

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default server;
