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
export async function fetchWithTimeout(url, options = {}, timeoutMs = 0) {
  Logger.system.debug("[FETCH] Initiating fetch for URL:", url, "with timeout:", timeoutMs);

  const timeout = Number(timeoutMs) || 0;
  if (timeout <= 0 && !options.signal) {
    try {
      const response = await fetch(url, options);
      Logger.system.debug("[FETCH] Successfully fetched URL:", url);
      return response;
    } catch (error) {
      Logger.system.error("[FETCH] Error fetching URL:", url, error);
      throw error;
    }
  }

  const controller = new AbortController();
  const upstreamSignal = options.signal;
  let didTimeout = false;
  let timeoutId = null;
  let removeAbortListener = () => {};

  if (upstreamSignal) {
    const abortFromUpstream = () => controller.abort(upstreamSignal.reason);
    if (upstreamSignal.aborted) {
      abortFromUpstream();
    } else {
      upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true });
      removeAbortListener = () => upstreamSignal.removeEventListener('abort', abortFromUpstream);
    }
  }

  if (timeout > 0) {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      Logger.system.error("[FETCH] Request timed out for URL:", url);
      controller.abort(new Error("Request timed out"));
    }, timeout);
  }

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    Logger.system.debug("[FETCH] Successfully fetched URL:", url);
    return response;
  } catch (error) {
    Logger.system.error("[FETCH] Error fetching URL:", url, error);
    if (didTimeout) {
      throw new Error("Request timed out");
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    removeAbortListener();
  }
}
