/**
 * @module Actions
 * @description Handles API calls, lifecycle hooks, polling (via a Web Worker), and response processing.
 */

import { Logger } from './logger.js';
import { getCache, setCache } from './cache.js';
import { scheduleUpdate, isSequential } from './utils.js';
import { parseTargets, updateTarget } from './dom.js';
import { fetchWithTimeout } from './fetchHelper.js';
import { handleURLState } from './urlState.js';
import { processFragmentBuffer } from './fragments.js';
import { emitSignal } from './signals.js';
// Import flushSequentialUpdates to support HTTP streaming chunk management.
import { flushSequentialUpdates } from './registration.js';

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
 * @returns {Promise<string>} The final leftover text from the stream.
 */
export async function processResponse(response, triggeringElement) {
  Logger.debug("Starting to process response stream.");

  if (triggeringElement.hasAttribute("target")) {
    Logger.debug("Triggering element target attribute:", triggeringElement.getAttribute("target"));
  } else {
    Logger.debug("Triggering element has no target attribute; will default to itself if needed.");
  }

  // Initialize chunk counter.
  let chunkCount = 0;
  // Mark the element as streaming-active.
  triggeringElement._htmlexStreamingActive = true;
  // Initially assume not streaming.
  triggeringElement._htmlexStreaming = false;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      Logger.debug("Stream reading complete.");
      break;
    }
    chunkCount++;
    // Mark as streaming if more than one chunk is received.
    if (chunkCount > 1) {
      triggeringElement._htmlexStreaming = true;
    }
    const chunk = decoder.decode(value, { stream: true });
    Logger.debug("Received chunk:", chunk);
    buffer += chunk;
    Logger.debug("Buffer before fragment processing:", buffer);
    // Process complete fragment blocks.
    buffer = processFragmentBuffer(buffer, triggeringElement);
    Logger.debug("Buffer after fragment processing:", buffer);
    // (No flush timer is needed here because streaming updates will be applied immediately if streaming.)
  }

  // Final flush: process any remaining complete fragments.
  const finalChunk = decoder.decode();
  Logger.debug("Final chunk after stream complete:", finalChunk);
  buffer += finalChunk;
  buffer = processFragmentBuffer(buffer, triggeringElement);
  Logger.debug("Final buffer after processing:", buffer);

  // Fallback update: if no fragments were processed and leftover text exists.
  if (!triggeringElement._htmlexFragmentsProcessed && buffer.trim() !== "") {
    Logger.debug("No fragments processed; performing fallback update with leftover text.");
    if (triggeringElement.hasAttribute("target")) {
      const targets = parseTargets(triggeringElement.getAttribute("target"));
      targets.forEach(target => {
        let resolvedElement;
        if (target.selector.trim().toLowerCase() === "this") {
          resolvedElement = triggeringElement;
          Logger.debug("Fallback: target selector is 'this'; using triggering element.");
        } else {
          resolvedElement = document.querySelector(target.selector);
          if (!resolvedElement) {
            Logger.debug(`Fallback: No element found for selector "${target.selector}". Using triggering element.`);
            resolvedElement = triggeringElement;
          }
        }
        scheduleUpdate(() => {
          Logger.debug("Applying fallback update to target:", target, "resolved as:", resolvedElement);
          updateTarget(target, buffer, resolvedElement);
        }, isSequential(triggeringElement));
      });
    }
  }

  triggeringElement._htmlexFragmentsProcessed = true;
  // Mark streaming as complete.
  triggeringElement._htmlexStreamingActive = false;
  // Clear streaming flag so that subsequent non-streaming responses use sequential queuing.
  triggeringElement._htmlexStreaming = false;
  Logger.debug("Completed processing response stream. Final leftover buffer:", buffer);
  return buffer;
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
  // Early guard: if polling is disabled, abort further API calls.
  if (element._pollDisabled) {
    Logger.info("Polling has been disabled for this element; aborting API call.");
    return;
  }

  Logger.debug("handleAction called for element:", element);

  // Lifecycle hook: onbefore (before API call starts)
  if (element.hasAttribute('onbefore')) {
    try {
      Logger.debug("Executing onbefore hook for element.");
      new Function("event", element.getAttribute('onbefore'))(null);
    } catch (error) {
      Logger.error("Error in onbefore hook:", error);
    }
  }

  Logger.info(`Handling ${method} action for endpoint: ${endpoint}`);

  const formData = new FormData();
  if (element.tagName.toLowerCase() === 'form') {
    new FormData(element).forEach((value, key) => {
      Logger.debug(`Adding form field from form: ${key} = ${value}`);
      formData.append(key, value);
    });
  } else {
    element.querySelectorAll('input, select, textarea').forEach(input => {
      if (input.name) {
        Logger.debug(`Adding input field: ${input.name} = ${input.value}`);
        formData.append(input.name, input.value);
      }
    });
  }

  if (element.hasAttribute('source')) {
    const selectors = element.getAttribute('source').split(/\s+/);
    selectors.forEach(selector => {
      Logger.debug(`Processing source selector: ${selector}`);
      document.querySelectorAll(selector).forEach(input => {
        if (input.name) {
          Logger.debug(`Adding source input: ${input.name} = ${input.value}`);
          formData.append(input.name, input.value);
        }
      });
    });
  }

  // Process extras (inline parameters)
  if (element.hasAttribute('extras')) {
    const extras = element.getAttribute('extras').split(/\s+/);
    extras.forEach(pair => {
      const [key, value] = pair.split('=');
      Logger.debug(`Processing extra: ${key} = ${value}`);
      if (key && value) {
        formData.append(key, value);
      }
    });
  }

  // If a loading state is desired, update the loading target immediately.
  if (element.hasAttribute('loading')) {
    const loadingTargets = parseTargets(element.getAttribute('loading'));
    loadingTargets.forEach(target => {
      Logger.debug("Updating loading target:", target);
      scheduleUpdate(() => updateTarget(target, '<div class="loading">Loading...</div>'), isSequential(element));
    });
  }

  // Merge extraOptions into our fetch options.
  const options = { method, ...extraOptions };
  let url = endpoint;
  if (method === 'GET') {
    const params = new URLSearchParams(formData).toString();
    url += (url.includes('?') ? '&' : '?') + params;
    Logger.debug("GET request URL with params:", url);
  } else {
    options.body = formData;
    Logger.debug("Non-GET request, using FormData body.");
  }

  if (element.hasAttribute('cache')) {
    const cached = getCache(url);
    if (cached !== null) {
      Logger.info(`Using cached response for: ${url}`);
      if (element.hasAttribute('target')) {
        const targets = parseTargets(element.getAttribute('target'));
        targets.forEach(target => {
          scheduleUpdate(() => {
            Logger.debug("Updating target with cached response:", target);
            updateTarget(target, cached);
          }, isSequential(element));
        });
      }
      return;
    }
  }

  const timeoutMs = parseInt(element.getAttribute('timeout') || '0', 10);
  const retryCount = parseInt(element.getAttribute('retry') || '0', 10);
  let responseText = null;
  let response = null;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      Logger.debug(`Attempt ${attempt + 1}: Fetching URL ${url}`);
      response = await fetchWithTimeout(url, options, timeoutMs);

      // Lifecycle hook: onbeforeSwap (before DOM update)
      if (element.hasAttribute('onbeforeSwap')) {
        try {
          Logger.debug("Executing onbeforeSwap hook for element.");
          new Function("event", element.getAttribute('onbeforeSwap'))(null);
        } catch (error) {
          Logger.error("Error in onbeforeSwap hook:", error);
        }
      }

      // Process the response.
      responseText = await processResponse(response, element);
      break;
    } catch (error) {
      Logger.warn(`Attempt ${attempt + 1} failed: ${error.message}`);
      if (attempt === retryCount) {
        if (element.hasAttribute('onerror')) {
          const errorTargets = parseTargets(element.getAttribute('onerror'));
          errorTargets.forEach(target => {
            scheduleUpdate(() => {
              Logger.debug("Updating error target after failure:", target);
              updateTarget(target, `<div class="error">Error: ${error.message}</div>`);
            }, isSequential(element));
          });
        }
        return;
      }
    }
  }

  // Fallback update if streaming wasn't used.
  if (element.hasAttribute('target') && !element._htmlexFragmentsProcessed && responseText) {
    const targets = parseTargets(element.getAttribute('target'));
    targets.forEach(target => {
      let resolvedElement;
      if (target.selector.trim().toLowerCase() === "this") {
        resolvedElement = element;
      } else {
        resolvedElement = document.querySelector(target.selector);
        if (!resolvedElement) {
          Logger.debug(`No element found for selector "${target.selector}". Falling back to triggering element.`);
          resolvedElement = element;
        }
      }
      scheduleUpdate(() => {
        Logger.debug("Fallback updating target:", target, "resolved as:", resolvedElement);
        updateTarget(target, responseText, resolvedElement);
      }, isSequential(element));
    });
    if (element.hasAttribute('onafterSwap')) {
      try {
        Logger.debug("Executing onafterSwap hook for element.");
        new Function("event", element.getAttribute('onafterSwap'))(null);
      } catch (error) {
        Logger.error("Error in onafterSwap hook:", error);
      }
    }
  }

  handleURLState(element);

  // --- NEW CODE: Check for Emit header and publish corresponding signal ---  
  if (response && response.headers) {
    const emitHeader = response.headers.get('Emit');
    if (emitHeader) {
      Logger.info(`Received Emit header: ${emitHeader}`);
      let emitSignalName = '';
      let emitDelay = 0;
      const parts = emitHeader.split(';').map(part => part.trim());
      if (parts.length > 0) {
        emitSignalName = parts[0];
      }
      parts.slice(1).forEach(param => {
        if (param.startsWith('delay=')) {
          emitDelay = parseInt(param.split('=')[1], 10);
        }
      });
      if (emitDelay > 0) {
        setTimeout(() => {
          Logger.info(`Emitting signal "${emitSignalName}" after ${emitDelay}ms delay (Emit header).`);
          emitSignal(emitSignalName);
        }, emitDelay);
      } else {
        Logger.info(`Emitting signal "${emitSignalName}" immediately (Emit header).`);
        emitSignal(emitSignalName);
      }
    }
  }
  // ---------------------------------------------------------------------------

  if (element.hasAttribute('publish')) {
    const publishSignal = element.getAttribute('publish');
    Logger.info(`Emitting signal "${publishSignal}" after successful API call.`);
    emitSignal(publishSignal);
    if (element.hasAttribute('timer')) {
      const delay = parseInt(element.getAttribute('timer'), 10);
      setTimeout(() => {
        Logger.debug(`Emitting delayed signal "${publishSignal}" after ${delay}ms.`);
        emitSignal(publishSignal);
      }, delay);
    }
  }

  if (element.hasAttribute('cache')) {
    const cacheTTL = parseInt(element.getAttribute('cache'), 10);
    setCache(url, responseText, cacheTTL);
    Logger.debug("Response cached with TTL:", cacheTTL);
  }

  if (element.hasAttribute('onafter')) {
    try {
      Logger.debug("Executing onafter hook for element.");
      new Function("event", element.getAttribute('onafter'))(null);
    } catch (error) {
      Logger.error("Error in onafter hook:", error);
    }
  }

  // --- NEW CODE: Polling Support via a Web Worker ---
  if (element.hasAttribute('poll') && !element._pollWorker) {
    const pollInterval = parseInt(element.getAttribute('poll'), 10);
    if (pollInterval < 100) {
      Logger.warn('Poll interval too small, minimum is 100ms');
      return;
    }

    const repeatLimit = parseInt(element.getAttribute('repeat') || '0', 10);

    // Create and configure the polling worker
    element._pollWorker = new Worker('pollWorker.js');

    element._pollWorker.onmessage = async function (e) {
      const { type, pollCount, message } = e.data;

      switch (type) {
        case 'poll':
          if (!element._pollInProgress) {
            element._pollInProgress = true;
            try {
              await handleAction(element, method, endpoint);
            } finally {
              element._pollInProgress = false;
            }
          }
          break;

        case 'done':
          Logger.info(`Polling complete after ${pollCount} iterations`);
          element._pollWorker.terminate();
          element._pollWorker = null;
          element._pollDisabled = true;
          break;

        case 'error':
          Logger.error(`Polling error: ${message}`);
          element._pollWorker.terminate();
          element._pollWorker = null;
          break;
      }
    };

    // Start the worker with configuration
    element._pollWorker.postMessage({
      type: 'start',
      interval: pollInterval,
      limit: repeatLimit
    });

    Logger.debug(`Started polling worker: interval=${pollInterval}ms, limit=${repeatLimit}`);
  }
  // ---------------------------------------------------------------------------
}
