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
    const fragmentHtml = match[0];
    Logger.system.debug("[FRAG] Found fragment HTML:", fragmentHtml);

    const template = document.createElement('template');
    template.innerHTML = fragmentHtml;
    const fragmentElement = template.content.firstElementChild;
    if (!fragmentElement) {
      Logger.system.debug("[FRAG] No valid fragment element found in parsed HTML.");
      continue;
    }

    const statusCode = Number.parseInt(fragmentElement.getAttribute('status') || '', 10);
    if (triggeringElement && Number.isFinite(statusCode) && statusCode >= 400) {
      const currentStatus = Number.parseInt(triggeringElement._htmlexFragmentErrorStatus || '', 10);
      triggeringElement._htmlexFragmentErrorStatus = Number.isFinite(currentStatus)
        ? Math.max(currentStatus, statusCode)
        : statusCode;
      Logger.system.warn(`[FRAG] Fragment reported error status ${statusCode}.`);
    }

    let fragmentTargetAttribute = fragmentElement.getAttribute('target');
    if (!fragmentTargetAttribute) {
      Logger.system.warn("[FRAG] Fragment found without target attribute. Defaulting to 'this(innerHTML)'.");
      fragmentTargetAttribute = "this(innerHTML)";
    }
    Logger.system.debug("[FRAG] Fragment target attribute:", fragmentTargetAttribute);

    // Extract raw inner content so context-sensitive markup such as <tr> survives
    // until the target element can parse it in the right DOM context.
    const content = fragmentHtml
      .replace(/^<fragment\b[^>]*>/i, '')
      .replace(/<\/fragment>\s*$/i, '');
    Logger.system.debug("[FRAG] Extracted fragment content:", content);

    const fragmentTargets = parseTargets(fragmentTargetAttribute);
    Logger.system.debug("[FRAG] Parsed fragment targets:", fragmentTargets);

    for (let target of fragmentTargets) {
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

      let targetElements;
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
        continue;
      }

      for (const targetElement of targetElements) {
        const afterUpdate = swapLifecycle?.createUpdateCallback();
        if (triggeringElement && triggeringElement._htmlexStreaming) {
          Logger.system.debug("[FRAG] Streaming active: updating fragment immediately.");
          patchedUpdateTarget(target, content, targetElement, { forceResolvedElement: true });
        } else if (triggeringElement && triggeringElement._htmlexSequentialMode) {
          Logger.system.debug("[FRAG] Queuing fragment update because triggering element is sequential.");
          if (sequentialEntry) {
            sequentialEntry.updates ||= [];
            sequentialEntry.updates.push(() => {
              patchedUpdateTarget(target, content, targetElement, { forceResolvedElement: true, queueSequential: false });
              if (afterUpdate) afterUpdate();
            });
          } else {
            if (!triggeringElement._htmlexSequentialUpdates) {
              triggeringElement._htmlexSequentialUpdates = [];
              triggeringElement._htmlexSequentialUpdatesCursor = 0;
            }
            triggeringElement._htmlexSequentialUpdates.push(() => {
              patchedUpdateTarget(target, content, targetElement, { forceResolvedElement: true, queueSequential: false });
              if (afterUpdate) afterUpdate();
            });
          }
        } else {
          patchedUpdateTarget(target, content, targetElement, { forceResolvedElement: true });
        }
        if (!(triggeringElement && triggeringElement._htmlexSequentialMode)) {
          if (afterUpdate) afterUpdate();
        }
      }
    }
  }

  const newBuffer = buffer.replace(fragmentRegex, '');
  Logger.system.debug("[FRAG] Buffer after removing processed fragments. New buffer length:", newBuffer.length);
  return newBuffer;
}
