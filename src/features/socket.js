/**
 * @fileoverview Socket.IO namespace setup for counter, chat, and live updates.
 * @module features/socket
 */

import { logFeatureError, logFeatureWarning } from '../serverLogger.js';

let socketMessageSequence = 0;

function safeString(value, fallback = '') {
  try {
    return String(value ?? fallback);
  } catch {
    return fallback;
  }
}

function getObjectField(value, fieldName, fallback = undefined) {
  try {
    return value?.[fieldName] ?? fallback;
  } catch {
    return fallback;
  }
}

function getCurrentTimestamp() {
  try {
    const timestamp = Date.now();
    return Number.isSafeInteger(timestamp) ? timestamp : 0;
  } catch {
    return 0;
  }
}

function getSocketId(socket) {
  return safeString(getObjectField(socket, 'id', 'socket'), 'socket') || 'socket';
}

function socketDelay(ms) {
  return safeString(process.env.HTMLEX_TEST_FAST).trim() === '1' ? Math.min(ms, 25) : ms;
}

function getMessageTextValue(message) {
  const input = message && typeof message === 'object' ? message : {};
  const text = getObjectField(input, 'text', undefined);
  return text ?? getObjectField(input, 'message', '');
}

function normalizeChatText(message) {
  return safeString(getMessageTextValue(message)).trim().slice(0, 1000);
}

function normalizeUsername(message) {
  const input = message && typeof message === 'object' ? message : {};
  return safeString(getObjectField(input, 'username', 'Anonymous'), 'Anonymous').trim().slice(0, 50) || 'Anonymous';
}

function createSocketMessageId(socket) {
  return `${getCurrentTimestamp()}-${getSocketId(socket)}-${socketMessageSequence++}`;
}

function formatLiveUpdateTime() {
  try {
    return new Date().toLocaleTimeString();
  } catch {
    return 'now';
  }
}

function getSocketNamespace(socketServer, namespaceName, scope) {
  try {
    const of = getObjectField(socketServer, 'of', null);
    return typeof of === 'function' ? of.call(socketServer, namespaceName) : null;
  } catch (error) {
    logFeatureError(scope, `Failed to initialize "${namespaceName}" socket namespace.`, error);
    return null;
  }
}

function registerSocketHandler(target, eventName, callback, scope, details = {}) {
  try {
    const on = getObjectField(target, 'on', null);
    if (typeof on !== 'function') return false;
    on.call(target, eventName, callback);
    return true;
  } catch (error) {
    logFeatureError(scope, `Failed to register "${eventName}" socket handler.`, error, details);
    return false;
  }
}

function startSocketInterval(callback, delayMs, scope, details = {}) {
  try {
    const setIntervalHandler = getObjectField(globalThis, 'setInterval', null);
    return typeof setIntervalHandler === 'function'
      ? setIntervalHandler.call(globalThis, callback, delayMs)
      : null;
  } catch (error) {
    logFeatureError(scope, 'Failed to start socket interval.', error, details);
    return null;
  }
}

function clearSocketInterval(intervalId, scope, details = {}) {
  if (intervalId === null || intervalId === undefined) return;
  try {
    const clearIntervalHandler = getObjectField(globalThis, 'clearInterval', null);
    if (typeof clearIntervalHandler === 'function') {
      clearIntervalHandler.call(globalThis, intervalId);
    }
  } catch (error) {
    logFeatureError(scope, 'Failed to clear socket interval.', error, details);
  }
}

function emitSocketEvent(target, scope, eventName, payload, details = {}) {
  try {
    target.emit(eventName, payload);
    return true;
  } catch (error) {
    logFeatureError(scope, `Failed to emit "${eventName}" socket event.`, error, details);
    return false;
  }
}

/**
 * Sets up the '/counter' namespace to emit an incrementing counter every second.
 * @param {import('socket.io').Server} socketServer - The Socket.IO server instance.
 */
export function setupCounterNamespace(socketServer) {
  const counterNamespace = getSocketNamespace(socketServer, '/counter', 'socket.counter');
  if (!counterNamespace) return;

  registerSocketHandler(counterNamespace, 'connection', (socket) => {
    const socketId = getSocketId(socket);
    let count = 0;
    const intervalId = startSocketInterval(() => {
      count += 1;
      if (!emitSocketEvent(socket, 'socket.counter', 'counter', count, { socketId })) {
        clearSocketInterval(intervalId, 'socket.counter', { socketId });
      }
    }, socketDelay(1000));

    registerSocketHandler(socket, 'disconnect', () => clearSocketInterval(intervalId, 'socket.counter', { socketId }), 'socket.counter', { socketId });
    registerSocketHandler(socket, 'error', (error) => {
      logFeatureError('socket.counter', 'Counter namespace socket error.', error, { socketId });
    }, 'socket.counter', { socketId });
  }, 'socket.counter');
}

