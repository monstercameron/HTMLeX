// src/signals.js
/**
 * @module Signals
 * @description Provides a signal bus for chaining actions.
 */

import { Logger } from './logger.js';

/** @type {Map<string, Function[]>} */
const signalBus = new Map();

/**
 * Registers a listener for a given signal.
 * @param {string} signalName - The name of the signal (e.g., "@todosLoaded").
 * @param {Function} callback - The callback to invoke when the signal is emitted.
 * @returns {Function} Unregisters the listener.
 */
export function registerSignalListener(signalName, callback) {
  if (!signalName) {
    Logger.system.warn("[SIGNALS] Ignoring empty signal listener registration.");
    return () => {};
  }

  if (!signalBus.has(signalName)) {
    signalBus.set(signalName, []);
    Logger.system.debug(`[SIGNALS] Created new signal bus for "${signalName}".`);
  }
  signalBus.get(signalName).push(callback);
  Logger.system.debug(`[SIGNALS] Registered listener for signal "${signalName}".`);
  return () => {
    const listeners = signalBus.get(signalName);
    if (!listeners) return;
    const index = listeners.indexOf(callback);
    if (index >= 0) {
      listeners.splice(index, 1);
      Logger.system.debug(`[SIGNALS] Unregistered listener for signal "${signalName}".`);
    }
    if (!listeners.length) {
      signalBus.delete(signalName);
    }
  };
}

// Internal diagnostic used by the browser e2e suite to verify cleanup behavior.
export function __getSignalListenerCount(signalName) {
  return signalBus.get(signalName)?.length || 0;
}

/**
 * Emits a signal to all registered listeners.
 * @param {string} signalName - The signal to emit.
 */
export function emitSignal(signalName) {
  if (!signalName) {
    Logger.system.warn("[SIGNALS] Ignoring empty signal emission.");
    return;
  }

  Logger.system.debug(`[SIGNALS] Emitting signal "${signalName}".`);
  if (signalBus.has(signalName)) {
    const listeners = [...signalBus.get(signalName)];
    listeners.forEach(callback => {
      try {
        callback();
        Logger.system.debug(`[SIGNALS] Signal "${signalName}" listener executed successfully.`);
      } catch (error) {
        Logger.system.error(`[SIGNALS] Error in signal listener for "${signalName}":`, error);
      }
    });
  } else {
    Logger.system.warn(`[SIGNALS] No listeners registered for signal "${signalName}".`);
  }
}
