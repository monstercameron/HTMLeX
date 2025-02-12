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
    const updateFn = updateQueue.shift();
    updateFn();
    requestAnimationFrame(processUpdateQueue);
  } else {
    processingQueue = false;
  }
}

/**
 * Schedules an update function.
 * @param {Function} updateFn - The update function to run.
 * @param {boolean} sequential - If true, the function is queued for sequential processing.
 */
export function scheduleUpdate(updateFn, sequential) {
  if (sequential) {
    updateQueue.push(updateFn);
    if (!processingQueue) {
      processingQueue = true;
      requestAnimationFrame(processUpdateQueue);
    }
  } else {
    requestAnimationFrame(updateFn);
  }
}

/**
 * Checks if an element is set for sequential updates.
 * @param {Element} element - The DOM element.
 * @returns {boolean} True if the element has sequential updates enabled.
 */
export function isSequential(element) {
  return element.hasAttribute('sequential') && element.getAttribute('sequential') !== 'false';
}
