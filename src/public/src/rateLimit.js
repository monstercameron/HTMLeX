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
  Logger.system.debug("[DEBOUNCE] Creating debounced function with wait period:", wait, "ms");
  
  return function(...args) {
    const context = this;
    Logger.system.debug("[DEBOUNCE] Debounced function invoked with arguments:", args, "and context:", context);

    // If the first argument is an Event, clone its key properties.
    if (args.length > 0 && args[0] instanceof Event) {
      const originalEvent = args[0];
      args[0] = {
        type: originalEvent.type,
        target: originalEvent.target,
        currentTarget: originalEvent.currentTarget
      };
      Logger.system.debug("[DEBOUNCE] Cloned event object:", args[0]);
    }

    if (!hasFired) {
      Logger.system.debug("[DEBOUNCE] No active debounce; invoking function immediately.");
      hasFired = true;
      try {
        func.apply(context, args);
        Logger.system.debug("[DEBOUNCE] Function executed successfully.");
      } catch (error) {
        Logger.system.error("[DEBOUNCE] Error executing debounced function:", error);
      }
      setTimeout(() => {
        hasFired = false;
        Logger.system.debug("[DEBOUNCE] Debounce period ended; state reset.");
      }, wait);
    } else {
      Logger.system.warn("[DEBOUNCE] Debounce active; event blocked. Arguments:", args);
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
  let inThrottle = false;
  Logger.system.debug("[THROTTLE] Creating throttled function with limit:", limit, "ms");

  return function(...args) {
    const context = this;
    Logger.system.debug("[THROTTLE] Throttled function invoked with arguments:", args, "and context:", context);

    if (!inThrottle) {
      Logger.system.debug("[THROTTLE] Not in throttle; invoking function.");
      try {
        func.apply(context, args);
        Logger.system.debug("[THROTTLE] Function executed successfully.");
      } catch (error) {
        Logger.system.error("[THROTTLE] Error executing throttled function:", error);
      }
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        Logger.system.debug("[THROTTLE] Throttle period ended; ready for next call.");
      }, limit);
    } else {
      Logger.system.warn("[THROTTLE] Function call throttled. Arguments:", args);
    }
  };
}
