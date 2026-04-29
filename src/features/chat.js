/**
 * @fileoverview Domain logic for chat functionality.
 * This module handles chat message processing and broadcasting.
 *
 * @module features/chat
 */

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
    const message = normalizeText(req.body.message, MAX_MESSAGE_LENGTH);
    if (!message) {
      if (!res.headersSent) {
        res.status(400).send('Missing chat message');
      }
      return;
    }
    const chatMessage = {
      id: Date.now(),
      username: normalizeText(req.body.username, MAX_USERNAME_LENGTH) || 'Anonymous',
      text: message
    };
    chatMessages.push(chatMessage);
    chatMessages = chatMessages.slice(-MAX_CHAT_MESSAGES);
    chatNamespace.emit('chatMessage', chatMessage);
    res.status(204).end();
  } catch (error) {
    console.error('Error in sendChatMessage:', error);
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
