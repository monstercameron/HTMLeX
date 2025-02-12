// src/actions.js
/**
 * @module Actions
 * @description Handles API calls and response processing.
 */

import { Logger } from './logger.js';
import { getCache, setCache } from './cache.js';
import { scheduleUpdate, isSequential } from './utils.js';
import { parseTargets, updateTarget } from './dom.js';
import { fetchWithTimeout } from './fetchHelper.js';
import { handleURLState } from './urlState.js';
import { processFragments } from './fragments.js';
import { emitSignal } from './signals.js';

/**
 * Processes the API response.
 * @param {Response} response - The fetch response.
 * @param {Element} triggeringElement - The element that triggered the API call.
 * @returns {Promise<string>} The response text.
 */
export async function processResponse(response, triggeringElement) {
  const responseText = await response.text();
  if (!response.ok) {
    Logger.error(`HTTP error: ${response.status} - ${responseText}`);
    return Promise.reject(new Error(`HTTP error: ${response.status} - ${responseText}`));
  }
  Logger.info("API call successful.");
  if (!processFragments(responseText)) {
    if (triggeringElement.hasAttribute("target")) {
      const targets = parseTargets(triggeringElement.getAttribute("target"));
      targets.forEach(target => {
        scheduleUpdate(() => updateTarget(target, responseText), isSequential(triggeringElement));
      });
      Logger.info(`Fallback updated target(s) using raw response text.`);
    }
  }
  return responseText;
}

/**
 * Handles an API action.
 * @param {Element} element - The element triggering the action.
 * @param {string} method - The HTTP method (e.g., "GET", "POST").
 * @param {string} endpoint - The API endpoint.
 */
export async function handleAction(element, method, endpoint) {
  Logger.info(`Handling ${method} action for endpoint: ${endpoint}`);
  const formData = new FormData();
  if (element.tagName.toLowerCase() === 'form') {
    new FormData(element).forEach((value, key) => formData.append(key, value));
  } else {
    element.querySelectorAll('input, select, textarea').forEach(input => {
      if (input.name) formData.append(input.name, input.value);
    });
  }
  if (element.hasAttribute('source')) {
    const selectors = element.getAttribute('source').split(/\s+/);
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(input => {
        if (input.name) formData.append(input.name, input.value);
      });
    });
  }
  if (element.hasAttribute('loading')) {
    const loadingTargets = parseTargets(element.getAttribute('loading'));
    loadingTargets.forEach(target => {
      scheduleUpdate(() => updateTarget(target, '<div class="loading">Loading...</div>'), isSequential(element));
    });
  }
  const options = { method };
  let url = endpoint;
  if (method === 'GET') {
    const params = new URLSearchParams(formData).toString();
    url += (url.includes('?') ? '&' : '?') + params;
  } else {
    options.body = formData;
  }
  if (element.hasAttribute('cache')) {
    const cached = getCache(url);
    if (cached !== null) {
      Logger.info(`Using cached response for: ${url}`);
      if (element.hasAttribute('target')) {
        const targets = parseTargets(element.getAttribute('target'));
        targets.forEach(target => {
          scheduleUpdate(() => updateTarget(target, cached), isSequential(element));
        });
      }
      return;
    }
  }
  const timeoutMs = parseInt(element.getAttribute('timeout') || '0', 10);
  const retryCount = parseInt(element.getAttribute('retry') || '0', 10);
  let responseText = null;
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      responseText = await fetchWithTimeout(url, options, timeoutMs).then(res => {
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
        return res.text();
      });
      break;
    } catch (error) {
      Logger.warn(`Attempt ${attempt + 1} failed: ${error.message}`);
      if (attempt === retryCount) {
        if (element.hasAttribute('onerror')) {
          const errorTargets = parseTargets(element.getAttribute('onerror'));
          errorTargets.forEach(target => {
            scheduleUpdate(() => updateTarget(target, `<div class="error">Error: ${error.message}</div>`), isSequential(element));
          });
        }
        return;
      }
    }
  }
  Logger.info("API call successful.");
  if (element.hasAttribute('target')) {
    const targets = parseTargets(element.getAttribute('target'));
    targets.forEach(target => {
      scheduleUpdate(() => updateTarget(target, responseText), isSequential(element));
    });
  }
  handleURLState(element);
  if (element.hasAttribute('signal')) {
    const signalName = element.getAttribute('signal');
    Logger.info(`Emitting signal "${signalName}" after successful API call.`);
    emitSignal(signalName);
    if (element.hasAttribute('timer')) {
      const delay = parseInt(element.getAttribute('timer'), 10);
      setTimeout(() => emitSignal(signalName), delay);
    }
  }
  if (element.hasAttribute('cache')) {
    const cacheTTL = parseInt(element.getAttribute('cache'), 10);
    setCache(url, responseText, cacheTTL);
  }
}
