/**
 * @module Actions
 * @description Handles API calls, lifecycle hooks, request side effects, and response processing.
 */

import { Logger } from './logger.js';
import { getCache, setCache } from './cache.js';
import { scheduleUpdate, isSequential } from './utils.js';
import { parseTargets, querySelectorAllResult, querySelectorSafe, updateTarget } from './dom.js';
import { fetchWithTimeout } from './fetchHelper.js';
import { handleURLState } from './urlState.js';
import { processFragmentBuffer } from './fragments.js';
import { emitSignal } from './signals.js';
import { runLifecycleHook } from './hooks.js';

export const DEFAULT_RESPONSE_BUFFER_LIMIT_CHARS = 1024 * 1024;

class ResponseBufferLimitError extends Error {
  constructor(limitChars) {
    super(`HTMLeX response exceeded the ${limitChars} character safety limit.`);
    this.name = 'ResponseBufferLimitError';
    this.limitChars = limitChars;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error');
}

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

function isSelfTarget(target) {
  return String(target?.selector ?? '').trim().toLowerCase() === 'this';
}

function resolveTargetElement(target, fallbackElement) {
  if (isSelfTarget(target)) {
    return fallbackElement;
  }

  return querySelectorSafe(target.selector) || fallbackElement;
}

function resolveSelfTargetElement(target, fallbackElement) {
  return isSelfTarget(target) ? fallbackElement : null;
}

function appendControlValue(formData, control) {
  if (!control.name || control.disabled) return;
  if ((control.type === 'checkbox' || control.type === 'radio') && !control.checked) return;
  if (control instanceof HTMLSelectElement && control.multiple) {
    for (const option of control.selectedOptions) {
      formData.append(control.name, option.value);
    }
    return;
  }
  if (control instanceof HTMLInputElement && control.type === 'file') {
    for (const file of control.files || []) {
      formData.append(control.name, file);
    }
    return;
  }
  formData.append(control.name, control.value);
}

function appendElementValues(formData, element) {
  if (element.tagName.toLowerCase() === 'form') {
    for (const [key, value] of new FormData(element)) {
      formData.append(key, value);
    }
    return;
  }

  if (element.matches('input, select, textarea')) {
    appendControlValue(formData, element);
  }

  for (const input of element.querySelectorAll('input, select, textarea')) {
    appendControlValue(formData, input);
  }
}

const collectSelectorResults = selectors => (
  selectors.map(selector => querySelectorAllResult(selector))
);

const flattenSelectorMatches = results => results.flatMap(({ matches }) => matches);

function resolveSourceElements(sourceAttribute) {
  const sourceExpression = String(sourceAttribute ?? '').trim();
  if (!sourceExpression) return [];

  const selectors = sourceExpression.includes(',')
    ? sourceExpression.split(',').map(selector => selector.trim()).filter(Boolean)
    : [sourceExpression];
  const results = collectSelectorResults(selectors);
  const matchedElements = flattenSelectorMatches(results);

  if (matchedElements.length || sourceExpression.includes(',') || results.every(result => result.valid)) {
    return matchedElements;
  }

  const fallbackResults = collectSelectorResults(sourceExpression.split(/\s+/).filter(Boolean));
  return fallbackResults.every(result => result.valid)
    ? flattenSelectorMatches(fallbackResults)
    : [];
}

function appendExtras(formData, extrasAttribute) {
  for (const pair of String(extrasAttribute ?? '').split(/\s+/).filter(Boolean)) {
    const separatorIndex = pair.indexOf('=');
    const key = separatorIndex >= 0 ? pair.slice(0, separatorIndex) : pair;
    const value = separatorIndex >= 0 ? pair.slice(separatorIndex + 1) : '';
    Logger.system.debug(`Processing extra: ${key} = ${value}`);
    if (key) {
      formData.append(key, value);
    }
  }
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

  const entries = [...formData.entries()].map(([key, value]) => [
    key,
    serializeFormDataValue(value)
  ]);
  return `${method} ${url} ${JSON.stringify(entries)}`;
}

function resetResponseState(element) {
  element._htmlexFragmentsProcessed = false;
  element._htmlexFallbackUpdated = false;
  element._htmlexDefaultUpdated = false;
  element._htmlexFragmentErrorStatus = null;
  element._htmlexStreamingActive = false;
  element._htmlexStreaming = false;
}

function runHook(element, hookName, event = null) {
  runLifecycleHook(element, hookName, event);
}

function getResponseBufferLimit(element) {
  const rawLimit = element?.getAttribute?.('maxresponsechars') ??
    element?.getAttribute?.('max-response-chars') ??
    element?.getAttribute?.('maxresponsebuffer') ??
    element?.getAttribute?.('max-response-buffer');
  const limit = Number.parseInt(rawLimit || '', 10);
  return Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_RESPONSE_BUFFER_LIMIT_CHARS;
}

function appendChunkWithLimit(chunks, currentLength, chunk, limitChars) {
  const nextLength = currentLength + chunk.length;
  if (nextLength > limitChars) {
    throw new ResponseBufferLimitError(limitChars);
  }

  chunks.push(chunk);
  return nextLength;
}

function appendBufferWithLimit(buffer, chunk, limitChars) {
  if (buffer.length + chunk.length > limitChars) {
    throw new ResponseBufferLimitError(limitChars);
  }

  return buffer + chunk;
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
  const remainingContent = processFragmentBuffer(responseText, element, sequentialEntry, swapLifecycle);

  if (!element._htmlexFragmentsProcessed && remainingContent.trim() !== '' && element.hasAttribute('target')) {
    const targets = parseTargets(element.getAttribute('target'));
    for (const target of targets) {
      const resolvedElement = resolveTargetElement(target, element);
      const afterSwap = swapLifecycle?.createUpdateCallback();
      scheduleTargetUpdate(element, target, remainingContent, sequentialEntry, resolvedElement, afterSwap, requestId);
    }
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

  const headerValue = response.headers.get('Emit');
  if (!headerValue) return;

  Logger.system.info(`Received Emit header: ${headerValue}`);
  const headerParts = headerValue.split(';').map(part => part.trim()).filter(Boolean);
  const signalName = headerParts[0] || '';
  let delayMs = 0;

  for (const param of headerParts.slice(1)) {
    if (param.startsWith('delay=')) {
      const parsedDelay = Number.parseInt(param.split('=')[1], 10);
      delayMs = Number.isFinite(parsedDelay) && parsedDelay > 0 ? parsedDelay : 0;
    }
  }

  emitSignalWithDelay(element, signalName, delayMs, 'Emit header');
}

function emitPublishSignal(element) {
  if (!element.hasAttribute('publish')) return;

  const publishSignal = element.getAttribute('publish');
  Logger.system.info(`Emitting signal "${publishSignal}" after successful API call.`);
  emitSignal(publishSignal);

  if (!element.hasAttribute('timer')) return;

  const delay = Number.parseInt(element.getAttribute('timer'), 10);
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

function getFragmentErrorStatus(element) {
  const status = Number.parseInt(element?._htmlexFragmentErrorStatus ?? '', 10);
  return Number.isFinite(status) && status >= 400 ? status : null;
}

function getNumericAttribute(element, attributeNames, defaultValue, validator = value => Number.isFinite(value)) {
  for (const attributeName of attributeNames) {
    if (!element.hasAttribute(attributeName)) continue;
    const value = Number.parseFloat(element.getAttribute(attributeName));
    return validator(value) ? value : defaultValue;
  }

  return defaultValue;
}

function createAbortError(reason) {
  if (reason instanceof Error) return reason;
  const error = new Error('Retry delay aborted');
  error.name = 'AbortError';
  return error;
}

function waitForRetryDelay(delayMs, signal = null) {
  if (delayMs <= 0) return;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError(signal.reason));
      return;
    }

    const timeoutId = setTimeout(() => {
      removeAbortListener();
      resolve();
    }, delayMs);
    const abortListener = () => {
      clearTimeout(timeoutId);
      removeAbortListener();
      reject(createAbortError(signal.reason));
    };
    const removeAbortListener = () => {
      signal?.removeEventListener?.('abort', abortListener);
    };
    signal?.addEventListener?.('abort', abortListener, { once: true });
  });
}

