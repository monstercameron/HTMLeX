// src/websocket.js
/**
 * @module WebSocketHandler
 * @description Handles WebSocket connections and integrates incoming messages.
 */

import { Logger } from './logger.js';
import { scheduleUpdate, isSequential } from './utils.js';
import { parseTargets, updateTarget } from './dom.js';

/**
 * Establishes a WebSocket connection for the given element.
 * @param {Element} element - The DOM element to attach the socket to.
 * @param {string} socketUrl - The WebSocket URL.
 */
export function handleWebSocket(element, socketUrl) {
  try {
    const socket = new WebSocket(socketUrl);
    socket.onopen = () => Logger.info(`WebSocket connected to ${socketUrl}`);
    socket.onmessage = (event) => {
      Logger.info(`WebSocket message received: ${event.data}`);
      if (element.hasAttribute('target')) {
        const targets = parseTargets(element.getAttribute('target'));
        targets.forEach(target => {
          scheduleUpdate(() => updateTarget(target, event.data), isSequential(element));
        });
      }
    };
    socket.onerror = (error) => Logger.error("WebSocket error:", error);
    socket.onclose = () => Logger.info(`WebSocket closed for ${socketUrl}`);
    element._htmlexSocket = socket;
  } catch (error) {
    Logger.error("Failed to establish WebSocket connection:", error);
  }
}
