/**
 * @module Registration
 * @description Scans the DOM for HTMLeX-enabled elements and registers them.
 *
 * Module namespace objects are immutable, so this module exports a DOM update
 * wrapper for response paths that need sequential queue handling.
 */

import { Logger } from './logger.js';
import { registerSignalListener, emitSignal } from './signals.js';
import { handleAction } from './actions.js';
import { debounce, throttle } from './rateLimit.js';
import { hasHTMLeXMarkup, parseTargets, querySelectorSafe, updateTarget as originalUpdateTarget } from './dom.js';
import { handleWebSocket } from './websocket.js';

const METHOD_ATTRIBUTES = ['get', 'post', 'put', 'delete', 'patch'];
const REGISTRATION_ATTRIBUTES = [
  ...METHOD_ATTRIBUTES,
  'auto', 'poll', 'socket', 'subscribe', 'publish',
  'trigger', 'debounce', 'throttle', 'timer', 'sequential', 'repeat'
];
const REGISTRATION_SELECTORS = [
  '[get]', '[post]', '[put]', '[delete]', '[patch]',
  '[socket]', '[publish]', '[timer]'
];

function getQueuedCount(element, queueKey, cursorKey) {
  const queue = element[queueKey];
  const cursor = element[cursorKey] || 0;
  return queue ? Math.max(queue.length - cursor, 0) : 0;
}

function dequeueQueuedItem(element, queueKey, cursorKey) {
  const queue = element[queueKey];
  const cursor = element[cursorKey] || 0;
  if (!queue || cursor >= queue.length) return null;

  element[cursorKey] = cursor + 1;
  return queue[cursor];
}

function resetElementQueue(element, queueKey, cursorKey) {
  if (element[queueKey]) {
    element[queueKey].length = 0;
  }
  element[cursorKey] = 0;
}

function notifyDOMUpdated(content, root) {
  if (hasHTMLeXMarkup(content)) {
    document.dispatchEvent(new CustomEvent('htmlex:dom-updated', {
      detail: { root }
    }));
  }
}

/**
 * patchedUpdateTarget
 *
 * When the target selector is empty or defaults to "this", this function ensures
 * that if multiple fragments are returned, the first fragment replaces the content
 * and subsequent fragments are appended.
 *
 * Additionally, if the element is in sequential mode (i.e. has the sequential attribute),
 * DOM updates are queued so they can later be inserted in FIFO order with a delay between each.
 *
 * @param {Object} target - The target object (with a .selector property).
 * @param {string} content - The HTML fragment content.
 * @param {Element} resolvedElement - The element to update.
 * @returns {Element|undefined}
 */
