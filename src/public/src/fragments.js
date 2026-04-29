/**
 * @module Fragments
 * @description Processes a streaming HTTP response that uses <fragment> tags,
 * extracting their contents and updating the DOM.
 *
 * As complete <fragment> blocks are found in the stream, each is parsed and
 * its inner content is immediately inserted into its target using the specified
 * replacement strategy. Inserted HTMLeX nodes are registered by the shared DOM
 * update notification path.
 */

import { Logger } from './logger.js';
import { parseTargets, querySelectorAllSafe } from './dom.js';
// Import patchedUpdateTarget so that sequential updates are properly queued.
import { patchedUpdateTarget } from './registration.js';

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
 * @param {object|null} [sequentialEntry=null] - Request-specific queue for sequential updates.
 * @param {object|null} [swapLifecycle=null] - Lifecycle tracker notified after each DOM update.
 * @returns {string} The buffer with complete fragments removed.
 */
export function processFragmentBuffer(buffer, triggeringElement = null, sequentialEntry = null, swapLifecycle = null) {
  Logger.system.debug("[FRAG] Processing fragment buffer. Buffer length:", buffer.length);
  const fragmentRegex = /<fragment\b[^>]*>[\s\S]*?<\/fragment>/gi;
  let match;
  
  while ((match = fragmentRegex.exec(buffer)) !== null) {
    if (triggeringElement) {
      triggeringElement._htmlexFragmentsProcessed = true;
    }
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
    
    // Extract raw inner content so context-sensitive markup such as <tr> survives
    // until the target element can parse it in the right DOM context.
    const content = fragmentHTML
      .replace(/^<fragment\b[^>]*>/i, '')
      .replace(/<\/fragment>\s*$/i, '');
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
        targetElements = querySelectorAllSafe(target.selector);
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
        const afterUpdate = swapLifecycle?.createUpdateCallback();
        if (triggeringElement && triggeringElement._htmlexStreaming) {
          Logger.system.debug("[FRAG] Streaming active: updating fragment immediately.");
          patchedUpdateTarget(target, content, el);
        } else if (triggeringElement && triggeringElement._htmlexSequentialMode) {
          Logger.system.debug("[FRAG] Queuing fragment update because triggering element is sequential.");
          if (sequentialEntry) {
            sequentialEntry.updates ||= [];
            sequentialEntry.updates.push(() => {
              patchedUpdateTarget(target, content, el, { queueSequential: false });
              if (afterUpdate) afterUpdate();
            });
          } else {
            if (!triggeringElement._htmlexSequentialUpdates) {
              triggeringElement._htmlexSequentialUpdates = [];
            }
            triggeringElement._htmlexSequentialUpdates.push(() => {
              patchedUpdateTarget(target, content, el, { queueSequential: false });
              if (afterUpdate) afterUpdate();
            });
          }
        } else {
          patchedUpdateTarget(target, content, el);
        }
        if (!(triggeringElement && triggeringElement._htmlexSequentialMode)) {
          if (afterUpdate) afterUpdate();
        }
      });
    });
  }
  
  const newBuffer = buffer.replace(fragmentRegex, '');
  Logger.system.debug("[FRAG] Buffer after removing processed fragments. New buffer length:", newBuffer.length);
  return newBuffer;
}
