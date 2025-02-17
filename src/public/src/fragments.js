/**
 * @module Fragments
 * @description Processes a streaming HTTP response that uses <fragment> tags,
 * extracting their contents and updating the DOM.
 *
 * As complete <fragment> blocks are found in the stream, each is parsed and
 * its inner content is immediately inserted into its target using the specified
 * replacement strategy. If the inserted content includes a timer attribute,
 * a delayed callback is set up: after the delay, if an API call is defined on that
 * element, the API is triggered; if a publish attribute exists, its signal is emitted;
 * otherwise, if the target string includes a removal instruction (e.g. "this(remove)"
 * or "#id(remove)"), the corresponding element is removed from the DOM.
 */

import { Logger } from './logger.js';
import { parseTargets } from './dom.js';
import { handleAction } from './actions.js';
import { emitSignal } from './signals.js';
// Import patchedUpdateTarget so that sequential updates are properly queued.
import { patchedUpdateTarget } from './registration.js';
import { updateTarget as originalUpdateTarget } from './dom.js';

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
      Logger.system.debug(`Element has API method: ${m}`);
      return m;
    }
  }
  Logger.system.debug("No API method attribute found on element.");
  return null;
}

/**
 * Sets up a timer for an element that has a timer attribute.
 * After the delay, if the element has an API call attribute, it triggers the API call;
 * if it has a publish attribute, it emits that signal;
 * otherwise, if its target attribute includes a removal instruction, it removes the element;
 * if no removal instruction is specified, it clears the target's content.
 *
 * @param {Element} el - The element to set up the timer for.
 */
function setupTimerForElement(el) {
  const timerVal = parseInt(el.getAttribute('timer'), 10);
  Logger.system.debug("[FRAG TIMER] Setting up timer for element:", el, `with delay: ${timerVal}ms`);
  setTimeout(() => {
    Logger.system.debug("[FRAG TIMER] Timer callback fired for element:", el);
    const apiMethod = getAPIMethod(el);
    if (apiMethod) {
      Logger.system.info(`[FRAG TIMER] Timer triggered: Calling API with method ${apiMethod.toUpperCase()}.`);
      handleAction(el, apiMethod.toUpperCase(), el.getAttribute(apiMethod));
      return;
    }
    if (el.hasAttribute('publish')) {
      const publishSignal = el.getAttribute('publish');
      Logger.system.info(`[FRAG TIMER] Timer triggered: Emitting publish signal "${publishSignal}".`);
      emitSignal(publishSignal);
      return;
    }
    const targetAttr = el.getAttribute('target');
    if (targetAttr && targetAttr.toLowerCase().includes("(remove)")) {
      if (targetAttr.toLowerCase().includes("this(remove)")) {
        Logger.system.info("[FRAG TIMER] Timer triggered: Removing element as specified by target 'this(remove)'.");
        el.remove();
        return;
      } else {
        const selector = targetAttr.replace(/\(remove\)/gi, '').trim();
        const resolved = document.querySelector(selector);
        if (resolved) {
          Logger.system.info(`[FRAG TIMER] Timer triggered: Removing element matching selector "${selector}".`);
          resolved.remove();
          return;
        } else {
          Logger.system.warn(`[FRAG TIMER] Timer triggered: No element found for selector "${selector}" to remove.`);
        }
      }
    }
    if (targetAttr) {
      const targets = parseTargets(targetAttr);
      targets.forEach(target => {
        let resolved;
        if (target.selector.trim().toLowerCase() === "this") {
          resolved = el;
        } else {
          resolved = document.querySelector(target.selector);
        }
        if (resolved) {
          Logger.system.info(`[FRAG TIMER] Timer triggered: Clearing content of element matching target "${target.selector}".`);
          resolved.innerHTML = "";
        }
      });
    } else {
      Logger.system.info("[FRAG TIMER] Timer triggered: No target attribute specified; removing the element.");
      el.remove();
    }
  }, timerVal);
}

/**
 * Processes the current buffer by extracting complete <fragment> blocks.
 * For each complete fragment found, it extracts the inner content and updates the DOM.
 * If the triggering element is in streaming mode (as indicated by _htmlexStreaming),
 * updates are applied immediately (bypassing sequential queuing). Otherwise, if the triggering
 * element is in sequential mode, the update is queued; if neither, the update is applied immediately.
 * After insertion, the code scans each target element for any child elements with a timer attribute
 * (that have not yet been processed) and sets up their timers.
 * Returns the buffer with all complete fragments removed.
 *
 * @param {string} buffer - The current accumulated buffer from the stream.
 * @param {Element} [triggeringElement=null] - The element that triggered the API call.
 * @returns {string} The buffer with complete fragments removed.
 */