function getRetryDelayForAttempt(element, failedAttemptIndex) {
  const baseDelayMs = getNumericAttribute(
    element,
    ['retrydelay', 'retry-delay'],
    0,
    value => Number.isFinite(value) && value >= 0
  );
  const backoff = getNumericAttribute(
    element,
    ['retrybackoff', 'retry-backoff'],
    1,
    value => Number.isFinite(value) && value >= 1
  );
  const maxDelayMs = getNumericAttribute(
    element,
    ['retrymaxdelay', 'retry-max-delay'],
    Number.POSITIVE_INFINITY,
    value => Number.isFinite(value) && value >= 0
  );
  const scaledDelay = baseDelayMs * (backoff ** failedAttemptIndex);
  return Math.min(scaledDelay, maxDelayMs);
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

  let chunkCount = 0;
  triggeringElement._htmlexFragmentsProcessed = false;
  triggeringElement._htmlexFallbackUpdated = false;
  triggeringElement._htmlexDefaultUpdated = false;
  triggeringElement._htmlexStreamingActive = true;
  triggeringElement._htmlexStreaming = false;

  if (!response.body) {
    triggeringElement._htmlexStreamingActive = false;
    triggeringElement._htmlexStreaming = false;
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fragmentBuffer = '';
  const responseTextChunks = [];
  let responseTextLength = 0;
  let retainResponseText = true;
  const shouldCacheResponse = triggeringElement.hasAttribute('cache');
  const responseBufferLimit = getResponseBufferLimit(triggeringElement);
  const swapLifecycle = createSwapLifecycle(triggeringElement, afterSwapComplete, event);
  const releaseResponseTextIfFragmentOnly = () => {
    if (shouldCacheResponse || !triggeringElement._htmlexFragmentsProcessed) return;
    responseTextChunks.length = 0;
    responseTextLength = 0;
    retainResponseText = false;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        Logger.system.debug("Stream reading complete.");
        break;
      }

      chunkCount += 1;
      triggeringElement._htmlexStreaming = chunkCount > 1;

      const chunk = decoder.decode(value, { stream: true });
      if (retainResponseText) {
        responseTextLength = appendChunkWithLimit(responseTextChunks, responseTextLength, chunk, responseBufferLimit);
      }
      fragmentBuffer = processFragmentBuffer(
        appendBufferWithLimit(fragmentBuffer, chunk, responseBufferLimit),
        triggeringElement,
        sequentialEntry,
        swapLifecycle
      );
      releaseResponseTextIfFragmentOnly();
      Logger.system.debug(`Processed chunk #${chunkCount}. Remaining buffer length:`, fragmentBuffer.length);
    }

    const finalChunk = decoder.decode();
    if (finalChunk) {
      if (retainResponseText) {
        responseTextLength = appendChunkWithLimit(responseTextChunks, responseTextLength, finalChunk, responseBufferLimit);
      }
      fragmentBuffer = processFragmentBuffer(
        appendBufferWithLimit(fragmentBuffer, finalChunk, responseBufferLimit),
        triggeringElement,
        sequentialEntry,
        swapLifecycle
      );
      releaseResponseTextIfFragmentOnly();
    }

    if (!triggeringElement._htmlexFragmentsProcessed && fragmentBuffer.trim() !== '' && triggeringElement.hasAttribute('target')) {
      Logger.system.debug("No fragments processed; performing fallback update with leftover text.");
      const targets = parseTargets(triggeringElement.getAttribute('target'));
      for (const target of targets) {
        const resolvedElement = resolveTargetElement(target, triggeringElement);

        if (resolvedElement === triggeringElement && !isSelfTarget(target)) {
          Logger.system.debug(`Fallback: No element found for selector "${target.selector}". Using triggering element.`);
        }

        Logger.system.debug("Applying fallback update to target:", target, "resolved as:", resolvedElement);
        const afterSwap = swapLifecycle?.createUpdateCallback();
        scheduleTargetUpdate(triggeringElement, target, fragmentBuffer, sequentialEntry, resolvedElement, afterSwap, requestId);
      }
      triggeringElement._htmlexFallbackUpdated = true;
    }

    swapLifecycle?.finishScheduling();
    Logger.system.debug("Completed processing response stream. Final leftover buffer:", fragmentBuffer);
    return retainResponseText ? responseTextChunks.join('') : '';
  } catch (error) {
    try {
      await reader.cancel(error);
    } catch (cancelError) {
      Logger.system.debug('Unable to cancel response reader after processing error:', cancelError);
    }
    throw error;
  } finally {
    triggeringElement._htmlexStreamingActive = false;
    triggeringElement._htmlexStreaming = false;
  }
}