export function patchedUpdateTarget(target, content, resolvedElement, options = {}) {
  Logger.system.debug("[HTMLeX] patchedUpdateTarget called with target:", target, "content length:", content.length);
  const { queueSequential = true } = options;
  const selector = target.selector.trim().toLowerCase();

  if (queueSequential && resolvedElement._htmlexSequentialMode) {
    if (!resolvedElement._htmlexSequentialUpdates) {
      resolvedElement._htmlexSequentialUpdates = [];
      resolvedElement._htmlexSequentialUpdatesCursor = 0;
      Logger.system.debug("[HTMLeX] patchedUpdateTarget: Initialized sequential update queue.");
    }
    Logger.system.debug("[HTMLeX] patchedUpdateTarget: Queuing sequential update for target", target.selector);
    resolvedElement._htmlexSequentialUpdates.push({ target, content });
    return;
  }
  if (selector === '' || selector === 'this') {
    if (!resolvedElement._htmlexDefaultUpdated) {
      resolvedElement._htmlexDefaultUpdated = true;
      Logger.system.debug("[HTMLeX] patchedUpdateTarget: First fragment - replacing content for target", target.selector);
      resolvedElement.innerHTML = content;
      notifyDOMUpdated(content, resolvedElement);
      return resolvedElement;
    }

    Logger.system.debug("[HTMLeX] patchedUpdateTarget: Subsequent fragment - appending content for target", target.selector);
    resolvedElement.insertAdjacentHTML('beforeend', content);
    notifyDOMUpdated(content, resolvedElement);
    return resolvedElement;
  }
  Logger.system.debug("[HTMLeX] patchedUpdateTarget: Delegating update to originalUpdateTarget for target", target.selector);
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
  Logger.system.debug("[HTMLeX] processSequentialQueue: Starting sequential processing with delay =", delay, "ms");

  const applyQueuedUpdate = (update) => {
    if (typeof update === 'function') {
      update();
      return;
    }

    let resolvedElement = update.resolvedElement;
    if (!resolvedElement) {
      if (update.target.selector.trim().toLowerCase() === "this") {
        resolvedElement = element;
      } else {
        resolvedElement = querySelectorSafe(update.target.selector);
      }
    }
    if (!resolvedElement) {
      Logger.system.debug("[HTMLeX] processSequentialQueue: Target element not found for selector", update.target.selector);
      return;
    }
    Logger.system.debug("[HTMLeX] processSequentialQueue: Applying update for target", update.target.selector);
    originalUpdateTarget(update.target, update.content, resolvedElement);
    if (update.afterUpdate) update.afterUpdate();
  };

  while (
    getQueuedCount(element, '_htmlexSequentialQueue', '_htmlexSequentialQueueCursor') > 0 ||
    getQueuedCount(element, '_htmlexSequentialUpdates', '_htmlexSequentialUpdatesCursor') > 0
  ) {
    Logger.system.debug(
      "[HTMLeX] processSequentialQueue: API queue length =",
      getQueuedCount(element, '_htmlexSequentialQueue', '_htmlexSequentialQueueCursor'),
      "Update queue length =",
      getQueuedCount(element, '_htmlexSequentialUpdates', '_htmlexSequentialUpdatesCursor')
    );

    // If there is an API call queued, process it.
    if (getQueuedCount(element, '_htmlexSequentialQueue', '_htmlexSequentialQueueCursor') > 0) {
      const sequentialEntry = dequeueQueuedItem(element, '_htmlexSequentialQueue', '_htmlexSequentialQueueCursor');
      if (!sequentialEntry) continue;

      const { promise, method, endpoint, updates = [], registrationToken, abortController } = sequentialEntry;
      Logger.system.debug("[HTMLeX] processSequentialQueue: Awaiting API call promise for endpoint:", endpoint);
      await promise;
      Logger.system.debug("[HTMLeX] processSequentialQueue: API call promise resolved for endpoint:", endpoint);
      if (
        abortController?.signal.aborted ||
        !document.body.contains(element) ||
        (registrationToken && element._htmlexRegistrationToken !== registrationToken)
      ) {
        Logger.system.debug("[HTMLeX] processSequentialQueue: Skipping stale sequential updates for endpoint:", endpoint);
        updates.length = 0;
        continue;
      }
      for (const update of updates) {
        applyQueuedUpdate(update);
      }
      updates.length = 0;
    }

    // If there is at least one queued update, flush one update.
    if (getQueuedCount(element, '_htmlexSequentialUpdates', '_htmlexSequentialUpdatesCursor') > 0) {
      const update = dequeueQueuedItem(element, '_htmlexSequentialUpdates', '_htmlexSequentialUpdatesCursor');
      if (update) {
        applyQueuedUpdate(update);
      }
    }
    Logger.system.debug("[HTMLeX] processSequentialQueue: Waiting for sequential delay of", delay, "ms before next flush.");
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  resetElementQueue(element, '_htmlexSequentialQueue', '_htmlexSequentialQueueCursor');
  resetElementQueue(element, '_htmlexSequentialUpdates', '_htmlexSequentialUpdatesCursor');
  element._htmlexSequentialProcessing = false;
  element._htmlexSequentialMode = false;
  Logger.system.debug("[HTMLeX] processSequentialQueue: Sequential processing complete.");
}

/**
 * flushSequentialUpdates
 *
 * Immediately processes and applies all queued sequential updates for the given element.
 *
 * @param {Element} element - The element with queued sequential updates.
 */
export function flushSequentialUpdates(element) {
  if (getQueuedCount(element, '_htmlexSequentialUpdates', '_htmlexSequentialUpdatesCursor') > 0) {
    Logger.system.debug(
      "[HTMLeX] flushSequentialUpdates: Flushing",
      getQueuedCount(element, '_htmlexSequentialUpdates', '_htmlexSequentialUpdatesCursor'),
      "queued update(s) for element",
      element
    );

    while (getQueuedCount(element, '_htmlexSequentialUpdates', '_htmlexSequentialUpdatesCursor') > 0) {
      const update = dequeueQueuedItem(element, '_htmlexSequentialUpdates', '_htmlexSequentialUpdatesCursor');
      if (!update) continue;

      let resolvedElement = update.resolvedElement;
      if (!resolvedElement && update.target.selector.trim().toLowerCase() === "this") {
        resolvedElement = element;
      } else if (!resolvedElement) {
        resolvedElement = querySelectorSafe(update.target.selector);
      }
      if (!resolvedElement) {
        Logger.system.debug("[HTMLeX] flushSequentialUpdates: Target element not found for selector", update.target.selector);
      } else {
        Logger.system.debug("[HTMLeX] flushSequentialUpdates: Applying queued update for target", update.target.selector);
        const result = originalUpdateTarget(update.target, update.content, resolvedElement);
        if (update.afterUpdate) update.afterUpdate();
        if (result && result.hasAttribute && result.hasAttribute('timer')) {
          Logger.system.debug("[HTMLeX] flushSequentialUpdates: Inserted element has timer attribute; ensure timer handling is applied.");
        }
      }
    }
    resetElementQueue(element, '_htmlexSequentialUpdates', '_htmlexSequentialUpdatesCursor');
    Logger.system.debug("[HTMLeX] flushSequentialUpdates: All queued updates flushed.");
  } else {
    Logger.system.debug("[HTMLeX] flushSequentialUpdates: No queued updates to flush for element", element);
  }
}

/** @type {WeakSet<Element>} */
const registeredElements = new WeakSet();
const registrationRecords = new WeakMap();

function getRegistrationSignature(element) {
  return REGISTRATION_ATTRIBUTES
    .map(attributeName => `${attributeName}=${element.getAttribute(attributeName) ?? ''}`)
    .join('|');
}

function cleanupElementRegistration(element) {
  const record = registrationRecords.get(element);
  if (!record) return;

  for (const cleanup of record.cleanupFns) {
    try {
      cleanup();
    } catch (error) {
      Logger.system.error("[HTMLeX] Error cleaning up element registration:", error);
    }
  }
  registrationRecords.delete(element);
  registeredElements.delete(element);
  if (element._htmlexRegistrationToken === record.token) {
    delete element._htmlexRegistrationToken;
  }
  element.removeAttribute('data-htmlex-registered');
}

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
  const normalizedLowercase = normalized.toLowerCase();
  Logger.system.debug(`[HTMLeX] normalizeEvent: Raw="${eventName}" Normalized="${normalizedLowercase}"`);
  return normalizedLowercase;
}

