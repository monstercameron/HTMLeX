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
 */
export function registerSignalListener(signalName, callback) {
  if (!signalBus.has(signalName)) {
    signalBus.set(signalName, []);
    Logger.system.debug(`[SIGNALS] Created new signal bus for "${signalName}".`);
  }
  signalBus.get(signalName).push(callback);
  Logger.system.debug(`[SIGNALS] Registered listener for signal "${signalName}".`);
}

/**
 * Emits a signal to all registered listeners.
 * @param {string} signalName - The signal to emit.
 */
export function emitSignal(signalName) {
  Logger.system.debug(`[SIGNALS] Emitting signal "${signalName}".`);
  if (signalBus.has(signalName)) {
    signalBus.get(signalName).forEach(callback => {
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
