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
  let newUrl = new URL(window.location.href);
  if (element.hasAttribute('push')) {
    const pairs = element.getAttribute('push').split(/\s+/);
    pairs.forEach(pair => {
      const [key, value] = pair.split('=');
      newUrl.searchParams.set(key, value);
    });
  }
  if (element.hasAttribute('pull')) {
    const keys = element.getAttribute('pull').split(/\s+/);
    keys.forEach(key => newUrl.searchParams.delete(key));
  }
  if (element.hasAttribute('path')) {
    newUrl.pathname = element.getAttribute('path');
  }
  if (element.hasAttribute('push') || element.hasAttribute('pull') || element.hasAttribute('path')) {
    const historyMethod = element.getAttribute('history') || 'replace';
    if (historyMethod === 'push') {
      history.pushState(null, '', newUrl.toString());
    } else {
      history.replaceState(null, '', newUrl.toString());
    }
    Logger.info(`Updated URL state to: ${newUrl.toString()}`);
  }
}
