// src/cache.js
/**
 * @module Cache
 * @description Provides caching functionality for API responses.
 *
 * @typedef {Object} CacheEntry
 * @property {string} response - The cached response.
 * @property {number} expireAt - The expiration time in milliseconds.
 */

import { Logger } from './logger.js';

/** @type {Map<string, CacheEntry>} */
const cacheStore = new Map();

/**
 * Caches a response.
 * @param {string} key - The cache key.
 * @param {string} response - The response to cache.
 * @param {number} ttl - Time to live (milliseconds).
 */
export function setCache(key, response, ttl) {
  const expireAt = Date.now() + ttl;
  cacheStore.set(key, { response, expireAt });
  Logger.system.debug("[CACHE] Cached response for key:", key, "TTL:", ttl, "Expires at:", expireAt);
}

/**
 * Retrieves a cached response if available and unexpired.
 * @param {string} key - The cache key.
 * @returns {string|null} The cached response or null if not found/expired.
 */
export function getCache(key) {
  if (cacheStore.has(key)) {
    const { response, expireAt } = cacheStore.get(key);
    if (Date.now() < expireAt) {
      Logger.system.debug("[CACHE] Cache hit for key:", key);
      return response;
    } else {
      Logger.system.warn("[CACHE] Cache expired for key:", key, "Deleting entry.");
      cacheStore.delete(key);
    }
  } else {
    Logger.system.debug("[CACHE] Cache miss for key:", key);
  }
  return null;
}
