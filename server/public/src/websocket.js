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
 * @param {string} socketUrl - The WebSocket URL (e.g., "wss://localhost:5500/chat").
 */
export function handleWebSocket(element, socketUrl) {
    Logger.debug("[WebSocket] handleWebSocket called for element:", element, "with URL:", socketUrl);

    if (!socketUrl) {
        Logger.error("[WebSocket] socketUrl is undefined or empty. Cannot create WebSocket.");
        return; // Exit if no URL
    }
    if (!(element instanceof Element)) { // Check if it's actually a DOM element
        Logger.error("[WebSocket] 'element' is not a valid DOM Element:", element);
        return;
    }

    try {
        Logger.debug("[WebSocket] Attempting to connect to:", socketUrl);
        const socket = new WebSocket(socketUrl);

        socket.onopen = () => {
            Logger.info(`[WebSocket] Connected to ${socketUrl}`);
            Logger.debug("[WebSocket] onopen event fired.");
        };

        socket.onmessage = (event) => {
            Logger.info(`[WebSocket] Message received:`, event.data); // Log the raw data

            try { // Added try-catch for JSON parsing
              const parsedData = JSON.parse(event.data);
              Logger.debug("[WebSocket] Parsed message data:", parsedData);
            } catch (parseError) {
              Logger.warn("[WebSocket] Could not parse message data as JSON.  Treating as plain text.", parseError);
            }


            if (element.hasAttribute('target')) {
                Logger.debug("[WebSocket] Element has 'target' attribute:", element.getAttribute('target'));
                const targets = parseTargets(element.getAttribute('target'));
                Logger.debug("[WebSocket] Parsed targets:", targets);

                targets.forEach(target => {
                    Logger.debug("[WebSocket] Scheduling update for target:", target);
                    scheduleUpdate(() => {
                        Logger.debug("[WebSocket] Inside scheduleUpdate callback. Updating target:", target, "with data:", event.data);
                        try {
                            updateTarget(target, event.data);
                            Logger.debug("[WebSocket] Target updated successfully:", target);
                        } catch (updateError) {
                            Logger.error("[WebSocket] Error updating target:", target, updateError);
                        }

                    }, isSequential(element));
                });
            } else {
                Logger.debug("[WebSocket] Element does not have a 'target' attribute.");
            }
        };

        socket.onerror = (error) => {
            Logger.error("[WebSocket] Error:", error);  // More detailed error logging
            Logger.debug("[WebSocket] onerror event fired.");

        };

        socket.onclose = (event) => {
            Logger.info(`[WebSocket] Connection closed for ${socketUrl}. Code: ${event.code}, Reason: ${event.reason}, Was clean: ${event.wasClean}`);
            Logger.debug("[WebSocket] onclose event fired.");
        };

        element._htmlexSocket = socket;
        Logger.debug("[WebSocket] Socket assigned to element._htmlexSocket:", socket);

    } catch (error) {
        Logger.error("[WebSocket] Failed to establish connection:", error);
    }
}