// src/fragments.js
/**
 * @module Fragments
 * @description Processes a streaming HTTP response that uses <fragment> tags,
 * extracting their contents and updating the DOM.
 *
 * As complete <fragment> blocks are found in the stream, each is parsed and
 * its inner content is immediately inserted into its target using the specified
 * replacement strategy. If the inserted content includes a timer attribute,
 * a delayed callback is set up: after the delay, if an API call is defined on that
 * element, the API is triggered; otherwise, the element is removed (if the target
 * strategy is "this(remove)") and a published signal is emitted if available.
 */

import { Logger } from './logger.js';
import { parseTargets } from './dom.js';
import { handleAction } from './actions.js';
import { emitSignal } from './signals.js';

/**
 * Helper: Checks if an element has an API call attribute.
 * Returns the HTTP method (string) if found; otherwise null.
 *
 * @param {Element} el - The element to check.
 * @returns {string|null}
 */
function getAPIMethod(el) {
  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  for (const m of methods) {
    if (el.hasAttribute(m)) {
      Logger.debug(`Element has API method: ${m}`);
      return m;
    }
  }
  Logger.debug("No API method attribute found on element.");
  return null;
}

/**
 * Sets up a timer for an element that has a timer attribute.
 * After the delay, if the element has an API call attribute, it triggers the API call;
 * otherwise, if its target attribute is "this(remove)", it removes itself and emits a publish signal if defined.
 *
 * @param {Element} el - The element to set up the timer for.
 */
function setupTimerForElement(el) {
  const timerVal = parseInt(el.getAttribute('timer'), 10);
  Logger.debug(`Setting up timer for element with delay: ${timerVal}ms`);
  setTimeout(() => {
    const apiMethod = getAPIMethod(el);
    if (apiMethod) {
      Logger.info(`Timer triggered: Calling API on element with method ${apiMethod}`);
      handleAction(el, apiMethod, el.getAttribute(apiMethod));
    } else {
      const targetAttr = el.getAttribute('target');
      if (targetAttr && targetAttr.trim().toLowerCase() === "this(remove)") {
        Logger.info(`Timer triggered: Removing element as per target "this(remove)"`);
        el.remove();
      } else {
        Logger.info(`Timer triggered: No API call and no removal strategy; no action taken.`);
      }
      const publishSignal = el.getAttribute('publish');
      if (publishSignal) {
        Logger.info(`Timer triggered: Emitting publish signal "${publishSignal}"`);
        emitSignal(publishSignal);
      }
    }
  }, timerVal);
}

/**
 * Processes the current buffer by extracting complete <fragment> blocks.
 * For each complete fragment found, it extracts the inner content, updates the DOM,
 * and if the inserted element has a timer attribute, sets up the timer.
 * Returns the buffer with all complete fragments removed.
 *
 * @param {string} buffer - The current accumulated buffer from the stream.
 * @returns {string} The buffer with complete fragments removed.
 */
export function processFragmentBuffer(buffer) {
  Logger.debug("Processing fragment buffer. Current buffer:", buffer);
  const fragmentRegex = /<fragment\b[^>]*>[\s\S]*?<\/fragment>/gi;
  let match;
  
  while ((match = fragmentRegex.exec(buffer)) !== null) {
    const fragmentHTML = match[0];
    Logger.debug("Found fragment HTML:", fragmentHTML);
    
    // Parse the fragment HTML.
    const template = document.createElement('template');
    template.innerHTML = fragmentHTML;
    const fragmentElem = template.content.firstElementChild;
    if (!fragmentElem) {
      Logger.debug("No valid fragment element found in parsed HTML.");
      continue;
    }
    
    const targetAttr = fragmentElem.getAttribute('target');
    if (!targetAttr) {
      Logger.warn("Fragment found without target attribute.");
      continue;
    }
    
    // Extract inner content (exclude the <fragment> wrapper)
    const content = fragmentElem.innerHTML;
    Logger.debug("Extracted fragment content:", content);
    
    const targets = parseTargets(targetAttr);
    Logger.debug("Parsed targets from fragment:", targets);
    
    targets.forEach(target => {
      const targetElements = document.querySelectorAll(target.selector);
      if (targetElements.length === 0) {
        Logger.warn(`No elements found for selector: ${target.selector}`);
        return;
      }
      targetElements.forEach(el => {
        let insertedElement;
        switch (target.strategy) {
          case 'innerHTML':
            Logger.info(`Updating innerHTML of ${target.selector}`);
            el.innerHTML = content;
            insertedElement = el.querySelector('*');
            break;
          case 'outerHTML': {
            Logger.info(`Replacing outerHTML of ${target.selector}`);
            const temp = document.createElement('template');
            temp.innerHTML = content;
            insertedElement = temp.content.firstElementChild;
            el.replaceWith(insertedElement);
            break;
          }
          case 'append':
            Logger.info(`Appending to ${target.selector}`);
            el.insertAdjacentHTML('beforeend', content);
            insertedElement = el.lastElementChild;
            break;
          case 'prepend':
            Logger.info(`Prepending to ${target.selector}`);
            el.insertAdjacentHTML('afterbegin', content);
            insertedElement = el.firstElementChild;
            break;
          case 'before':
            Logger.info(`Inserting before ${target.selector}`);
            el.insertAdjacentHTML('beforebegin', content);
            insertedElement = el.previousElementSibling;
            break;
          case 'after':
            Logger.info(`Inserting after ${target.selector}`);
            el.insertAdjacentHTML('afterend', content);
            insertedElement = el.nextElementSibling;
            break;
          case 'remove':
            Logger.info(`Removing element as per target strategy "remove" for ${target.selector}`);
            el.remove();
            insertedElement = null;
            break;
          default:
            Logger.info(`Using default innerHTML strategy for ${target.selector}`);
            el.innerHTML = content;
            insertedElement = el.querySelector('*');
        }
        if (insertedElement) {
          Logger.debug("Inserted element:", insertedElement);
          if (insertedElement.hasAttribute('timer')) {
            Logger.debug("Inserted element has timer attribute. Setting up timer.");
            setupTimerForElement(insertedElement);
          }
        }
      });
    });
  }
  
  // Remove all processed fragments from the buffer.
  const newBuffer = buffer.replace(fragmentRegex, '');
  Logger.debug("Buffer after removing processed fragments:", newBuffer);
  return newBuffer;
}
