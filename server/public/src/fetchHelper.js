// src/fetchHelper.js
/**
 * @module FetchHelper
 * @description Provides a fetch wrapper with timeout functionality.
 */

/**
 * Fetches a resource with a timeout.
 * @param {string} url - The URL to fetch.
 * @param {RequestInit} options - The fetch options.
 * @param {number} timeoutMs - Timeout in milliseconds.
 * @returns {Promise<Response>} A promise that resolves with the fetch response.
 */
export function fetchWithTimeout(url, options, timeoutMs) {
    if (timeoutMs > 0) {
      return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
        )
      ]);
    }
    return fetch(url, options);
  }
  