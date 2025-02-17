/**
 * @module Registration
 * @description Scans the DOM for HTMLeX‑enabled elements and registers them.
 *
 * NOTE: Because module namespace objects are immutable, we cannot override
 * the updateTarget property on the imported dom module. Instead, we define a
 * patchedUpdateTarget function here and export it for use by other parts of the
 * framework (e.g. actions.js, fragments.js) to use when updating the DOM.
 */

import { Logger } from './logger.js';
import { registerSignalListener, emitSignal } from './signals.js';
import { handleAction } from './actions.js';
import { debounce, throttle } from './rateLimit.js';
// Import the original updateTarget function from dom.js
import { parseTargets, updateTarget as originalUpdateTarget } from './dom.js';
import { handleWebSocket } from './websocket.js';

/**
 * patchedUpdateTarget
 *
 * When the target selector is empty or defaults to "this", this function ensures
 * that if multiple fragments are returned, the first fragment replaces the content
 * and subsequent fragments are appended.
 *
 * Additionally, if the element is in sequential mode (i.e. has the sequential attr),
 * DOM updates are queued so they can later be inserted in FIFO order with a delay between each.
 *
 * @param {Object} target - The target object (with a .selector property).
 * @param {string} content - The HTML fragment content.
 * @param {Element} resolvedElement - The element to update.
 * @returns {Element|undefined}
 */
export function patchedUpdateTarget(target, content, resolvedElement) {
  const selector = target.selector.trim().toLowerCase();

  // If the resolved element is itself sequential, queue the update.
  if (resolvedElement._htmlexSequentialMode) {
    if (!resolvedElement._htmlexSequentialUpdates) {
      resolvedElement._htmlexSequentialUpdates = [];
    }
    Logger.debug("[DEBUG] patchedUpdateTarget: Queuing sequential update for target", target.selector);
    resolvedElement._htmlexSequentialUpdates.push({ target, content });
    return;
  }
  // For default targets, apply first fragment replacement then append subsequent fragments.
  if (selector === "" || selector === "this") {
    if (!resolvedElement._htmlexDefaultUpdated) {
      resolvedElement._htmlexDefaultUpdated = true;
      Logger.debug("[DEBUG] patchedUpdateTarget: first fragment – replacing content for target", target.selector);
      resolvedElement.innerHTML = content;
      return resolvedElement;
    } else {
      Logger.debug("[DEBUG] patchedUpdateTarget: subsequent fragment – appending content for target", target.selector);
      resolvedElement.innerHTML += content;
      return resolvedElement;
    }
  }
  // For non‑default targets, delegate to the original logic.
  return originalUpdateTarget(target, content, resolvedElement);
}

/**
 * processSequentialQueue
 *
 * Processes the FIFO queue of API calls for a sequential element.
 * After each API call completes, it flushes one queued DOM update and then waits for
 * the full sequential delay before processing the next update.
 * This ensures that if multiple API calls (and corresponding updates) are queued,
 * each update is inserted separately with the configured delay between them.
 *
 * @param {Element} element - The element with the sequential queue.
 */