function snapshotEvent(event) {
  if (!event) return null;
  return {
    type: event.type,
    target: event.target,
    currentTarget: event.currentTarget,
    defaultPrevented: event.defaultPrevented,
    preventDefault: () => event.preventDefault?.(),
    stopPropagation: () => event.stopPropagation?.(),
    stopImmediatePropagation: () => event.stopImmediatePropagation?.()
  };
}

function getActionMethod(element) {
  return METHOD_ATTRIBUTES.find(methodAttribute => element.hasAttribute(methodAttribute));
}

function isSequentialEnabled(element) {
  return element.hasAttribute('sequential') && element.getAttribute('sequential')?.trim().toLowerCase() !== 'false';
}

function getDefaultTriggerEvent(element) {
  return element.tagName.toLowerCase() === 'form' ? 'submit' : 'click';
}

function resolveTargetElement(target, fallbackElement) {
  if (target.selector.trim().toLowerCase() === 'this') {
    return fallbackElement;
  }

  return querySelectorSafe(target.selector);
}

function cleanupSocket(element) {
  if (element._htmlexSocket) {
    element._htmlexSocket.disconnect();
    delete element._htmlexSocket;
  }
  if (element._htmlexSocketObserver) {
    element._htmlexSocketObserver.disconnect();
    delete element._htmlexSocketObserver;
  }
}

function runTimerTargetAction(element, targetAttribute) {
  if (!targetAttribute) {
    Logger.system.info("[TIMER] Timer triggered: No target attribute specified; removing the element.");
    element.remove();
    return;
  }

  if (targetAttribute.toLowerCase().includes("(remove)")) {
    if (targetAttribute.toLowerCase().includes("this(remove)")) {
      Logger.system.info(`[TIMER] Timer triggered: Removing element as specified by target "this(remove)".`);
      element.remove();
      return;
    }

    const selector = targetAttribute.replace(/\(remove\)/gi, '').trim();
    const resolvedElement = querySelectorSafe(selector);
    if (resolvedElement) {
      Logger.system.info(`[TIMER] Timer triggered: Removing element matching selector "${selector}".`);
      resolvedElement.remove();
    } else {
      Logger.system.warn(`[TIMER] Timer triggered: No element found for selector "${selector}" to remove.`);
    }
    return;
  }

  for (const target of parseTargets(targetAttribute)) {
    const resolvedElement = resolveTargetElement(target, element);
    if (resolvedElement) {
      Logger.system.info(`[TIMER] Timer triggered: Clearing content of element matching target "${target.selector}".`);
      resolvedElement.innerHTML = "";
    }
  }
}

