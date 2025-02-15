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
    const message = req.body.message;
    if (!message) {
      if (!res.headersSent) {
        res.status(400).send('Missing chat message');
      }
      return;
    }
    const newMessage = {
      id: Date.now(),
      username: req.body.username || 'Anonymous',
      text: message
    };
    chatMessages.push(newMessage);
    // Broadcast the new message via the provided Socket.IO namespace.
    chatNamespace.emit('chatMessage', newMessage);
    res.status(204).end();
  } catch (err) {
    console.error('Error in sendChatMessage:', err);
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
