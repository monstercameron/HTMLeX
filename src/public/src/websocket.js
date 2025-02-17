// src/websocket.js
/**
 * @module WebSocketHandler
 * @description Handles Socket.IO connections and integrates incoming messages.
 */

import { Logger } from './logger.js';
import { scheduleUpdate, isSequential } from './utils.js';
import { parseTargets, updateTarget } from './dom.js';

/**
 * Establishes a Socket.IO connection for the given element.
 * Automatically cleans up the connection if the element is removed from the DOM.
 * @param {Element} element - The DOM element to attach the socket to.
 * @param {string} socketUrl - The Socket.IO URL (e.g., "https://localhost:5500/chat").
 */
export function handleWebSocket(element, socketUrl) {
  Logger.system.debug("[Socket.IO] handleWebSocket called for element:", element, "with URL:", socketUrl);

  if (!socketUrl) {
    Logger.system.error("[Socket.IO] socketUrl is undefined or empty. Cannot create connection.");
    return; // Exit if no URL
  }
  if (!(element instanceof Element)) {
    Logger.system.error("[Socket.IO] 'element' is not a valid DOM Element:", element);
    return;
  }

  try {
    Logger.system.debug("[Socket.IO] Attempting to connect to:", socketUrl);
    // Using the globally available `io` from the CDN.
    const socket = io(socketUrl, {
      transports: ['websocket'] // Force WebSocket transport
    });

    socket.on('connect', () => {
      Logger.system.info(`[Socket.IO] Connected to ${socketUrl}`);
      Logger.system.debug("[Socket.IO] on connect event fired.");
    });

    // Listen for all events and handle them uniformly.
    socket.onAny((eventName, data) => {
      Logger.system.info(`[Socket.IO] Event "${eventName}" received:`, data);

      // Normalize data into a string.
      let messageData;
      try {
        messageData = typeof data === 'string' ? data : JSON.stringify(data);
      } catch (e) {
        messageData = data;
      }

      if (element.hasAttribute('target')) {
        Logger.system.debug("[Socket.IO] Element has 'target' attribute:", element.getAttribute('target'));
        const targets = parseTargets(element.getAttribute('target'));
        Logger.system.debug("[Socket.IO] Parsed targets:", targets);

        targets.forEach(target => {
          Logger.system.debug("[Socket.IO] Scheduling update for target:", target);
          scheduleUpdate(() => {
            Logger.system.debug("[Socket.IO] Inside scheduleUpdate callback. Updating target:", target, "with data:", messageData);
            try {
              updateTarget(target, messageData);
              Logger.system.debug("[Socket.IO] Target updated successfully:", target);
            } catch (updateError) {
              Logger.system.error("[Socket.IO] Error updating target:", target, updateError);
            }
          }, isSequential(element));
        });
      } else {
        Logger.system.debug("[Socket.IO] Element does not have a 'target' attribute.");
      }
    });

    socket.on('error', (error) => {
      Logger.system.error("[Socket.IO] Error:", error);
      Logger.system.debug("[Socket.IO] on error event fired.");
    });

    socket.on('disconnect', (reason) => {
      Logger.system.info(`[Socket.IO] Connection disconnected for ${socketUrl}. Reason: ${reason}`);
      Logger.system.debug("[Socket.IO] on disconnect event fired.");
    });

    // Save the socket instance on the element for potential later use.
    element._htmlexSocket = socket;
    Logger.system.debug("[Socket.IO] Socket assigned to element._htmlexSocket:", socket);

    // Set up a MutationObserver to clean up the WebSocket when the element is removed.
    const observer = new MutationObserver(() => {
      // Check if the element is no longer in the document.
      if (!document.body.contains(element)) {
        Logger.system.info("[Socket.IO] Element removed from DOM. Disconnecting socket.");
        if (element._htmlexSocket) {
          element._htmlexSocket.disconnect();
          Logger.system.debug("[Socket.IO] Socket disconnected.");
          delete element._htmlexSocket;
        }
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Save the observer on the element for potential future reference.
    element._htmlexSocketObserver = observer;

  } catch (error) {
    Logger.system.error("[Socket.IO] Failed to establish connection:", error);
  }
}
