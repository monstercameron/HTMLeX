// src/fetchHelper.js
/**
 * @module FetchHelper
 * @description Provides a fetch wrapper with timeout functionality.
 */

import { Logger } from './logger.js';

/**
 * Fetches a resource with a timeout.
 * @param {string} url - The URL to fetch.
 * @param {RequestInit} options - The fetch options.
 * @param {number} timeoutMs - Timeout in milliseconds.
 * @returns {Promise<Response>} A promise that resolves with the fetch response.
 */
export function fetchWithTimeout(url, options, timeoutMs) {
  Logger.system.debug("[FETCH] Initiating fetch for URL:", url, "with timeout:", timeoutMs);

  if (timeoutMs > 0) {
    const fetchPromise = fetch(url, options)
      .then(response => {
        Logger.system.debug("[FETCH] Successfully fetched URL:", url);
        return response;
      })
      .catch(error => {
        Logger.system.error("[FETCH] Error fetching URL:", url, error);
        throw error;
      });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => {
        Logger.system.error("[FETCH] Request timed out for URL:", url);
        reject(new Error("Request timed out"));
      }, timeoutMs)
    );

    return Promise.race([fetchPromise, timeoutPromise]);
  }

  return fetch(url, options)
    .then(response => {
      Logger.system.debug("[FETCH] Successfully fetched URL:", url);
      return response;
    })
    .catch(error => {
      Logger.system.error("[FETCH] Error fetching URL:", url, error);
      throw error;
    });
}
