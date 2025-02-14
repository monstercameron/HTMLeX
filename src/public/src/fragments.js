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
 * @param {Element} [triggeringElement=null] - The element that triggered the API call,
 *   used when the fragment target is specified as "this(...)" or when no target is found.
 * @returns {string} The buffer with complete fragments removed.
 */
export function processFragmentBuffer(buffer, triggeringElement = null) {
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
    
    // Get the fragment's target attribute (default to "this(innerHTML)" if missing).
    let fragTargetAttr = fragmentElem.getAttribute('target');
    if (!fragTargetAttr) {
      Logger.warn("Fragment found without target attribute. Defaulting to 'this(innerHTML)'.");
      fragTargetAttr = "this(innerHTML)";
    }
    Logger.debug("Fragment target attribute:", fragTargetAttr);
    
    // Extract inner content (exclude the <fragment> wrapper)
    const content = fragmentElem.innerHTML;
    Logger.debug("Extracted fragment content:", content);
    
    // Parse the fragment's target(s)
    let fragTargets = parseTargets(fragTargetAttr);
    Logger.debug("Parsed fragment targets:", fragTargets);
    
    fragTargets.forEach(target => {
      // --- Override logic for "this" target ---
      if (target.selector.trim().toLowerCase() === "this") {
        Logger.debug(`Fragment target selector is "this". Checking triggering element for an overriding target.`);
        if (triggeringElement && triggeringElement.hasAttribute("target")) {
          const callerTargets = parseTargets(triggeringElement.getAttribute("target"));
          if (callerTargets.length > 0) {
            Logger.debug("Overriding fragment target with caller target(s):", callerTargets);
            // For simplicity, use the first caller target.
            target = callerTargets[0];
          } else {
            Logger.debug("Triggering element has no valid target attribute. Using triggering element as target.");
            target.selector = "this";
          }
        } else {
          Logger.debug("No overriding target on triggering element. Using triggering element as target.");
        }
      }
      // --- End override logic ---
      
      // Resolve target elements based on updated target.
      let targetElements = [];
      if (target.selector.trim().toLowerCase() === "this") {
        targetElements = triggeringElement ? [triggeringElement] : [];
      } else {
        targetElements = document.querySelectorAll(target.selector);
        if (!targetElements || targetElements.length === 0) {
          Logger.debug(`No elements found for selector "${target.selector}". Falling back to triggering element.`);
          targetElements = triggeringElement ? [triggeringElement] : [];
        }
      }
      
      if (!targetElements || targetElements.length === 0) {
        Logger.warn(`No elements resolved for fragment target: ${target.selector}`);
        return;
      }
      
      targetElements.forEach(el => {
        let insertedElement;
        switch (target.strategy) {
          case 'innerHTML':
            Logger.info(`Updating innerHTML of element matching target "${target.selector}"`);
            el.innerHTML = content;
            insertedElement = el.querySelector('*');
            break;
          case 'outerHTML': {
            Logger.info(`Replacing outerHTML of element matching target "${target.selector}"`);
            const temp = document.createElement('template');
            temp.innerHTML = content;
            insertedElement = temp.content.firstElementChild;
            el.replaceWith(insertedElement);
            break;
          }
          case 'append':
            Logger.info(`Appending content to element matching target "${target.selector}"`);
            // Use insertAdjacentHTML with 'beforeend' to append without replacing existing content.
            el.insertAdjacentHTML('beforeend', content);
            insertedElement = el.lastElementChild;
            break;
          case 'prepend':
            Logger.info(`Prepending content to element matching target "${target.selector}"`);
            el.insertAdjacentHTML('afterbegin', content);
            insertedElement = el.firstElementChild;
            break;
          case 'before':
            Logger.info(`Inserting content before element matching target "${target.selector}"`);
            el.insertAdjacentHTML('beforebegin', content);
            insertedElement = el.previousElementSibling;
            break;
          case 'after':
            Logger.info(`Inserting content after element matching target "${target.selector}"`);
            el.insertAdjacentHTML('afterend', content);
            insertedElement = el.nextElementSibling;
            break;
          case 'remove':
            Logger.info(`Removing element as per target strategy "remove" for selector "${target.selector}"`);
            el.remove();
            insertedElement = null;
            break;
          default:
            Logger.info(`Using default innerHTML strategy for target "${target.selector}"`);
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
