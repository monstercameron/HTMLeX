/**
 * @module Actions
 * @description Handles API calls, lifecycle hooks, polling (via a Web Worker), and response processing.
 */

import { Logger } from './logger.js';
import { getCache, setCache } from './cache.js';
import { scheduleUpdate, isSequential } from './utils.js';
import { parseTargets, querySelectorSafe, updateTarget } from './dom.js';
import { fetchWithTimeout } from './fetchHelper.js';
import { handleURLState } from './urlState.js';
import { processFragmentBuffer } from './fragments.js';
import { emitSignal } from './signals.js';

function scheduleTargetUpdate(element, target, content, sequentialEntry = null, resolvedElement = null, afterUpdate = null, requestId = null) {
  const updateFn = () => {
    if (!sequentialEntry && requestId !== null && element._htmlexRequestId !== requestId) {
      if (afterUpdate) afterUpdate();
      return;
    }
    updateTarget(target, content, resolvedElement);
    if (afterUpdate) afterUpdate();
  };

  if (sequentialEntry) {
    sequentialEntry.updates ||= [];
    sequentialEntry.updates.push(updateFn);
    return;
  }

  scheduleUpdate(updateFn, isSequential(element));
}

function appendControlValue(formData, control) {
  if (!control.name || control.disabled) return;
  if ((control.type === 'checkbox' || control.type === 'radio') && !control.checked) return;
  if (control instanceof HTMLSelectElement && control.multiple) {
    Array.from(control.selectedOptions).forEach(option => {
      formData.append(control.name, option.value);
    });
    return;
  }
  if (control instanceof HTMLInputElement && control.type === 'file') {
    Array.from(control.files || []).forEach(file => {
      formData.append(control.name, file);
    });
    return;
  }
  formData.append(control.name, control.value);
}

function appendElementValues(formData, element) {
  if (element.tagName.toLowerCase() === 'form') {
    new FormData(element).forEach((value, key) => formData.append(key, value));
    return;
  }

  if (element.matches('input, select, textarea')) {
    appendControlValue(formData, element);
  }

  element.querySelectorAll('input, select, textarea').forEach(input => {
    appendControlValue(formData, input);
  });
}

function resolveSourceElements(sourceAttr) {
  const raw = String(sourceAttr ?? '').trim();
  if (!raw) return [];

  const selectors = raw.includes(',')
    ? raw.split(',').map(selector => selector.trim()).filter(Boolean)
    : [raw];
  const results = selectors.map(selector => {
    try {
      return {
        valid: true,
        matches: Array.from(document.querySelectorAll(selector))
      };
    } catch (error) {
      Logger.system.warn(`[DOM] Invalid selector "${selector}"`, error);
      return { valid: false, matches: [] };
    }
  });
  const directMatches = results.flatMap(result => result.matches);
  if (directMatches.length || raw.includes(',') || results.every(result => result.valid)) {
    return directMatches;
  }

  const fallbackResults = raw.split(/\s+/).filter(Boolean).map(selector => {
    try {
      return {
        valid: true,
        matches: Array.from(document.querySelectorAll(selector))
      };
    } catch (error) {
      Logger.system.warn(`[DOM] Invalid selector "${selector}"`, error);
      return { valid: false, matches: [] };
    }
  });
  if (!fallbackResults.every(result => result.valid)) {
    return [];
  }
  return fallbackResults.flatMap(result => result.matches);
}

function appendExtras(formData, extrasAttr) {
  String(extrasAttr ?? '').split(/\s+/).filter(Boolean).forEach(pair => {
    const separatorIndex = pair.indexOf('=');
    const key = separatorIndex >= 0 ? pair.slice(0, separatorIndex) : pair;
    const value = separatorIndex >= 0 ? pair.slice(separatorIndex + 1) : '';
    Logger.system.debug(`Processing extra: ${key} = ${value}`);
    if (key) {
      formData.append(key, value);
    }
  });
}

function serializeFormDataValue(value) {
  if (typeof File !== 'undefined' && value instanceof File) {
    return {
      file: value.name,
      size: value.size,
      type: value.type,
      lastModified: value.lastModified
    };
  }

  return String(value ?? '');
}