async function processSequentialQueue(element) {
  element._htmlexSequentialProcessing = true;
  const delay = element._htmlexSequentialDelay || 0;
  Logger.debug("[DEBUG] processSequentialQueue: Starting sequential processing with delay =", delay, "ms");

  // Process as long as there are API calls or queued updates.
  while (
    (element._htmlexSequentialQueue && element._htmlexSequentialQueue.length > 0) ||
    (element._htmlexSequentialUpdates && element._htmlexSequentialUpdates.length > 0)
  ) {
    // If there is an API call queued, process it.
    if (element._htmlexSequentialQueue && element._htmlexSequentialQueue.length > 0) {
      const { promise, method, endpoint } = element._htmlexSequentialQueue.shift();
      Logger.debug("[DEBUG] processSequentialQueue: Awaiting API call promise for endpoint:", endpoint);
      await promise;
      Logger.debug("[DEBUG] processSequentialQueue: API call promise resolved for endpoint:", endpoint);
    }
    // If there is at least one queued update, flush one update.
    if (element._htmlexSequentialUpdates && element._htmlexSequentialUpdates.length > 0) {
      const update = element._htmlexSequentialUpdates.shift();
      let resolvedElement;
      if (update.target.selector.trim().toLowerCase() === "this") {
        resolvedElement = element;
      } else {
        resolvedElement = document.querySelector(update.target.selector);
      }
      if (!resolvedElement) {
        Logger.debug("[DEBUG] processSequentialQueue: Target element not found for selector", update.target.selector);
      } else {
        Logger.debug("[DEBUG] processSequentialQueue: Applying update for target", update.target.selector);
        originalUpdateTarget(update.target, update.content, resolvedElement);
      }
    }
    Logger.debug("[DEBUG] processSequentialQueue: Waiting for sequential delay of", delay, "ms before next flush.");
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  element._htmlexSequentialProcessing = false;
  element._htmlexSequentialMode = false;
  Logger.debug("[DEBUG] processSequentialQueue: Sequential processing complete.");
}

/**
 * flushSequentialUpdates
 *
 * Immediately processes and applies all queued sequential updates for the given element.
 *
 * @param {Element} element - The element with queued sequential updates.
 */
export function flushSequentialUpdates(element) {
  if (element._htmlexSequentialUpdates && element._htmlexSequentialUpdates.length > 0) {
    Logger.debug("[DEBUG] flushSequentialUpdates: Flushing", element._htmlexSequentialUpdates.length, "queued update(s) for element", element);
    while (element._htmlexSequentialUpdates.length > 0) {
      const update = element._htmlexSequentialUpdates.shift();
      let resolvedElement;
      if (update.target.selector.trim().toLowerCase() === "this") {
        resolvedElement = element;
      } else {
        resolvedElement = document.querySelector(update.target.selector);
      }
      if (!resolvedElement) {
        Logger.debug("[DEBUG] flushSequentialUpdates: Target element not found for selector", update.target.selector);
      } else {
        Logger.debug("[DEBUG] flushSequentialUpdates: Applying queued update for target", update.target.selector);
        const result = originalUpdateTarget(update.target, update.content, resolvedElement);
        if (result && result.hasAttribute && result.hasAttribute('timer')) {
          Logger.debug("[DEBUG] flushSequentialUpdates: Inserted element has timer attribute; ensure timer handling is applied.");
        }
      }
    }
  }
}

/** @type {WeakSet<Element>} */
const registeredElements = new WeakSet();

/**
 * Normalizes the trigger event name.
 * If the provided event name starts with "on", it strips the prefix.
 * @param {string} eventName - The raw event name from the attribute.
 * @returns {string} The normalized event name.
 */
function normalizeEvent(eventName) {
  if (!eventName) return '';
  eventName = eventName.trim();
  const normalized = eventName.toLowerCase().startsWith('on')
    ? eventName.slice(2)
    : eventName;
  Logger.debug(`[DEBUG] normalizeEvent: Raw="${eventName}" Normalized="${normalized}"`);
  return normalized;
}

/**
 * Registers an individual element for HTMLeX behavior.
 * @param {Element} element - The element to register.
 */
export function registerElement(element) {
  // Warn if a <button> inside a form does not explicitly specify the type.
  if (
    element.tagName.toLowerCase() === 'button' &&
    !element.hasAttribute('type') &&
    element.closest('form')
  ) {
    const identity =
      element.id
        ? `#${element.id}`
        : element.getAttribute('name')
        ? `[name="${element.getAttribute('name')}"]`
        : element.outerHTML.slice(0, 60) + '...';
    Logger.warn(
      `[HTMLeX Warning] A <button> element (${identity}) inside a form does not specify a type attribute. ` +
      `It defaults to 'submit', which may trigger the form's API/signal in addition to its own. ` +
      `Consider explicitly setting type="button" (or type="submit" if intended).`
    );
  }
  
  if (registeredElements.has(element)) {
    Logger.debug("[DEBUG] Element already registered:", element);
    return;
  }
  Logger.debug("[DEBUG] Registering element:", element);
  registeredElements.add(element);
  
  // Use lowercase method names for detection.
  const methodAttributes = ['get', 'post', 'put', 'delete', 'patch'];
  const method = methodAttributes.find(m => element.hasAttribute(m));
  
  // Get and normalize the trigger event. Default to "submit" for forms or "click" for others.
  const rawTrigger = element.getAttribute('trigger');
  const triggerEvent = rawTrigger 
    ? normalizeEvent(rawTrigger) 
    : (element.tagName.toLowerCase() === 'form' ? 'submit' : 'click');
  Logger.debug(`[DEBUG] triggerEvent for element: ${triggerEvent}`);

  const wrappedHandler = async (event) => {
    Logger.debug(`[DEBUG] Event triggered: type="${event.type}", currentTarget=`, event.currentTarget, " target=", event.target);

    if ((triggerEvent === 'click' || triggerEvent === 'submit') &&
        element.tagName.toLowerCase() !== 'form' &&
        event.currentTarget !== event.target) {
      Logger.debug("[DEBUG] Ignoring event from child element. triggerEvent:", triggerEvent);
      return;
    }
    
    Logger.debug(`[DEBUG] Event accepted: triggerEvent: ${triggerEvent} on element:`, element);
    
    if (method) {
      if (triggerEvent === 'submit') event.preventDefault();
      // Check if the element has a sequential attribute.
      if (element.hasAttribute('sequential')) {
        const seqDelay = parseInt(element.getAttribute('sequential'), 10) || 0;
        element._htmlexSequentialMode = true;
        if (!element._htmlexSequentialQueue) {
          element._htmlexSequentialQueue = [];
          element._htmlexSequentialProcessing = false;
          element._htmlexSequentialDelay = seqDelay;
          Logger.debug("[DEBUG] Initialized sequential queue with delay:", seqDelay, "ms");
        }
        // Fire the API call immediately and store its promise in the sequential queue.
        const promise = handleAction(element, method.toUpperCase(), element.getAttribute(method));
        Logger.debug("[DEBUG] Sequential API call fired for endpoint:", element.getAttribute(method));
        element._htmlexSequentialQueue.push({ promise, method: method.toUpperCase(), endpoint: element.getAttribute(method) });
        Logger.debug("[DEBUG] Enqueued sequential API call. Queue length now:", element._htmlexSequentialQueue.length);
        if (!element._htmlexSequentialProcessing) {
          processSequentialQueue(element);
        }
      } else {
        // Non‑sequential: cancel pending or in-flight API calls.
        if (element._htmlexPendingCall) {
          clearTimeout(element._htmlexPendingCall);
          Logger.debug("[DEBUG] Cancelled previous pending non-sequential API call (timeout) for endpoint:", element.getAttribute(method));
        }
        if (element._htmlexAbortController) {
          element._htmlexAbortController.abort();
          Logger.debug("[DEBUG] Aborted previous in-flight non-sequential API call for endpoint:", element.getAttribute(method));
        }
        element._htmlexAbortController = new AbortController();
        Logger.debug("[DEBUG] Created new AbortController for non-sequential API call for endpoint:", element.getAttribute(method));
        element._htmlexPendingCall = setTimeout(() => {
          Logger.debug("[DEBUG] Executing non-sequential API call for endpoint:", element.getAttribute(method));
          handleAction(element, method.toUpperCase(), element.getAttribute(method), { signal: element._htmlexAbortController.signal })
            .then(() => {
              Logger.debug("[DEBUG] Non-sequential API call completed for endpoint:", element.getAttribute(method));
            })
            .catch(err => {
              Logger.debug("[DEBUG] Non-sequential API call aborted or errored for endpoint:", element.getAttribute(method), err);
            });
          element._htmlexPendingCall = null;
        }, 0);
      }
    } else if (element.hasAttribute('publish')) {
      const publishSignal = element.getAttribute('publish');
      Logger.info(`[DEBUG] Emitting publish signal "${publishSignal}" on event "${triggerEvent}".`);
      emitSignal(publishSignal);
    }
  };

  // Apply debounce/throttle if defined.
  let handler = wrappedHandler;
  const debounceMs = parseInt(element.getAttribute('debounce') || '0', 10);
  if (debounceMs > 0) {
    handler = debounce(handler, debounceMs);
    Logger.debug(`[DEBUG] Applied debounce of ${debounceMs}ms`);
  }
  const throttleMs = parseInt(element.getAttribute('throttle') || '0', 10);
  if (throttleMs > 0) {
    handler = throttle(handler, throttleMs);
    Logger.debug(`[DEBUG] Applied throttle of ${throttleMs}ms`);
  }
  
  element.addEventListener(triggerEvent, handler);
  Logger.info(`[HTMLeX INFO] Registered ${method ? method.toUpperCase() : 'publish'} action on element with event "${triggerEvent}" for endpoint "${method ? element.getAttribute(method) : ''}".`);

  // Revised polling code to respect the "repeat" attribute.
  if (element.hasAttribute('poll')) {
    const pollInterval = parseInt(element.getAttribute('poll'), 10);
    if (pollInterval > 0) {
      const repeatLimit = parseInt(element.getAttribute('repeat') || '0', 10);
      let iterations = 0;
      const intervalId = setInterval(() => {
        if (repeatLimit > 0 && iterations >= repeatLimit) {
          Logger.info(`[DEBUG] Polling reached maximum repeat limit (${repeatLimit}) for element. Clearing interval.`);
          clearInterval(intervalId);
          return;
        }
        Logger.debug("[DEBUG] Polling triggered for element:", element);
        handler(new Event(triggerEvent));
        iterations++;
      }, pollInterval);
      Logger.info(`[DEBUG] Set up polling every ${pollInterval}ms for element with repeat limit: ${repeatLimit || "unlimited"}.`);
    }
  }

  // Auto‑firing based on the "auto" attribute.
  if (element.hasAttribute('auto')) {
    const autoVal = element.getAttribute('auto');
    if (autoVal === 'lazy') {
      const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            Logger.debug("[DEBUG] Lazy auto firing action for element:", element);
            handler(new Event(triggerEvent));
            observer.unobserve(entry.target);
          }
        });
      });
      observer.observe(element);
      Logger.info("[DEBUG] Set up lazy auto firing for element.");
    } else if (autoVal === 'prefetch') {
      handler(new Event(triggerEvent)).then(() => {
        Logger.info("[DEBUG] Prefetch completed for element:", element);
      });
    } else {
      const delay = parseInt(autoVal, 10) || 0;
      setTimeout(() => {
        Logger.debug("[DEBUG] Auto firing action for element after delay:", delay, "ms", element);
        handler(new Event(triggerEvent));
      }, delay);
      Logger.info(`[DEBUG] Auto firing set for element with delay ${delay}ms.`);
    }
  }

  // Publish‑only element registration.
  if (!method && element.hasAttribute('publish')) {
    element.addEventListener(triggerEvent, wrappedHandler);
    Logger.info(`[HTMLeX INFO] Registered publish‑only element for signal "${element.getAttribute('publish')}" with event "${triggerEvent}".`);
    if (element.hasAttribute('auto')) {
      const autoVal = element.getAttribute('auto');
      const delay = parseInt(autoVal, 10) || 0;
      setTimeout(() => {
        const publishSignal = element.getAttribute('publish');
        Logger.info(`[DEBUG] Auto firing publish signal "${publishSignal}" from element with delay ${delay}ms.`);
        emitSignal(publishSignal);
      }, delay);
    }
  }

  // Handle subscriptions using the "subscribe" attribute.
  if (element.hasAttribute('subscribe')) {
    const signals = element.getAttribute('subscribe').split(/\s+/);
    signals.forEach(signalName => {
      registerSignalListener(signalName, () => {
        Logger.debug(`[DEBUG] Signal "${signalName}" triggered listener on element:`, element);
        const methodAttr = methodAttributes.find(m => element.hasAttribute(m));
        if (methodAttr) {
          const endpoint = element.getAttribute(methodAttr);
          Logger.debug(`[DEBUG] Handling subscribed signal with method ${methodAttr.toUpperCase()} for endpoint "${endpoint}".`);
          handleAction(element, methodAttr.toUpperCase(), endpoint);
        }
      });
      Logger.debug(`[DEBUG] Registered subscriber for signal "${signalName}" on element:`, element);
    });
  }

  // Handle WebSocket connections.
  if (element.hasAttribute('socket')) {
    const socketUrl = element.getAttribute('socket');
    Logger.debug("[DEBUG] Setting up WebSocket connection for element:", element, "URL:", socketUrl);
    handleWebSocket(element, socketUrl);
  }

  // --- NEW: Timer Handling for Removal/Update ---
  if (element.hasAttribute('timer')) {
    const timerDelay = parseInt(element.getAttribute('timer'), 10);
    setTimeout(() => {
      const targetAttr = element.getAttribute('target');
      if (targetAttr) {
        const targets = parseTargets(targetAttr);
        targets.forEach(target => {
          let resolvedElement = null;
          if (target.selector.trim().toLowerCase() === "this") {
            resolvedElement = element;
          } else {
            resolvedElement = document.querySelector(target.selector);
          }
          if (!resolvedElement) {
            Logger.warn(`[HTMLeX WARN] Timer triggered: target element "${target.selector}" not found.`);
            return;
          }
          if (target.replacementStrategy && target.replacementStrategy === 'remove') {
            Logger.info(`[HTMLeX INFO] Timer triggered: removing element matching target "${target.selector}"`);
            resolvedElement.remove();
          } else {
            Logger.info(`[HTMLeX INFO] Timer triggered: updating element matching target "${target.selector}" with empty content`);
            patchedUpdateTarget(target, "", resolvedElement);
          }
        });
      } else {
        Logger.info("Timer triggered: No target attribute specified; no action taken.");
      }
    }, timerDelay);
    Logger.info(`[HTMLeX INFO] Timer set for element with delay ${timerDelay}ms.`);
  }
  // --- END NEW: Timer Handling ---
}