/**
 * Handles an API action including lifecycle hooks, extras, caching,
 * URL state updates, publish signal emission, and polling.
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
    if (getFragmentErrorStatus(element) !== null) return;
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
    for (const sourceElement of resolveSourceElements(element.getAttribute('source'))) {
      appendElementValues(formData, sourceElement);
    }
  }

  // Process extras (inline parameters)
  if (element.hasAttribute('extras')) {
    appendExtras(formData, element.getAttribute('extras'));
  }

  // If a loading state is desired, update the loading target immediately.
  if (element.hasAttribute('loading')) {
    const loadingTargets = parseTargets(element.getAttribute('loading'));
    for (const target of loadingTargets) {
      Logger.system.debug("Updating loading target:", target);
      scheduleUpdate(() => {
        if (element._htmlexRequestId === requestId && element._htmlexRequestPending) {
          const resolvedElement = resolveSelfTargetElement(target, element);
          updateTarget(target, '<div class="loading">Loading...</div>', resolvedElement);
        }
      }, isSequential(element));
    }
  }

  // Merge caller-provided fetch options into our request options.
  const requestOptions = { method, ...fetchOptions };
  let url = endpoint;
  if (method === 'GET') {
    const params = new URLSearchParams(formData).toString();
    if (params) {
      url += (url.includes('?') ? '&' : '?') + params;
    }
    Logger.system.debug("GET request URL with params:", url);
  } else {
    requestOptions.body = formData;
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

  const timeoutMs = Number.parseInt(element.getAttribute('timeout') || '0', 10);
  const rawRetryCount = Number.parseInt(element.getAttribute('retry') || '0', 10);
  const retryCount = Number.isFinite(rawRetryCount) && rawRetryCount > 0 ? rawRetryCount : 0;
  let responseText = null;
  let response = null;

  Logger.system.debug("Initiating fetch attempts. Timeout:", timeoutMs, "Retry count:", retryCount);
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      Logger.system.debug(`Attempt ${attempt + 1}: Fetching URL ${url}`);
      response = await fetchWithTimeout(url, requestOptions, timeoutMs);
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
      const errorMessage = getErrorMessage(error);
      Logger.system.warn(`Attempt ${attempt + 1} failed: ${errorMessage}`);
      if (error?.name === 'AbortError' || fetchOptions.signal?.aborted) {
        completeCurrentRequest();
        return;
      }
      if (attempt === retryCount) {
        completeCurrentRequest();
        if (element.hasAttribute('onerror')) {
          const errorTargets = parseTargets(element.getAttribute('onerror'));
          for (const target of errorTargets) {
            const resolvedElement = resolveSelfTargetElement(target, element);
            Logger.system.debug("Updating error target after failure:", target);
            scheduleTargetUpdate(
              element,
              target,
              `<div class="error">Error: ${escapeHtml(errorMessage)}</div>`,
              htmlexSequentialEntry,
              resolvedElement,
              null,
              requestId
            );
          }
        }
        return;
      }

      try {
        const retryDelayMs = getRetryDelayForAttempt(element, attempt);
        if (retryDelayMs > 0) {
          Logger.system.info(`Waiting ${retryDelayMs}ms before retry attempt ${attempt + 2}.`);
          await waitForRetryDelay(retryDelayMs, fetchOptions.signal);
        }
      } catch (delayError) {
        if (delayError?.name === 'AbortError' || fetchOptions.signal?.aborted) {
          completeCurrentRequest();
          return;
        }
        throw delayError;
      }
    }
  }

  // Fallback update if streaming wasn't used.
  if (element.hasAttribute('target') && !element._htmlexFragmentsProcessed && !element._htmlexFallbackUpdated && responseText) {
    const swapLifecycle = createSwapLifecycle(element, runAfterHook, htmlexEvent);
    const targets = parseTargets(element.getAttribute('target'));
    for (const target of targets) {
      const resolvedElement = resolveTargetElement(target, element);
      if (isSelfTarget(target)) {
        Logger.system.debug("Fallback: target selector is 'this'; using triggering element.");
      } else if (resolvedElement === element) {
        Logger.system.debug(`No element found for selector "${target.selector}". Falling back to triggering element.`);
      }
      Logger.system.debug("Fallback updating target:", target, "resolved as:", resolvedElement);
      const afterSwap = swapLifecycle?.createUpdateCallback();
      scheduleTargetUpdate(element, target, responseText, htmlexSequentialEntry, resolvedElement, afterSwap, requestId);
    }
    swapLifecycle?.finishScheduling();
  }

  const fragmentErrorStatus = getFragmentErrorStatus(element);
  if (fragmentErrorStatus !== null) {
    Logger.system.warn(`Response fragment indicated error status ${fragmentErrorStatus}; skipping success side effects.`);
    return;
  }

  runSuccessSideEffects(element, response);

  if (element.hasAttribute('cache')) {
    const cacheTtl = Number.parseInt(element.getAttribute('cache'), 10);
    setCache(cacheKey, responseText, cacheTtl);
    Logger.system.debug("Response cached with TTL:", cacheTtl);
  }

  if (!element._htmlexOnAfterDeferred) {
    runAfterHook();
  }

}
