/**
 * @fileoverview Domain logic for Socket.IO namespaces.
 * This module sets up various Socket.IO namespaces for counter, chat, and updates.
 *
 * @module features/sockets
 */

/**
 * Sets up the '/counter' namespace to emit an incrementing counter every second.
 * @param {import('socket.io').Server} io - The Socket.IO server instance.
 */
export function setupCounterNamespace(io) {
    const counterNamespace = io.of('/counter');
    counterNamespace.on('connection', (socket) => {
      console.log("New Socket.IO connection on /counter");
      let count = 0;
      const interval = setInterval(() => {
        count++;
        socket.emit('counter', count);
      }, 1000);
      socket.on('disconnect', () => clearInterval(interval));
    });
  }
  
  /**
   * Sets up the '/chat' namespace to handle chat connections.
   * Sends the chat history on connection and broadcasts new chat messages.
   * @param {import('socket.io').Server} io - The Socket.IO server instance.
   * @param {function} getChatHistory - Function to retrieve chat history.
   */
  export function setupChatNamespace(io, getChatHistory) {
    const chatNamespace = io.of('/chat');
    chatNamespace.on('connection', (socket) => {
      console.log("New Socket.IO connection on /chat");
      // Send existing chat history to the client.
      socket.emit('chatHistory', { history: getChatHistory() });
      // Listen for new chat messages from clients.
      socket.on('chatMessage', (msg) => {
        // The broadcasting is handled by domain logic in chat module.
        chatNamespace.emit('chatMessage', msg);
      });
    });
  }
  
  /**
   * Sets up the '/updates' namespace to emit live updates every 3 seconds.
   * @param {import('socket.io').Server} io - The Socket.IO server instance.
   */
  export function setupUpdatesNamespace(io) {
    const updatesNamespace = io.of('/updates');
    updatesNamespace.on('connection', (socket) => {
      console.log("New Socket.IO connection on /updates");
      const interval = setInterval(() => {
        const updateMsg = `<div class="p-2 bg-gray-700 rounded-md text-gray-100">Live update at ${new Date().toLocaleTimeString()}</div>`;
        socket.emit('update', updateMsg);
      }, 3000);
      socket.on('disconnect', () => clearInterval(interval));
    });
  }
  
  /**
   * Sets up all Socket.IO namespaces.
   * @param {import('socket.io').Server} io - The Socket.IO server instance.
   * @param {function} getChatHistory - Function to retrieve chat history.
   */
  export function setupSocketNamespaces(io, getChatHistory) {
    setupCounterNamespace(io);
    setupChatNamespace(io, getChatHistory);
    setupUpdatesNamespace(io);
  }
  