function runTimerAction(element) {
  const methodAttribute = getActionMethod(element);
  if (methodAttribute) {
    Logger.system.info(`[TIMER] Timer triggered: Calling API with method ${methodAttribute.toUpperCase()}.`);
    handleAction(element, methodAttribute.toUpperCase(), element.getAttribute(methodAttribute), { htmlexEvent: new Event('timer') });
    return;
  }

  if (element.hasAttribute('publish')) {
    const publishSignal = element.getAttribute('publish');
    Logger.system.info(`[TIMER] Timer triggered: Emitting publish signal "${publishSignal}".`);
    emitSignal(publishSignal);
    return;
  }

  runTimerTargetAction(element, element.getAttribute('target'));
}

function registerTimer(element, registrationToken, cleanupFns) {
  if (!element.hasAttribute('timer')) return;

  if (element.hasAttribute('data-timer-set')) {
    Logger.system.debug("[HTMLeX] Timer already set for element:", element);
    return;
  }

  const timerDelayMs = Number.parseInt(element.getAttribute('timer'), 10);
  if (!Number.isFinite(timerDelayMs) || timerDelayMs < 0) {
    Logger.system.warn(`[HTMLeX Warning] Ignoring invalid timer delay "${element.getAttribute('timer')}".`);
    return;
  }

  Logger.system.info(`[HTMLeX INFO] Timer set for element with delay ${timerDelayMs}ms.`);
  const timerAttributeValue = element.getAttribute('timer');
  element.setAttribute('data-timer-set', 'true');

  const timerId = setTimeout(() => {
    if (element._htmlexRegistrationToken !== registrationToken || !document.body.contains(element)) return;
    if (element.getAttribute('timer') !== timerAttributeValue) {
      Logger.system.debug("[TIMER] Skipping stale timer because its timer attribute changed or was removed:", element);
      return;
    }
    Logger.system.debug("[TIMER] Timer callback triggered for element:", element);
    runTimerAction(element);
  }, timerDelayMs);

  cleanupFns.push(() => {
    clearTimeout(timerId);
    element.removeAttribute('data-timer-set');
  });
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
    Logger.system.warn(
      `[HTMLeX Warning] A <button> element (${identity}) inside a form does not specify a type attribute. ` +
      `It defaults to 'submit', which may trigger the form's API/signal in addition to its own. ` +
      `Consider explicitly setting type="button" (or type="submit" if intended).`
    );
  }
  
  const registrationSignature = getRegistrationSignature(element);
  const existingRecord = registrationRecords.get(element);
  if (registeredElements.has(element) && existingRecord?.signature === registrationSignature) {
    Logger.system.debug("[HTMLeX] Element already registered:", element);
    return;
  }
  if (registeredElements.has(element)) {
    Logger.system.debug("[HTMLeX] Element registration-affecting attributes changed. Re-registering:", element);
    cleanupElementRegistration(element);
  }

  Logger.system.debug("[HTMLeX] Registering element:", element);
  registeredElements.add(element);
  element.setAttribute('data-htmlex-registered', 'true');
  const cleanupFns = [];
  const registrationToken = Symbol('htmlexRegistration');
  element._htmlexRegistrationToken = registrationToken;
  cleanupFns.push(() => {
    element._htmlexRequestId = (element._htmlexRequestId || 0) + 1;
    element._htmlexRequestPending = false;
    if (element._htmlexPendingCall) {
      clearTimeout(element._htmlexPendingCall);
      element._htmlexPendingCall = null;
    }
    if (element._htmlexAbortController) {
      element._htmlexAbortController.abort();
      element._htmlexAbortController = null;
    }
    if (element._htmlexSequentialAbortControllers) {
      for (const controller of element._htmlexSequentialAbortControllers) {
        controller.abort();
      }
      element._htmlexSequentialAbortControllers.clear();
    }
    if (element._htmlexDelayedSignalTimers) {
      for (const timerId of element._htmlexDelayedSignalTimers) {
        clearTimeout(timerId);
      }
      element._htmlexDelayedSignalTimers.clear();
    }
    if (element._htmlexSequentialQueue) {
      resetElementQueue(element, '_htmlexSequentialQueue', '_htmlexSequentialQueueCursor');
    }
    if (element._htmlexSequentialUpdates) {
      resetElementQueue(element, '_htmlexSequentialUpdates', '_htmlexSequentialUpdatesCursor');
    }
    element._htmlexSequentialMode = false;
    element._htmlexSequentialProcessing = false;
  });
  
  const methodAttribute = getActionMethod(element);
  
  const rawTrigger = element.getAttribute('trigger');
  const triggerEvent = rawTrigger 
    ? normalizeEvent(rawTrigger) 
    : getDefaultTriggerEvent(element);
  Logger.system.debug(`[HTMLeX] triggerEvent for element: ${triggerEvent}`);
  const actionSelector = '[get], [post], [put], [delete], [patch], [publish]';
  
  const wrappedHandler = async (event) => {
    Logger.system.debug(`[HTMLeX] Event triggered: type="${event.type}", currentTarget=`, event.currentTarget, "target=", event.target);

    if (element._htmlexRegistrationToken !== registrationToken) {
      Logger.system.debug("[HTMLeX] Ignoring event for stale element registration:", element);
      return;
    }

    if (!document.body.contains(element)) {
      Logger.system.debug("[HTMLeX] Ignoring event for removed element:", element);
      return;
    }

    const nestedAction = event.target instanceof Element ? event.target.closest(actionSelector) : null;
    if (
      (triggerEvent === 'click' || triggerEvent === 'submit') &&
      element.tagName.toLowerCase() !== 'form' &&
      nestedAction &&
      nestedAction !== element
    ) {
      Logger.system.debug("[HTMLeX] Ignoring event from nested HTMLeX action. triggerEvent:", triggerEvent);
      return;
    }
    
    Logger.system.debug(`[HTMLeX] Event accepted: triggerEvent: ${triggerEvent} on element:`, element);
    const htmlexEvent = snapshotEvent(event);
    
    if (methodAttribute) {
      if (triggerEvent === 'submit') event.preventDefault();
      if (isSequentialEnabled(element)) {
        const sequentialDelay = Number.parseInt(element.getAttribute('sequential'), 10) || 0;
        element._htmlexSequentialMode = true;
        if (!element._htmlexSequentialQueue) {
          element._htmlexSequentialQueue = [];
          element._htmlexSequentialQueueCursor = 0;
          element._htmlexSequentialProcessing = false;
          element._htmlexSequentialDelay = sequentialDelay;
          Logger.system.debug("[HTMLeX] Initialized sequential queue with delay:", sequentialDelay, "ms");
        }
        const abortController = new AbortController();
        element._htmlexSequentialAbortControllers ||= new Set();
        element._htmlexSequentialAbortControllers.add(abortController);
        const sequentialEntry = {
          method: methodAttribute.toUpperCase(),
          endpoint: element.getAttribute(methodAttribute),
          updates: [],
          registrationToken,
          abortController
        };
        const promise = handleAction(
          element,
          sequentialEntry.method,
          sequentialEntry.endpoint,
          { signal: abortController.signal, htmlexSequentialEntry: sequentialEntry, htmlexEvent }
        ).finally(() => {
          element._htmlexSequentialAbortControllers?.delete(abortController);
        });
        sequentialEntry.promise = promise;
        Logger.system.debug("[HTMLeX] Sequential API call fired for endpoint:", element.getAttribute(methodAttribute));
        element._htmlexSequentialQueue.push(sequentialEntry);
        Logger.system.debug("[HTMLeX] Enqueued sequential API call. Queue length now:", element._htmlexSequentialQueue.length);
        if (!element._htmlexSequentialProcessing) {
          processSequentialQueue(element);
        }
      } else {
        // Non-sequential: cancel pending or in-flight API calls.
        if (element._htmlexPendingCall) {
          clearTimeout(element._htmlexPendingCall);
          Logger.system.debug("[HTMLeX] Cancelled previous pending non-sequential API call (timeout) for endpoint:", element.getAttribute(methodAttribute));
        }
        if (element._htmlexAbortController) {
          element._htmlexAbortController.abort();
          Logger.system.debug("[HTMLeX] Aborted previous in-flight non-sequential API call for endpoint:", element.getAttribute(methodAttribute));
        }
        element._htmlexAbortController = new AbortController();
        Logger.system.debug("[HTMLeX] Created new AbortController for non-sequential API call for endpoint:", element.getAttribute(methodAttribute));
        element._htmlexPendingCall = setTimeout(() => {
          Logger.system.debug("[HTMLeX] Executing non-sequential API call for endpoint:", element.getAttribute(methodAttribute));
          (async () => {
            try {
              await handleAction(element, methodAttribute.toUpperCase(), element.getAttribute(methodAttribute), {
                signal: element._htmlexAbortController.signal,
                htmlexEvent
              });
              Logger.system.debug("[HTMLeX] Non-sequential API call completed for endpoint:", element.getAttribute(methodAttribute));
            } catch (error) {
              Logger.system.debug("[HTMLeX] Non-sequential API call aborted or errored for endpoint:", element.getAttribute(methodAttribute), error);
            }
          })();
          element._htmlexPendingCall = null;
        }, 0);
      }
    } else if (element.hasAttribute('publish')) {
      const publishSignal = element.getAttribute('publish');
      Logger.system.info(`[HTMLeX] Emitting publish signal "${publishSignal}" on event "${triggerEvent}".`);
      emitSignal(publishSignal);
    }
  };

  // Apply debounce/throttle if defined.
  let handler = wrappedHandler;
  const rateLimitCleanups = [];
  const debounceMs = Number.parseInt(element.getAttribute('debounce') || '0', 10);
  if (debounceMs > 0) {
    const debouncedHandler = debounce(handler, debounceMs);
    rateLimitCleanups.push(() => debouncedHandler.cancel?.());
    handler = debouncedHandler;
    Logger.system.debug(`[HTMLeX] Applied debounce of ${debounceMs}ms`);
  }
  const throttleMs = Number.parseInt(element.getAttribute('throttle') || '0', 10);
  if (throttleMs > 0) {
    const throttledHandler = throttle(handler, throttleMs);
    rateLimitCleanups.push(() => throttledHandler.cancel?.());
    handler = throttledHandler;
    Logger.system.debug(`[HTMLeX] Applied throttle of ${throttleMs}ms`);
  }
  if (rateLimitCleanups.length) {
    cleanupFns.push(() => {
      for (const cleanup of rateLimitCleanups) {
        cleanup();
      }
    });
  }
  
  const eventListener = (event) => {
    if (triggerEvent === 'submit' && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    return handler(event);
  };
  element.addEventListener(triggerEvent, eventListener);
  cleanupFns.push(() => element.removeEventListener(triggerEvent, eventListener));
  Logger.system.info(`[HTMLeX INFO] Registered ${methodAttribute ? methodAttribute.toUpperCase() : 'publish'} action on element with event "${triggerEvent}" for endpoint "${methodAttribute ? element.getAttribute(methodAttribute) : ''}".`);

  // Revised polling code to respect the "repeat" attribute.
  if (element.hasAttribute('poll')) {
    const rawPollInterval = Number.parseInt(element.getAttribute('poll'), 10);
    const pollInterval = Number.isFinite(rawPollInterval) && rawPollInterval > 0
      ? Math.max(rawPollInterval, 100)
      : 0;
    if (pollInterval > 0) {
      const repeatLimit = Number.parseInt(element.getAttribute('repeat') || '0', 10);
      let pollIterationCount = 0;
      let pollRemovalObserver = null;
      const clearPolling = () => {
        clearInterval(intervalId);
        element._htmlexPollIntervalId = null;
        if (pollRemovalObserver) {
          pollRemovalObserver.disconnect();
          pollRemovalObserver = null;
        }
      };
      const intervalId = setInterval(() => {
        if (!document.body.contains(element)) {
          Logger.system.info("[HTMLeX INFO] Polling element removed. Clearing interval.");
          clearPolling();
          return;
        }
        if (repeatLimit > 0 && pollIterationCount >= repeatLimit) {
          Logger.system.info(`[HTMLeX INFO] Polling reached maximum repeat limit (${repeatLimit}) for element. Clearing interval.`);
          clearPolling();
          return;
        }
        Logger.system.debug("[HTMLeX] Polling triggered for element:", element);
        handler(new Event(triggerEvent));
        pollIterationCount += 1;
      }, pollInterval);
      element._htmlexPollIntervalId = intervalId;
      pollRemovalObserver = new MutationObserver(() => {
        if (!document.body.contains(element)) {
          Logger.system.info("[HTMLeX INFO] Polling element removed. Clearing interval.");
          clearPolling();
        }
      });
      pollRemovalObserver.observe(document.body, { childList: true, subtree: true });
      element._htmlexPollRemovalObserver = pollRemovalObserver;
      cleanupFns.push(clearPolling);
      Logger.system.info(`[HTMLeX INFO] Set up polling every ${pollInterval}ms for element with repeat limit: ${repeatLimit || "unlimited"}.`);
    }
  }

  // Auto-firing based on the "auto" attribute.
  if (element.hasAttribute('auto')) {
    const autoValue = String(element.getAttribute('auto') ?? '').trim();
    const autoMode = autoValue.toLowerCase();
    if (autoMode === 'false') {
      Logger.system.info("[HTMLeX INFO] Auto firing disabled for element.");
    } else if (autoMode === 'lazy') {
      if (typeof IntersectionObserver !== 'function') {
        Logger.system.warn("[HTMLeX Warning] IntersectionObserver unavailable. Firing lazy auto action immediately.");
        handler(new Event(triggerEvent));
      } else {
        let lazyRemovalObserver = null;
        const cleanupLazyObserver = (observer) => {
          observer.disconnect();
          if (lazyRemovalObserver) {
            lazyRemovalObserver.disconnect();
            lazyRemovalObserver = null;
          }
          element._htmlexLazyObserver = null;
          element._htmlexLazyRemovalObserver = null;
        };
        const observer = new IntersectionObserver((entries, observer) => {
          for (const entry of entries) {
            if (!document.body.contains(element)) {
              cleanupLazyObserver(observer);
              return;
            }
            if (entry.isIntersecting) {
              Logger.system.debug("[HTMLeX] Lazy auto firing action for element:", element);
              handler(new Event(triggerEvent));
              cleanupLazyObserver(observer);
            }
          }
        });
        observer.observe(element);
        lazyRemovalObserver = new MutationObserver(() => {
          if (!document.body.contains(element)) {
            Logger.system.info("[HTMLeX INFO] Lazy auto element removed. Disconnecting observer.");
            cleanupLazyObserver(observer);
          }
        });
        lazyRemovalObserver.observe(document.body, { childList: true, subtree: true });
        element._htmlexLazyObserver = observer;
        element._htmlexLazyRemovalObserver = lazyRemovalObserver;
        cleanupFns.push(() => cleanupLazyObserver(observer));
        Logger.system.info("[HTMLeX INFO] Set up lazy auto firing for element.");
      }
    } else if (autoMode === 'prefetch') {
      (async () => {
        try {
          await handler(new Event(triggerEvent));
          Logger.system.info("[HTMLeX INFO] Prefetch completed for element:", element);
        } catch (error) {
          Logger.system.error("[HTMLeX ERROR] Prefetch failed for element:", element, error);
        }
      })();
    } else {
      const delay = Number.parseInt(autoValue, 10) || 0;
      const autoTimerId = setTimeout(() => {
        if (!document.body.contains(element)) return;
        Logger.system.debug("[HTMLeX] Auto firing action for element after delay:", delay, "ms", element);
        handler(new Event(triggerEvent));
      }, delay);
      cleanupFns.push(() => clearTimeout(autoTimerId));
      Logger.system.info(`[HTMLeX INFO] Auto firing set for element with delay ${delay}ms.`);
    }
  }

  // Publish-only element registration.
  if (!methodAttribute && element.hasAttribute('publish')) {
    Logger.system.info(`[HTMLeX INFO] Registered publish-only element for signal "${element.getAttribute('publish')}" with event "${triggerEvent}".`);
  }

  // Handle subscriptions using the "subscribe" attribute.
  if (element.hasAttribute('subscribe')) {
    const signals = element.getAttribute('subscribe').split(/\s+/).filter(Boolean);
    const unsubscribers = [];
    let subscribeRemovalObserver = null;
    const cleanupSubscriptions = () => {
      while (unsubscribers.length) {
        const unsubscribe = unsubscribers.pop();
        unsubscribe();
      }
      if (subscribeRemovalObserver) {
        subscribeRemovalObserver.disconnect();
        subscribeRemovalObserver = null;
      }
      element._htmlexSubscribeRemovalObserver = null;
    };

    for (const signalName of signals) {
      const unsubscribe = registerSignalListener(signalName, () => {
        if (element._htmlexRegistrationToken !== registrationToken) {
          cleanupSubscriptions();
          return;
        }
        if (!document.body.contains(element)) {
          cleanupSubscriptions();
          return;
        }
        Logger.system.debug(`[HTMLeX] Signal "${signalName}" triggered listener on element:`, element);
        const subscribedMethod = getActionMethod(element);
        if (subscribedMethod) {
          const endpoint = element.getAttribute(subscribedMethod);
          Logger.system.debug(`[HTMLeX] Handling subscribed signal with method ${subscribedMethod.toUpperCase()} for endpoint "${endpoint}".`);
          handleAction(element, subscribedMethod.toUpperCase(), endpoint, { htmlexEvent: new Event('signal') });
        }
      });
      unsubscribers.push(unsubscribe);
      Logger.system.debug(`[HTMLeX] Registered subscriber for signal "${signalName}" on element:`, element);
    }

    if (unsubscribers.length) {
      subscribeRemovalObserver = new MutationObserver(() => {
        if (!document.body.contains(element)) {
          cleanupSubscriptions();
        }
      });
      subscribeRemovalObserver.observe(document.body, { childList: true, subtree: true });
      element._htmlexSubscribeRemovalObserver = subscribeRemovalObserver;
    }
    cleanupFns.push(cleanupSubscriptions);
  }

  // Handle WebSocket connections.
  if (element.hasAttribute('socket')) {
    const socketUrl = element.getAttribute('socket');
    Logger.system.debug("[HTMLeX] Setting up WebSocket connection for element:", element, "URL:", socketUrl);
    handleWebSocket(element, socketUrl);
    cleanupFns.push(() => cleanupSocket(element));
  }

  registerTimer(element, registrationToken, cleanupFns);

  registrationRecords.set(element, {
    signature: registrationSignature,
    cleanupFns,
    token: registrationToken
  });
}

