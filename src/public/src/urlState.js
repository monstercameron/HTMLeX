// src/urlState.js
/**
 * @module URLState
 * @description Updates the browser's URL state based on element attributes.
 */

import { Logger } from './logger.js';

/**
 * Updates the URL state using attributes such as push, pull, and path.
 * @param {Element} element - The element with URL state attributes.
 */
export function handleURLState(element) {
  Logger.system.debug("[URLState] Starting URL state update for element:", element);
  let newUrl = new URL(window.location.href);
  Logger.system.debug("[URLState] Current URL:", window.location.href);

  if (element.hasAttribute('push')) {
    const pushValue = element.getAttribute('push');
    Logger.system.debug("[URLState] Found 'push' attribute with value:", pushValue);
    const pairs = pushValue.split(/\s+/);
    pairs.forEach(pair => {
      const [key, value] = pair.split('=');
      Logger.system.debug(`[URLState] Setting search parameter: ${key}=${value}`);
      newUrl.searchParams.set(key, value);
    });
  }

  if (element.hasAttribute('pull')) {
    const pullValue = element.getAttribute('pull');
    Logger.system.debug("[URLState] Found 'pull' attribute with value:", pullValue);
    const keys = pullValue.split(/\s+/);
    keys.forEach(key => {
      Logger.system.debug(`[URLState] Removing search parameter: ${key}`);
      newUrl.searchParams.delete(key);
    });
  }

  if (element.hasAttribute('path')) {
    const newPath = element.getAttribute('path');
    Logger.system.debug("[URLState] Found 'path' attribute with value:", newPath);
    newUrl.pathname = newPath;
  }

  if (element.hasAttribute('push') || element.hasAttribute('pull') || element.hasAttribute('path')) {
    const historyMethod = element.getAttribute('history') || 'replace';
    Logger.system.debug("[URLState] History method set to:", historyMethod);
    if (historyMethod === 'push') {
      history.pushState(null, '', newUrl.toString());
      Logger.system.info(`[URLState] Pushed new URL state: ${newUrl.toString()}`);
    } else {
      history.replaceState(null, '', newUrl.toString());
      Logger.system.info(`[URLState] Replaced URL state: ${newUrl.toString()}`);
    }
  } else {
    Logger.system.debug("[URLState] No URL state attributes found; no changes made.");
  }
}
