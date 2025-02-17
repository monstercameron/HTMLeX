/**
 * @module RateLimit
 * @description Provides functions to debounce and throttle calls.
 */

import { Logger } from './logger.js';

/**
 * Creates a debounced version of the function with leading-edge behavior.
 * The first call is executed immediately; further calls within the wait period are blocked.
 * If the first argument is an Event, a shallow copy of its key properties is made
 * to avoid issues with the event being reused.
 *
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The debounce interval in milliseconds.
 * @returns {Function} The debounced function.
 */
export function debounce(func, wait) {
  let hasFired = false;
  return function(...args) {
    const context = this;
    Logger.debug("[DEBOUNCE] Called with arguments:", args, "and context:", context);
    
    // If the first argument is an Event, clone its key properties.
    if (args.length > 0 && args[0] instanceof Event) {
      const originalEvent = args[0];
      args[0] = {
        type: originalEvent.type,
        target: originalEvent.target,
        currentTarget: originalEvent.currentTarget
      };
      Logger.debug("[DEBOUNCE] Cloned event object:", args[0]);
    }
    
    if (!hasFired) {
      Logger.debug("[DEBOUNCE] No active debounce; invoking function immediately.");
      hasFired = true;
      func.apply(context, args);
      setTimeout(() => {
        Logger.debug("[DEBOUNCE] Debounce period ended; resetting state.");
        hasFired = false;
      }, wait);
    } else {
      Logger.warn("[DEBOUNCE] Debounce active; event blocked.");
    }
  };
}

/**
 * Creates a throttled version of the function.
 * @param {Function} func - The function to throttle.
 * @param {number} limit - The throttle interval in milliseconds.
 * @returns {Function} The throttled function.
 */
export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    const context = this;
    if (!inThrottle) {
      Logger.debug("[THROTTLE] Invoking function with arguments:", args);
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        Logger.debug("[THROTTLE] Throttle period ended; ready for next call.");
      }, limit);
    } else {
      Logger.warn("[THROTTLE] Function call throttled. Arguments:", args);
    }
  };
}
