/**
 * @module RateLimit
 * @description Provides functions to debounce and throttle calls.
 */

import { Logger } from './logger.js';

function cloneEventArgs(args) {
  if (!(args[0] instanceof Event)) {
    return args;
  }

  const originalEvent = args[0];
  return [
    {
      type: originalEvent.type,
      target: originalEvent.target,
      currentTarget: originalEvent.currentTarget,
      defaultPrevented: originalEvent.defaultPrevented,
      preventDefault: () => originalEvent.preventDefault(),
      stopPropagation: () => originalEvent.stopPropagation(),
      stopImmediatePropagation: () => originalEvent.stopImmediatePropagation()
    },
    ...args.slice(1)
  ];
}

/**
 * Creates a debounced version of the function with trailing-edge behavior.
 * The latest call is executed after the wait period and earlier pending calls are cancelled.
 * If the first argument is an Event, a shallow copy of its key properties is made
 * to avoid issues with the event being reused.
 *
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The debounce interval in milliseconds.
 * @returns {Function} The debounced function.
 */
export function debounce(func, wait) {
  let timeoutId = null;
  let resolvePending = null;
  Logger.system.debug("[DEBOUNCE] Creating debounced function with wait period:", wait, "ms");
  
  const debounced = function(...args) {
    const context = this;
    Logger.system.debug("[DEBOUNCE] Debounced function invoked with arguments:", args, "and context:", context);
    const invocationArgs = cloneEventArgs(args);

    if (timeoutId) {
      clearTimeout(timeoutId);
      if (resolvePending) {
        resolvePending(undefined);
        resolvePending = null;
      }
      Logger.system.debug("[DEBOUNCE] Cleared pending debounce call.");
    }

    return new Promise(resolve => {
      resolvePending = resolve;
      timeoutId = setTimeout(async () => {
        timeoutId = null;
        resolvePending = null;
        try {
          const result = await func.apply(context, invocationArgs);
          Logger.system.debug("[DEBOUNCE] Function executed successfully.");
          resolve(result);
        } catch (error) {
          Logger.system.error("[DEBOUNCE] Error executing debounced function:", error);
          resolve(undefined);
        }
      }, wait);
    });
  };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (resolvePending) {
      resolvePending(undefined);
      resolvePending = null;
    }
  };

  return debounced;
}

/**
 * Creates a throttled version of the function.
 * @param {Function} func - The function to throttle.
 * @param {number} limit - The throttle interval in milliseconds.
 * @returns {Function} The throttled function.
 */
export function throttle(func, limit) {
  let inThrottle = false;
  let timeoutId = null;
  Logger.system.debug("[THROTTLE] Creating throttled function with limit:", limit, "ms");

  const throttled = function(...args) {
    const context = this;
    Logger.system.debug("[THROTTLE] Throttled function invoked with arguments:", args, "and context:", context);

    if (!inThrottle) {
      Logger.system.debug("[THROTTLE] Not in throttle; invoking function.");
      const invocationArgs = cloneEventArgs(args);
      inThrottle = true;
      timeoutId = setTimeout(() => {
        inThrottle = false;
        timeoutId = null;
        Logger.system.debug("[THROTTLE] Throttle period ended; ready for next call.");
      }, limit);
      return Promise.resolve()
        .then(() => func.apply(context, invocationArgs))
        .then(result => {
          Logger.system.debug("[THROTTLE] Function executed successfully.");
          return result;
        })
        .catch(error => {
          Logger.system.error("[THROTTLE] Error executing throttled function:", error);
          return undefined;
        });
    } else {
      Logger.system.warn("[THROTTLE] Function call throttled. Arguments:", args);
      return Promise.resolve(undefined);
    }
  };

  throttled.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    inThrottle = false;
  };

  return throttled;
}
