// src/fragments.js
/**
 * @module Fragments
 * @description Extracts and processes <fragment> elements from API responses.
 */

import { Logger } from './logger.js';
import { parseTargets, updateTarget } from './dom.js';
import { scheduleUpdate } from './utils.js';

/**
 * Extracts <fragment> elements from the response text and updates the DOM accordingly.
 * @param {string} responseText - The HTML response text.
 * @returns {boolean} True if one or more fragments were processed.
 */
export function processFragments(responseText) {
  const template = document.createElement('template');
  template.innerHTML = responseText;
  const fragmentsContainer = template.content.querySelector('fragments');
  if (fragmentsContainer) {
    const fragmentElements = fragmentsContainer.querySelectorAll('fragment');
    fragmentElements.forEach(fragment => {
      const targetAttr = fragment.getAttribute('target');
      if (targetAttr) {
        const targets = parseTargets(targetAttr);
        const fragmentContent = fragment.innerHTML;
        targets.forEach(target => {
          scheduleUpdate(() => updateTarget(target, fragmentContent), false);
        });
        Logger.info(`Processed fragment for target "${targetAttr}"`);
      }
    });
    return true;
  }
  return false;
}