/**
 * Scans the DOM for HTMLeX‑enabled elements and registers them.
 * Also sets up a MutationObserver to auto‑register new elements as they are inserted,
 * ensuring progressive rendering (PR) elements get initialized.
 */
export function initHTMLeX() {
  Logger.info("[HTMLeX INFO] Initializing HTMLeX...");
  const selectors = [
    '[get]', '[post]', '[put]', '[delete]', '[patch]',
    '[auto]', '[poll]', '[socket]', '[subscribe]', '[publish]',
    '[debounce]', '[throttle]', '[retry]', '[timeout]', '[cache]', '[timer]', '[sequential]'
  ];
  const selectorString = selectors.join(',');
  
  // Register existing HTMLeX elements.
  const elements = document.querySelectorAll(selectorString);
  elements.forEach(el => registerElement(el));
  Logger.info(`[HTMLeX INFO] Registered ${elements.length} element(s).`);
  
  // Observe for new elements added to the DOM.
  const observer = new MutationObserver(mutationsList => {
    mutationsList.forEach(mutation => {
      if (mutation.type === 'childList' && mutation.addedNodes.length) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches(selectorString)) {
              Logger.debug("[DEBUG] New HTMLeX element found:", node);
              registerElement(node);
            }
            const newElements = node.querySelectorAll(selectorString);
            newElements.forEach(el => {
              Logger.debug("[DEBUG] New descendant HTMLeX element found:", el);
              registerElement(el);
            });
          }
        });
      }
    });
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  Logger.info("[HTMLeX INFO] HTMLeX is now observing for new elements.");
}