function buildCacheKey(method, url, formData) {
  if (method === 'GET') {
    return `${method} ${url}`;
  }

  const entries = Array.from(formData.entries()).map(([key, value]) => [
    key,
    serializeFormDataValue(value)
  ]);
  return `${method} ${url} ${JSON.stringify(entries)}`;
}

function resetResponseState(element) {
  element._htmlexFragmentsProcessed = false;
  element._htmlexFallbackUpdated = false;
  element._htmlexDefaultUpdated = false;
  element._htmlexStreamingActive = false;
  element._htmlexStreaming = false;
}

function runHook(element, hookName, event = null) {
  if (!element.hasAttribute(hookName)) return;
  try {
    Logger.system.debug(`Executing ${hookName} hook.`);
    new Function("event", element.getAttribute(hookName))(event);
  } catch (error) {
    Logger.system.error(`Error in ${hookName} hook:`, error);
  }
}

function createSwapLifecycle(element, afterSwapComplete = null, event = null) {
  if (!element.hasAttribute('onafterSwap') && !afterSwapComplete) return null;

  let pending = 0;
  let scheduled = false;
  let schedulingFinished = false;
  let completed = false;

  const maybeComplete = () => {
    if (!schedulingFinished || pending > 0 || completed || !scheduled) return;
    completed = true;
    element._htmlexOnAfterDeferred = false;
    runHook(element, 'onafterSwap', event);
    if (afterSwapComplete) {
      afterSwapComplete();
    }
  };

  return {
    createUpdateCallback() {
      scheduled = true;
      pending += 1;
      if (afterSwapComplete) {
        element._htmlexOnAfterDeferred = true;
      }

      let called = false;
      return () => {
        if (called) return;
        called = true;
        pending -= 1;
        maybeComplete();
      };
    },
    finishScheduling() {
      schedulingFinished = true;
      maybeComplete();
    }
  };
}

function replayResponseText(element, responseText, sequentialEntry = null, afterSwapComplete = null, event = null, requestId = null) {
  resetResponseState(element);
  const swapLifecycle = createSwapLifecycle(element, afterSwapComplete, event);
  const leftover = processFragmentBuffer(responseText, element, sequentialEntry, swapLifecycle);

  if (!element._htmlexFragmentsProcessed && leftover.trim() !== "" && element.hasAttribute("target")) {
    const targets = parseTargets(element.getAttribute("target"));
    targets.forEach(target => {
      let resolvedElement;
      if (target.selector.trim().toLowerCase() === "this") {
        resolvedElement = element;
      } else {
        resolvedElement = querySelectorSafe(target.selector) || element;
      }
      const afterSwap = swapLifecycle?.createUpdateCallback();
      scheduleTargetUpdate(element, target, leftover, sequentialEntry, resolvedElement, afterSwap, requestId);
    });
    element._htmlexFallbackUpdated = true;
  }

  swapLifecycle?.finishScheduling();
  return responseText;
}

function emitSignalWithDelay(element, signalName, delay, context) {
  if (!signalName) return;
  if (delay > 0) {
    element._htmlexDelayedSignalTimers ||= new Set();
    const registrationToken = element._htmlexRegistrationToken;
    const timerId = setTimeout(() => {
      element._htmlexDelayedSignalTimers?.delete(timerId);
      if (!document.body.contains(element)) return;
      if (registrationToken && element._htmlexRegistrationToken !== registrationToken) return;
      Logger.system.info(`Emitting signal "${signalName}" after ${delay}ms delay (${context}).`);
      emitSignal(signalName);
    }, delay);
    element._htmlexDelayedSignalTimers.add(timerId);
    return;
  }

  Logger.system.info(`Emitting signal "${signalName}" immediately (${context}).`);
  emitSignal(signalName);
}

function emitHeaderSignal(element, response) {
  if (!response?.headers) return;

  const emitHeader = response.headers.get('Emit');
  if (!emitHeader) return;

  Logger.system.info(`Received Emit header: ${emitHeader}`);
  const parts = emitHeader.split(';').map(part => part.trim()).filter(Boolean);
  const emitSignalName = parts[0] || '';
  let emitDelay = 0;

  parts.slice(1).forEach(param => {
    if (param.startsWith('delay=')) {
      const parsedDelay = parseInt(param.split('=')[1], 10);
      emitDelay = Number.isFinite(parsedDelay) && parsedDelay > 0 ? parsedDelay : 0;
    }
  });

  emitSignalWithDelay(element, emitSignalName, emitDelay, 'Emit header');
}

