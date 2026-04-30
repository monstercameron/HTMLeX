/**
 * @fileoverview Domain logic for chat functionality.
 * This module handles chat message processing and broadcasting.
 *
 * @module features/chat
 */

import { logRequestError, logRequestWarning } from '../serverLogger.js';
import { sendEmptyResponse, sendServerError, sendTextResponse } from './responses.js';

/**
 * In-memory storage for chat messages.
 * @type {Array<Object>}
 */
let chatMessages = [];
let chatMessageSequence = 0;
const MAX_CHAT_MESSAGES = 100;
const MAX_USERNAME_LENGTH = 50;
const MAX_MESSAGE_LENGTH = 1000;

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

function normalizeMessageInput(messageInput) {
  return messageInput && typeof messageInput === 'object' ? messageInput : {};
}

function normalizeText(value, maxLength) {
  return safeString(value).trim().slice(0, maxLength);
}

function createChatMessageId() {
  chatMessageSequence += 1;
  return `${getCurrentTimestamp()}-${chatMessageSequence}`;
}

function normalizeMessageId(value) {
  const normalizedValue = safeString(value).trim();
  return normalizedValue || createChatMessageId();
}

function getMessageTextValue(input) {
  const message = getObjectField(input, 'message', undefined);
  return message ?? getObjectField(input, 'text', '');
}

function cloneChatMessage(message) {
  const input = normalizeMessageInput(message);
  return {
    id: normalizeMessageId(getObjectField(input, 'id', '')),
    username: normalizeText(getObjectField(input, 'username', ''), MAX_USERNAME_LENGTH) || 'Anonymous',
    text: normalizeText(getMessageTextValue(input), MAX_MESSAGE_LENGTH)
  };
}

export function createChatMessage(messageInput = {}) {
  const input = normalizeMessageInput(messageInput);
  const message = normalizeText(getMessageTextValue(input), MAX_MESSAGE_LENGTH);
  if (!message) return null;

  return {
    id: normalizeMessageId(getObjectField(input, 'id', '')),
    username: normalizeText(getObjectField(input, 'username', ''), MAX_USERNAME_LENGTH) || 'Anonymous',
    text: message
  };
}

export function storeChatMessage(chatMessage) {
  const normalizedMessage = createChatMessage(chatMessage);
  if (!normalizedMessage) return null;
  chatMessages.push(normalizedMessage);
  chatMessages = chatMessages.slice(-MAX_CHAT_MESSAGES);
  return normalizedMessage;
}

export function recordChatMessage(messageInput = {}) {
  const chatMessage = createChatMessage(messageInput);
  return chatMessage ? storeChatMessage(chatMessage) : null;
}

/**
 * Handles sending a chat message.
 * Validates the input, stores the message, and broadcasts it using Socket.IO.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('socket.io').Namespace} chatNamespace - The Socket.IO namespace for chat.
 * @returns {Promise<void>}
 */
export async function sendChatMessage(req, res, chatNamespace) {
  try {
    const chatMessage = createChatMessage(getObjectField(req, 'body', {}));
    if (!chatMessage) {
      logRequestWarning(req, 'Rejected chat message without text.', { statusCode: 400 });
      sendTextResponse(res, 400, 'Missing chat message');
      return;
    }
    chatNamespace.emit('chatMessage', chatMessage);
    storeChatMessage(chatMessage);
    sendEmptyResponse(res, 204);
  } catch (error) {
    logRequestError(req, 'Failed to send chat message.', error);
    sendServerError(res);
  }
}

/**
 * Retrieves the chat history.
 * @returns {Array<Object>} Array of chat messages.
 */
export function getChatHistory() {
  return chatMessages.map(cloneChatMessage);
}
