// src/websocket.js
/**
 * @module WebSocketHandler
 * @description Handles Socket.IO connections and integrates incoming messages.
 */

import { Logger } from './logger.js';
import { scheduleUpdate, isSequential } from './utils.js';
import { parseTargets, updateTarget } from './dom.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderChatMessage(message) {
  return `
    <div class="surface-muted p-3 small mb-2">
      <strong class="me-2 text-primary">${escapeHtml(message.username || 'Anonymous')}</strong>
      <span>${escapeHtml(message.text || '')}</span>
    </div>
  `;
}

function normalizeSocketPayload(eventName, data) {
  if (eventName === 'chatMessage') {
    return renderChatMessage(data || {});
  }

  if (eventName === 'chatHistory') {
    const history = Array.isArray(data?.history) ? data.history : [];
    if (!history.length) {
      return '<p class="text-center small text-subtle mb-0">Waiting for messages...</p>';
    }
    return history.map(renderChatMessage).join('');
  }

  if (typeof data === 'string') {
    return data;
  }

  try {
    return escapeHtml(JSON.stringify(data));
  } catch {
    return escapeHtml(data);
  }
}

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
    return;
  }
  if (!(element instanceof Element)) {
    Logger.system.error("[Socket.IO] 'element' is not a valid DOM Element:", element);
    return;
  }

  try {
    Logger.system.debug("[Socket.IO] Attempting to connect to:", socketUrl);
    const socket = io(socketUrl, {
      transports: ['websocket']
    });

    socket.on('connect', () => {
      Logger.system.info(`[Socket.IO] Connected to ${socketUrl}`);
      Logger.system.debug("[Socket.IO] on connect event fired.");
    });

    // Listen for all events and handle them uniformly.
    socket.onAny((eventName, data) => {
      if (!document.body.contains(element)) {
        Logger.system.info("[Socket.IO] Ignoring event for removed element.");
        socket.disconnect();
        return;
      }

      Logger.system.info(`[Socket.IO] Event "${eventName}" received:`, data);

      const payloadHtml = normalizeSocketPayload(eventName, data);

      if (element.hasAttribute('target')) {
        Logger.system.debug("[Socket.IO] Element has 'target' attribute:", element.getAttribute('target'));
        const targets = parseTargets(element.getAttribute('target'));
        Logger.system.debug("[Socket.IO] Parsed targets:", targets);

        for (const target of targets) {
          Logger.system.debug("[Socket.IO] Scheduling update for target:", target);
          scheduleUpdate(() => {
            if (!document.body.contains(element)) return;
            Logger.system.debug("[Socket.IO] Inside scheduleUpdate callback. Updating target:", target, "with data:", payloadHtml);
            try {
              updateTarget(target, payloadHtml, element);
              Logger.system.debug("[Socket.IO] Target updated successfully:", target);
            } catch (updateError) {
              Logger.system.error("[Socket.IO] Error updating target:", target, updateError);
            }
          }, isSequential(element));
        }
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

    element._htmlexSocket = socket;
    Logger.system.debug("[Socket.IO] Socket assigned to element._htmlexSocket:", socket);

    const observer = new MutationObserver(() => {
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
    element._htmlexSocketObserver = observer;

  } catch (error) {
    Logger.system.error("[Socket.IO] Failed to establish connection:", error);
  }
}