function emitPublishSignal(element) {
  if (!element.hasAttribute('publish')) return;

  const publishSignal = element.getAttribute('publish');
  Logger.system.info(`Emitting signal "${publishSignal}" after successful API call.`);
  emitSignal(publishSignal);

  if (!element.hasAttribute('timer')) return;

  const delay = parseInt(element.getAttribute('timer'), 10);
  if (!Number.isFinite(delay) || delay < 0) {
    Logger.system.warn(`[HTMLeX Warning] Ignoring invalid delayed publish timer "${element.getAttribute('timer')}".`);
    return;
  }

  emitSignalWithDelay(element, publishSignal, delay, 'publish timer');
}

function runSuccessSideEffects(element, response = null) {
  handleURLState(element);
  emitHeaderSignal(element, response);
  emitPublishSignal(element);
}

/**
 * Processes a streaming API response.
 * Reads chunks as they arrive from an open connection, accumulating a buffer.
 * For every chunk, any complete <fragment> blocks are extracted and processed.
 * We count chunks so that if more than one chunk is received, we mark the response as streaming
 * (which will cause fragment updates to be applied immediately, bypassing sequential queuing).
 * After the stream ends, any remaining text is used as a fallback update.
 *
 * @param {Response} response - The fetch response.
 * @param {Element} triggeringElement - The element that triggered the API call.
 * @param {object|null} [sequentialEntry=null] - Request-specific queue for sequential updates.
 * @returns {Promise<string>} The final leftover text from the stream.
 */
