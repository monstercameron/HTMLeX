/**
 * @module RateLimit
 * @description Provides functions to debounce and throttle calls.
 */

/**
 * Creates a debounced version of the function.
 * If the first argument is an Event, a shallow copy of its key properties is made
 * to avoid issues with the event being reused.
 *
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The debounce interval in milliseconds.
 * @returns {Function} The debounced function.
 */
export function debounce(func, wait) {
  let timeout;
  return function (...args) {
    // If the first argument is an Event, clone its key properties.
    if (args.length > 0 && args[0] instanceof Event) {
      const originalEvent = args[0];
      args[0] = {
        type: originalEvent.type,
        target: originalEvent.target,
        currentTarget: originalEvent.currentTarget
        // Additional properties can be copied here if needed.
      };
    }
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
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
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
