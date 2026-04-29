/**
 * @fileoverview Socket.IO namespace setup for counter, chat, and live updates.
 * @module features/socket
 */

import { logFeatureError, logFeatureWarning } from '../serverLogger.js';

function socketDelay(ms) {
  return process.env.HTMLEX_TEST_FAST === '1' ? Math.min(ms, 25) : ms;
}

function normalizeChatText(message) {
  return String(message?.text ?? message?.message ?? '').trim().slice(0, 1000);
}

function normalizeUsername(message) {
  return String(message?.username ?? 'Anonymous').trim().slice(0, 50) || 'Anonymous';
}

/**
 * Sets up the '/counter' namespace to emit an incrementing counter every second.
 * @param {import('socket.io').Server} socketServer - The Socket.IO server instance.
 */
export function setupCounterNamespace(socketServer) {
  const counterNamespace = socketServer.of('/counter');

  counterNamespace.on('connection', (socket) => {
    let count = 0;
    const intervalId = setInterval(() => {
      count += 1;
      socket.emit('counter', count);
    }, socketDelay(1000));

    socket.on('disconnect', () => clearInterval(intervalId));
    socket.on('error', (error) => {
      logFeatureError('socket.counter', 'Counter namespace socket error.', error, { socketId: socket.id });
    });
  });
}

/**
 * Sets up the '/chat' namespace and broadcasts new chat messages.
 * @param {import('socket.io').Server} socketServer - The Socket.IO server instance.
 * @param {Function} getChatHistory - Returns the current chat history.
 */
export function setupChatNamespace(socketServer, getChatHistory) {
  const chatNamespace = socketServer.of('/chat');

  chatNamespace.on('connection', (socket) => {
    socket.emit('chatHistory', { history: getChatHistory() });

    socket.on('chatMessage', (message) => {
      const text = normalizeChatText(message);
      if (!text) {
        logFeatureWarning('socket.chat', 'Ignored empty chat socket message.', { socketId: socket.id });
        return;
      }

      chatNamespace.emit('chatMessage', {
        id: Date.now(),
        username: normalizeUsername(message),
        text
      });
    });
    socket.on('error', (error) => {
      logFeatureError('socket.chat', 'Chat namespace socket error.', error, { socketId: socket.id });
    });
  });
}

/**
 * Sets up the '/updates' namespace to emit live updates every three seconds.
 * @param {import('socket.io').Server} socketServer - The Socket.IO server instance.
 */
export function setupUpdatesNamespace(socketServer) {
  const updatesNamespace = socketServer.of('/updates');

  updatesNamespace.on('connection', (socket) => {
    const intervalId = setInterval(() => {
      const updateHtml = `<div class="surface-muted p-3 small mb-2">Live update at ${new Date().toLocaleTimeString()}</div>`;
      socket.emit('update', updateHtml);
    }, socketDelay(3000));

    socket.on('disconnect', () => clearInterval(intervalId));
    socket.on('error', (error) => {
      logFeatureError('socket.updates', 'Updates namespace socket error.', error, { socketId: socket.id });
    });
  });
}

/**
 * Sets up all Socket.IO namespaces.
 * @param {import('socket.io').Server} socketServer - The Socket.IO server instance.
 * @param {Function} getChatHistory - Returns the current chat history.
 */
export function setupSocketNamespaces(socketServer, getChatHistory) {
  setupCounterNamespace(socketServer);
  setupChatNamespace(socketServer, getChatHistory);
  setupUpdatesNamespace(socketServer);
}