export async function processResponse(response, triggeringElement, sequentialEntry = null, afterSwapComplete = null, event = null, requestId = null) {
  Logger.system.debug("Starting to process response stream.");
  
  if (triggeringElement.hasAttribute("target")) {
    Logger.system.debug("Triggering element target attribute:", triggeringElement.getAttribute("target"));
  } else {
    Logger.system.debug("Triggering element has no target attribute; will default to itself if needed.");
  }
  
  // Initialize chunk counter.
  let chunkCount = 0;
  triggeringElement._htmlexFragmentsProcessed = false;
  triggeringElement._htmlexFallbackUpdated = false;
  triggeringElement._htmlexDefaultUpdated = false;
  // Mark the element as streaming-active.
  triggeringElement._htmlexStreamingActive = true;
  // Initially assume not streaming.
  triggeringElement._htmlexStreaming = false;

  if (!response.body) {
    triggeringElement._htmlexStreamingActive = false;
    triggeringElement._htmlexStreaming = false;
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let responseText = "";
  const swapLifecycle = createSwapLifecycle(triggeringElement, afterSwapComplete, event);

  try {
    while (true) {
    const { done, value } = await reader.read();
    if (done) {
      Logger.system.debug("Stream reading complete.");
      break;
    }
    chunkCount++;
    // Mark as streaming if more than one chunk is received.
    if (chunkCount > 1) {
      triggeringElement._htmlexStreaming = true;
    }
    const chunk = decoder.decode(value, { stream: true });
    responseText += chunk;
    Logger.system.debug(`Received chunk #${chunkCount}:`, chunk);
    buffer += chunk;
    Logger.system.debug("Buffer before fragment processing (length):", buffer.length);
    // Process complete fragment blocks.
    buffer = processFragmentBuffer(buffer, triggeringElement, sequentialEntry, swapLifecycle);
    Logger.system.debug("Buffer after fragment processing (length):", buffer.length);
  }

  // Final flush: process any remaining complete fragments.
  const finalChunk = decoder.decode();
  responseText += finalChunk;
  Logger.system.debug("Final chunk after stream complete:", finalChunk);
  buffer += finalChunk;
  buffer = processFragmentBuffer(buffer, triggeringElement, sequentialEntry, swapLifecycle);
  Logger.system.debug("Final buffer after processing (length):", buffer.length);

  // Fallback update: if no fragments were processed and leftover text exists.
  if (!triggeringElement._htmlexFragmentsProcessed && buffer.trim() !== "") {
    Logger.system.debug("No fragments processed; performing fallback update with leftover text.");
    if (triggeringElement.hasAttribute("target")) {
      const targets = parseTargets(triggeringElement.getAttribute("target"));
      targets.forEach(target => {
        let resolvedElement;
        if (target.selector.trim().toLowerCase() === "this") {
          resolvedElement = triggeringElement;
          Logger.system.debug("Fallback: target selector is 'this'; using triggering element.");
        } else {
          resolvedElement = querySelectorSafe(target.selector);
          if (!resolvedElement) {
            Logger.system.debug(`Fallback: No element found for selector "${target.selector}". Using triggering element.`);
            resolvedElement = triggeringElement;
          }
        }
        Logger.system.debug("Applying fallback update to target:", target, "resolved as:", resolvedElement);
        const afterSwap = swapLifecycle?.createUpdateCallback();
        scheduleTargetUpdate(triggeringElement, target, buffer, sequentialEntry, resolvedElement, afterSwap, requestId);
      });
      triggeringElement._htmlexFallbackUpdated = true;
    }
  }

  swapLifecycle?.finishScheduling();
    Logger.system.debug("Completed processing response stream. Final leftover buffer:", buffer);
    return responseText;
  } finally {
    // Clear streaming state even when the stream errors or is aborted mid-read.
    triggeringElement._htmlexStreamingActive = false;
    triggeringElement._htmlexStreaming = false;
  }
}

/**
 * Handles an API action including lifecycle hooks, extras, caching,
 * URL state updates, publish signal emission, and polling.
 *
 * Now accepts an extraOptions parameter (defaulting to an empty object)
 * that is merged into the fetch options. This lets the AbortController signal be passed in.
 *
 * @param {Element} element - The element triggering the action.
 * @param {string} method - The HTTP method (e.g., "GET", "POST").
 * @param {string} endpoint - The API endpoint.
 * @param {object} [extraOptions={}] - Extra options to merge into the fetch options.
 */
export async function handleAction(element, method, endpoint, extraOptions = {}) {
  Logger.system.debug("handleAction invoked for element:", element);
  const { htmlexSequentialEntry = null, htmlexEvent = null, ...fetchOptions } = extraOptions;
  element._htmlexOnAfterDeferred = false;
  const requestId = (element._htmlexRequestId || 0) + 1;
  element._htmlexRequestId = requestId;
  element._htmlexRequestPending = true;
  const completeCurrentRequest = () => {
    if (element._htmlexRequestId === requestId) {
      element._htmlexRequestPending = false;
    }
  };
  let afterHookRan = false;
  const runAfterHook = () => {
    if (afterHookRan) return;
    afterHookRan = true;
    runHook(element, 'onafter', htmlexEvent);
  };
  
  // Early guard: if polling is disabled, abort further API calls.
  if (element._pollDisabled) {
    Logger.system.info("Polling has been disabled for this element; aborting API call.");
    completeCurrentRequest();
    return;
  }
  
  // Lifecycle hook: onbefore (before API call starts)
  runHook(element, 'onbefore', htmlexEvent);

  Logger.system.info(`Handling ${method} action for endpoint: ${endpoint}`);

  const formData = new FormData();
  appendElementValues(formData, element);

  if (element.hasAttribute('source')) {
    resolveSourceElements(element.getAttribute('source')).forEach(sourceElement => {
      appendElementValues(formData, sourceElement);
    });
  }

  // Process extras (inline parameters)
  if (element.hasAttribute('extras')) {
    appendExtras(formData, element.getAttribute('extras'));
  }

  // If a loading state is desired, update the loading target immediately.
  if (element.hasAttribute('loading')) {
    const loadingTargets = parseTargets(element.getAttribute('loading'));
    loadingTargets.forEach(target => {
      Logger.system.debug("Updating loading target:", target);
      scheduleUpdate(() => {
        if (element._htmlexRequestId === requestId && element._htmlexRequestPending) {
          const resolvedElement = target.selector.trim().toLowerCase() === 'this' ? element : null;
          updateTarget(target, '<div class="loading">Loading...</div>', resolvedElement);
        }
      }, isSequential(element));
    });
  }

  // Merge caller-provided fetch options into our request options.
  const options = { method, ...fetchOptions };
  let url = endpoint;
  if (method === 'GET') {
    const params = new URLSearchParams(formData).toString();
    if (params) {
      url += (url.includes('?') ? '&' : '?') + params;
    }
    Logger.system.debug("GET request URL with params:", url);
  } else {
    options.body = formData;
    Logger.system.debug("Non-GET request, using FormData body.");
  }
  const cacheKey = buildCacheKey(method, url, formData);

  // Caching support.
  if (element.hasAttribute('cache')) {
    const cached = getCache(cacheKey);
    if (cached !== null) {
      Logger.system.info(`Using cached response for: ${url}`);
      runHook(element, 'onbeforeSwap', htmlexEvent);
      replayResponseText(element, cached, htmlexSequentialEntry, runAfterHook, htmlexEvent, requestId);
      completeCurrentRequest();
      runSuccessSideEffects(element);
      if (!element._htmlexOnAfterDeferred) {
        runAfterHook();
      }
      return;
    }
  }

  const timeoutMs = parseInt(element.getAttribute('timeout') || '0', 10);
  const rawRetryCount = parseInt(element.getAttribute('retry') || '0', 10);
  const retryCount = Number.isFinite(rawRetryCount) && rawRetryCount > 0 ? rawRetryCount : 0;
  let responseText = null;
  let response = null;

  Logger.system.debug("Initiating fetch attempts. Timeout:", timeoutMs, "Retry count:", retryCount);
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      Logger.system.debug(`Attempt ${attempt + 1}: Fetching URL ${url}`);
      response = await fetchWithTimeout(url, options, timeoutMs);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      }

      // Lifecycle hook: onbeforeSwap (before DOM update)
      runHook(element, 'onbeforeSwap', htmlexEvent);

      // Process the response.
      responseText = await processResponse(response, element, htmlexSequentialEntry, runAfterHook, htmlexEvent, requestId);
      completeCurrentRequest();
      Logger.system.debug("Fetch and processing succeeded on attempt", attempt + 1);
      break;
    } catch (error) {
      Logger.system.warn(`Attempt ${attempt + 1} failed: ${error.message}`);
      if (error.name === 'AbortError' || fetchOptions.signal?.aborted) {
        completeCurrentRequest();
        return;
      }
      if (attempt === retryCount) {
        completeCurrentRequest();
        if (element.hasAttribute('onerror')) {
          const errorTargets = parseTargets(element.getAttribute('onerror'));
          errorTargets.forEach(target => {
            const resolvedElement = target.selector.trim().toLowerCase() === 'this' ? element : null;
            Logger.system.debug("Updating error target after failure:", target);
            scheduleTargetUpdate(
              element,
              target,
              `<div class="error">Error: ${error.message}</div>`,
              htmlexSequentialEntry,
              resolvedElement,
              null,
              requestId
            );
          });
        }
        return;
      }
    }
  }

  // Fallback update if streaming wasn't used.
  if (element.hasAttribute('target') && !element._htmlexFragmentsProcessed && !element._htmlexFallbackUpdated && responseText) {
    const swapLifecycle = createSwapLifecycle(element, runAfterHook, htmlexEvent);
    const targets = parseTargets(element.getAttribute('target'));
    targets.forEach(target => {
      let resolvedElement;
      if (target.selector.trim().toLowerCase() === "this") {
        resolvedElement = element;
        Logger.system.debug("Fallback: target selector is 'this'; using triggering element.");
      } else {
        resolvedElement = querySelectorSafe(target.selector);
        if (!resolvedElement) {
          Logger.system.debug(`No element found for selector "${target.selector}". Falling back to triggering element.`);
          resolvedElement = element;
        }
      }
      Logger.system.debug("Fallback updating target:", target, "resolved as:", resolvedElement);
      const afterSwap = swapLifecycle?.createUpdateCallback();
      scheduleTargetUpdate(element, target, responseText, htmlexSequentialEntry, resolvedElement, afterSwap, requestId);
    });
    swapLifecycle?.finishScheduling();
  }

  runSuccessSideEffects(element, response);

  if (element.hasAttribute('cache')) {
    const cacheTTL = parseInt(element.getAttribute('cache'), 10);
    setCache(cacheKey, responseText, cacheTTL);
    Logger.system.debug("Response cached with TTL:", cacheTTL);
  }

  if (!element._htmlexOnAfterDeferred) {
    runAfterHook();
  }

}