export function processFragmentBuffer(buffer, triggeringElement = null) {
  Logger.system.debug("[FRAG] Processing fragment buffer. Buffer length:", buffer.length);
  const fragmentRegex = /<fragment\b[^>]*>[\s\S]*?<\/fragment>/gi;
  let match;
  
  while ((match = fragmentRegex.exec(buffer)) !== null) {
    const fragmentHTML = match[0];
    Logger.system.debug("[FRAG] Found fragment HTML:", fragmentHTML);
    
    // Parse the fragment HTML.
    const template = document.createElement('template');
    template.innerHTML = fragmentHTML;
    const fragmentElem = template.content.firstElementChild;
    if (!fragmentElem) {
      Logger.system.debug("[FRAG] No valid fragment element found in parsed HTML.");
      continue;
    }
    
    // Get the fragment's target attribute (default to "this(innerHTML)" if missing).
    let fragTargetAttr = fragmentElem.getAttribute('target');
    if (!fragTargetAttr) {
      Logger.system.warn("[FRAG] Fragment found without target attribute. Defaulting to 'this(innerHTML)'.");
      fragTargetAttr = "this(innerHTML)";
    }
    Logger.system.debug("[FRAG] Fragment target attribute:", fragTargetAttr);
    
    // Extract inner content (exclude the <fragment> wrapper)
    const content = fragmentElem.innerHTML;
    Logger.system.debug("[FRAG] Extracted fragment content:", content);
    
    // Parse the fragment's target(s)
    let fragTargets = parseTargets(fragTargetAttr);
    Logger.system.debug("[FRAG] Parsed fragment targets:", fragTargets);
    
    fragTargets.forEach(target => {
      // --- Override logic for "this" target ---
      if (target.selector.trim().toLowerCase() === "this") {
        Logger.system.debug("[FRAG] Fragment target selector is 'this'. Checking triggering element for an overriding target.");
        if (triggeringElement && triggeringElement.hasAttribute("target")) {
          const callerTargets = parseTargets(triggeringElement.getAttribute("target"));
          if (callerTargets.length > 0) {
            Logger.system.debug("[FRAG] Overriding fragment target with caller target(s):", callerTargets);
            target = callerTargets[0];
          } else {
            Logger.system.debug("[FRAG] Triggering element has no valid target attribute. Using triggering element as target.");
            target.selector = "this";
          }
        } else {
          Logger.system.debug("[FRAG] No overriding target on triggering element. Using triggering element as target.");
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
          Logger.system.debug(`[FRAG] No elements found for selector "${target.selector}". Falling back to triggering element.`);
          targetElements = triggeringElement ? [triggeringElement] : [];
        }
      }
      
      if (!targetElements || targetElements.length === 0) {
        Logger.system.warn("[FRAG] No elements resolved for fragment target:", target.selector);
        return;
      }
      
      // Perform the update.
      targetElements.forEach(el => {
        let insertedElement;
        if (triggeringElement && triggeringElement._htmlexStreaming) {
          Logger.system.debug("[FRAG] Streaming active: updating fragment immediately.");
          insertedElement = patchedUpdateTarget(target, content, el);
        } else if (triggeringElement && triggeringElement._htmlexSequentialMode) {
          Logger.system.debug("[FRAG] Queuing fragment update because triggering element is sequential.");
          if (!triggeringElement._htmlexSequentialUpdates) {
            triggeringElement._htmlexSequentialUpdates = [];
          }
          triggeringElement._htmlexSequentialUpdates.push({ target, content });
        } else {
          insertedElement = patchedUpdateTarget(target, content, el);
        }
        // After update, scan each target element for child elements with a timer attribute.
        // We query the element 'el' instead of relying solely on insertedElement.
        const timerElems = el.querySelectorAll('[timer]');
        timerElems.forEach(timerEl => {
          if (!timerEl.hasAttribute('data-timer-set')) {
            Logger.system.debug("[FRAG] Found timer element:", timerEl);
            setupTimerForElement(timerEl);
            timerEl.setAttribute('data-timer-set', 'true');
            Logger.system.debug("[FRAG] Timer set for element:", timerEl);
          } else {
            Logger.system.debug("[FRAG] Timer already set for element:", timerEl);
          }
        });
      });
    });
  }
  
  const newBuffer = buffer.replace(fragmentRegex, '');
  Logger.system.debug("[FRAG] Buffer after removing processed fragments. New buffer length:", newBuffer.length);
  return newBuffer;
}
