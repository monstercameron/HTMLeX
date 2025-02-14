// src/signals.js
/**
 * @module Signals
 * @description Provides a signal bus for chaining actions.
 */

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
  }
  signalBus.get(signalName).push(callback);
}

/**
 * Emits a signal to all registered listeners.
 * @param {string} signalName - The signal to emit.
 */
export function emitSignal(signalName) {
  if (signalBus.has(signalName)) {
    signalBus.get(signalName).forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error(`Error in signal listener for "${signalName}": ${error}`);
      }
    });
  }
}
