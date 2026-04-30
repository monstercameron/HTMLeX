/**
 * @fileoverview Domain logic for chat functionality.
 * This module handles chat message processing and broadcasting.
 *
 * @module features/chat
 */

import { logRequestError, logRequestWarning } from '../serverLogger.js';

/**
 * In-memory storage for chat messages.
 * @type {Array<Object>}
 */
let chatMessages = [];
const MAX_CHAT_MESSAGES = 100;
const MAX_USERNAME_LENGTH = 50;
const MAX_MESSAGE_LENGTH = 1000;

function normalizeText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

export function recordChatMessage(messageInput = {}) {
  const message = normalizeText(messageInput.message ?? messageInput.text, MAX_MESSAGE_LENGTH);
  if (!message) return null;

  const chatMessage = {
    id: Date.now(),
    username: normalizeText(messageInput.username, MAX_USERNAME_LENGTH) || 'Anonymous',
    text: message
  };
  chatMessages.push(chatMessage);
  chatMessages = chatMessages.slice(-MAX_CHAT_MESSAGES);
  return chatMessage;
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
    const chatMessage = recordChatMessage(req.body);
    if (!chatMessage) {
      logRequestWarning(req, 'Rejected chat message without text.', { statusCode: 400 });
      if (!res.headersSent) {
        res.status(400).send('Missing chat message');
      }
      return;
    }
    chatNamespace.emit('chatMessage', chatMessage);
    res.status(204).end();
  } catch (error) {
    logRequestError(req, 'Failed to send chat message.', error);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
}

/**
 * Retrieves the chat history.
 * @returns {Array<Object>} Array of chat messages.
 */
export function getChatHistory() {
  return chatMessages;
}