/**
 * Scans the DOM for HTMLeX-enabled elements and registers them.
 * Also sets up a MutationObserver to auto-register new elements as they are inserted,
 * ensuring progressive rendering (PR) elements get initialized.
 */
export function initHTMLeX() {
  Logger.system.info("[HTMLeX INFO] Initializing HTMLeX...");
  if (window.__htmlexObserver) {
    window.__htmlexObserver.disconnect();
  }
  if (window.__htmlexDomUpdatedHandler) {
    document.removeEventListener('htmlex:dom-updated', window.__htmlexDomUpdatedHandler);
  }
  const selectorString = REGISTRATION_SELECTORS.join(',');

  const registerTree = (node) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches(selectorString)) {
      Logger.system.debug("[HTMLeX] HTMLeX element found:", node);
      registerElement(node);
    }
    const newElements = node.querySelectorAll(selectorString);
    for (const el of newElements) {
      Logger.system.debug("[HTMLeX] Descendant HTMLeX element found:", el);
      registerElement(el);
    }
  };
  
  // Register existing HTMLeX elements.
  const elements = document.querySelectorAll(selectorString);
  for (const el of elements) {
    registerElement(el);
  }
  Logger.system.info(`[HTMLeX INFO] Registered ${elements.length} element(s).`);

  window.__htmlexDomUpdatedHandler = (event) => {
    registerTree(event.detail?.root || document.body);
  };
  document.addEventListener('htmlex:dom-updated', window.__htmlexDomUpdatedHandler);
  
  // Observe for new elements added to the DOM.
  const observer = new MutationObserver(mutationsList => {
    for (const mutation of mutationsList) {
      if (mutation.type === 'attributes') {
        if (
          mutation.target.nodeType === Node.ELEMENT_NODE &&
          registrationRecords.has(mutation.target) &&
          !mutation.target.matches(selectorString)
        ) {
          Logger.system.debug("[HTMLeX] HTMLeX attributes removed. Cleaning up registration:", mutation.target);
          cleanupElementRegistration(mutation.target);
          return;
        }
        registerTree(mutation.target);
        return;
      }
      if (mutation.type === 'childList' && mutation.addedNodes.length) {
        for (const node of mutation.addedNodes) {
          registerTree(node);
        }
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: REGISTRATION_ATTRIBUTES
  });
  window.__htmlexObserver = observer;
  Logger.system.info("[HTMLeX INFO] HTMLeX is now observing for new elements.");
}
