// src/utils.js
/**
 * @module Utils
 * @description Provides utility functions for scheduling and update queue processing.
 */

import { Logger } from './logger.js';

/** @type {Array<Function>} */
const updateQueue = [];

/** @type {boolean} */
let processingQueue = false;

/**
 * Processes the update queue.
 * @private
 */
function processUpdateQueue() {
  if (updateQueue.length > 0) {
    Logger.system.debug("[UTILS] Processing update from queue. Remaining updates:", updateQueue.length);
    const updateFn = updateQueue.shift();
    try {
      updateFn();
      Logger.system.debug("[UTILS] Update function executed successfully.");
    } catch (error) {
      Logger.system.error("[UTILS] Error executing update function from queue:", error);
    }
    requestAnimationFrame(processUpdateQueue);
  } else {
    processingQueue = false;
    Logger.system.debug("[UTILS] Update queue empty. Stopping processing.");
  }
}

/**
 * Schedules an update function.
 * @param {Function} updateFn - The update function to run.
 * @param {boolean} sequential - If true, the function is queued for sequential processing.
 */
export function scheduleUpdate(updateFn, sequential) {
  if (sequential) {
    Logger.system.debug("[UTILS] Scheduling sequential update function.");
    updateQueue.push(updateFn);
    if (!processingQueue) {
      processingQueue = true;
      Logger.system.debug("[UTILS] Starting update queue processing.");
      requestAnimationFrame(processUpdateQueue);
    }
  } else {
    Logger.system.debug("[UTILS] Scheduling immediate (non-sequential) update function.");
    requestAnimationFrame(updateFn);
  }
}

/**
 * Checks if an element is set for sequential updates.
 * @param {Element} element - The DOM element.
 * @returns {boolean} True if the element has sequential updates enabled.
 */
export function isSequential(element) {
  const sequential = element.hasAttribute('sequential') && element.getAttribute('sequential') !== 'false';
  Logger.system.debug("[UTILS] Element", element, "sequential update:", sequential);
  return sequential;
}