/**
 * Sets up the '/chat' namespace and broadcasts new chat messages.
 * @param {import('socket.io').Server} socketServer - The Socket.IO server instance.
 * @param {Function} getChatHistory - Returns the current chat history.
 * @param {Function} recordChatMessage - Persists and normalizes a new chat message, or prepares one when storeChatMessage is supplied.
 * @param {Function} storeChatMessage - Persists an already-normalized message after broadcast succeeds.
 */
export function setupChatNamespace(socketServer, getChatHistory, recordChatMessage = null, storeChatMessage = null) {
  const chatNamespace = getSocketNamespace(socketServer, '/chat', 'socket.chat');
  if (!chatNamespace) return;

  registerSocketHandler(chatNamespace, 'connection', (socket) => {
    const socketId = getSocketId(socket);
    let history = [];
    try {
      const currentHistory = typeof getChatHistory === 'function' ? getChatHistory() : [];
      history = Array.isArray(currentHistory) ? currentHistory : [];
    } catch (error) {
      logFeatureError('socket.chat', 'Failed to load chat history for socket connection.', error, {
        socketId
      });
    }

    emitSocketEvent(socket, 'socket.chat', 'chatHistory', { history }, { socketId });

    registerSocketHandler(socket, 'chatMessage', (message) => {
      const text = normalizeChatText(message);
      if (!text) {
        logFeatureWarning('socket.chat', 'Ignored empty chat socket message.', { socketId });
        return;
      }

      let chatMessage;
      try {
        chatMessage = typeof recordChatMessage === 'function'
          ? recordChatMessage({ username: normalizeUsername(message), text })
          : { id: createSocketMessageId(socket), username: normalizeUsername(message), text };
      } catch (error) {
        logFeatureError('socket.chat', 'Failed to record chat socket message.', error, { socketId });
        return;
      }
      if (!chatMessage) return;

      if (!emitSocketEvent(chatNamespace, 'socket.chat', 'chatMessage', chatMessage, { socketId })) {
        return;
      }

      if (typeof storeChatMessage === 'function') {
        try {
          storeChatMessage(chatMessage);
        } catch (error) {
          logFeatureError('socket.chat', 'Failed to store broadcast chat socket message.', error, { socketId });
        }
      }
    }, 'socket.chat', { socketId });
    registerSocketHandler(socket, 'error', (error) => {
      logFeatureError('socket.chat', 'Chat namespace socket error.', error, { socketId });
    }, 'socket.chat', { socketId });
  }, 'socket.chat');
}

/**
 * Sets up the '/updates' namespace to emit live updates every three seconds.
 * @param {import('socket.io').Server} socketServer - The Socket.IO server instance.
 */
export function setupUpdatesNamespace(socketServer) {
  const updatesNamespace = getSocketNamespace(socketServer, '/updates', 'socket.updates');
  if (!updatesNamespace) return;

  registerSocketHandler(updatesNamespace, 'connection', (socket) => {
    const socketId = getSocketId(socket);
    const intervalId = startSocketInterval(() => {
      const updateHtml = `<div class="surface-muted p-3 small mb-2">Live update at ${formatLiveUpdateTime()}</div>`;
      if (!emitSocketEvent(socket, 'socket.updates', 'update', updateHtml, { socketId })) {
        clearSocketInterval(intervalId, 'socket.updates', { socketId });
      }
    }, socketDelay(3000));

    registerSocketHandler(socket, 'disconnect', () => clearSocketInterval(intervalId, 'socket.updates', { socketId }), 'socket.updates', { socketId });
    registerSocketHandler(socket, 'error', (error) => {
      logFeatureError('socket.updates', 'Updates namespace socket error.', error, { socketId });
    }, 'socket.updates', { socketId });
  }, 'socket.updates');
}

/**
 * Sets up all Socket.IO namespaces.
 * @param {import('socket.io').Server} socketServer - The Socket.IO server instance.
 * @param {Function} getChatHistory - Returns the current chat history.
 * @param {Function} recordChatMessage - Persists and normalizes a new chat message, or prepares one when storeChatMessage is supplied.
 * @param {Function} storeChatMessage - Persists an already-normalized message after broadcast succeeds.
 */
export function setupSocketNamespaces(socketServer, getChatHistory, recordChatMessage = null, storeChatMessage = null) {
  setupCounterNamespace(socketServer);
  setupChatNamespace(socketServer, getChatHistory, recordChatMessage, storeChatMessage);
  setupUpdatesNamespace(socketServer);
}
