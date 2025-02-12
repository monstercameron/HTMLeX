// htmlex.js
// HTMLeX – HTML eXtensible Declarative HATEOAS UI Handler
// Version 1.0 • Last Updated: 2025-02-10
//
// This module scans the DOM for HTMLeX attributes and registers event handlers,
// performs API calls (with rate limiting, polling, auto‑firing, caching, retry/timeout,
// URL state updates, signal‑based chaining, WebSocket integration, timers, and sequential updates).
// It extracts <fragment>s from API responses and uses each fragment's target attribute to update the DOM
// using the specified replacement strategy. For "innerHTML" updates, it performs a DOM diff to update only
// the parts that have changed, unregistering removed nodes and re‑registering new ones.
// Signals can be emitted via the "signal" attribute and listened for via the "listen" attribute.
// For non‑form elements, only events originating on the element itself trigger actions.

///////////////////////////////////////////////////////////////////////////////
// DEBUG LOGGER
///////////////////////////////////////////////////////////////////////////////
const Logger = {
  logLevel: 'debug',
  debug: (msg, ...args) => { if (['debug'].includes(Logger.logLevel)) console.debug("[HTMLeX DEBUG]", msg, ...args); },
  info:  (msg, ...args) => { if (['debug','info'].includes(Logger.logLevel)) console.info("[HTMLeX INFO]", msg, ...args); },
  warn:  (msg, ...args) => { if (['debug','info','warn'].includes(Logger.logLevel)) console.warn("[HTMLeX WARN]", msg, ...args); },
  error: (msg, ...args) => { console.error("[HTMLeX ERROR]", msg, ...args); }
};

///////////////////////////////////////////////////////////////////////////////
// GLOBAL VARIABLES & HELPERS
///////////////////////////////////////////////////////////////////////////////
const registeredElements = new WeakSet();
const updateQueue = [];
let processingQueue = false;

function processUpdateQueue() {
  if (updateQueue.length > 0) {
    const updateFn = updateQueue.shift();
    updateFn();
    requestAnimationFrame(processUpdateQueue);
  } else {
    processingQueue = false;
  }
}

function scheduleUpdate(updateFn, sequential) {
  if (sequential) {
    updateQueue.push(updateFn);
    if (!processingQueue) {
      processingQueue = true;
      requestAnimationFrame(processUpdateQueue);
    }
  } else {
    requestAnimationFrame(updateFn);
  }
}

function isSequential(element) {
  return element.hasAttribute('sequential') && element.getAttribute('sequential') !== 'false';
}

// A simple unregister function – expand as needed.
function unregisterElement(element) {
  registeredElements.delete(element);
  Logger.debug("Unregistered element:", element);
}

///////////////////////////////////////////////////////////////////////////////
// SIGNAL BUS (Chaining)
///////////////////////////////////////////////////////////////////////////////
const signalBus = new Map();

function registerSignalListener(signalName, callback) {
  if (!signalBus.has(signalName)) {
    signalBus.set(signalName, []);
    Logger.debug(`Created new signal bus entry for "${signalName}"`);
  }
  signalBus.get(signalName).push(callback);
  Logger.debug(`Registered listener for signal "${signalName}". Total listeners: ${signalBus.get(signalName).length}`);
}

function emitSignal(signalName) {
  Logger.info(`Emitting signal "${signalName}" at ${new Date().toLocaleTimeString()}`);
  if (signalBus.has(signalName)) {
    signalBus.get(signalName).forEach(callback => {
      try {
        callback();
      } catch (error) {
        Logger.error(`Error in signal listener for "${signalName}": ${error}`);
      }
    });
  } else {
    Logger.warn(`No listeners registered for signal "${signalName}"`);
  }
}

///////////////////////////////////////////////////////////////////////////////
// CACHE MECHANISM
///////////////////////////////////////////////////////////////////////////////
const cacheStore = new Map();

function setCache(key, response, ttl) {
  const expireAt = Date.now() + ttl;
  cacheStore.set(key, { response, expireAt });
  Logger.debug(`Cached response for key "${key}" for ${ttl}ms`);
}

function getCache(key) {
  if (cacheStore.has(key)) {
    const { response, expireAt } = cacheStore.get(key);
    if (Date.now() < expireAt) {
      Logger.debug(`Cache hit for key "${key}"`);
      return response;
    } else {
      Logger.debug(`Cache expired for key "${key}"`);
      cacheStore.delete(key);
    }
  }
  return null;
}

///////////////////////////////////////////////////////////////////////////////
// DOM UPDATE HELPERS & DIFF ALGORITHM
///////////////////////////////////////////////////////////////////////////////
function parseTargets(targetAttr) {
  return targetAttr.split(/\s+/).map(instruction => {
    const match = instruction.match(/^(.+?)\((.+?)\)$/);
    if (match) {
      return { selector: match[1].trim(), strategy: match[2].trim() };
    }
    return { selector: instruction, strategy: 'innerHTML' };
  });
}

/**
 * Recursively diffs two nodes and updates only parts that differ.
 * @param {Node} existingNode - The existing DOM node.
 * @param {Node} newNode - The new node to compare.
 */
function diffAndUpdate(existingNode, newNode) {
  // If nodes differ in type or tag, replace them.
  if (existingNode.nodeType !== newNode.nodeType ||
      (existingNode.nodeType === Node.ELEMENT_NODE && existingNode.nodeName !== newNode.nodeName)) {
    Logger.debug("Nodes differ in type or tag; replacing node.");
    existingNode.replaceWith(newNode.cloneNode(true));
    return;
  }
  // For text nodes, update textContent if needed.
  if (existingNode.nodeType === Node.TEXT_NODE) {
    if (existingNode.textContent !== newNode.textContent) {
      Logger.debug(`Updating text from "${existingNode.textContent}" to "${newNode.textContent}"`);
      existingNode.textContent = newNode.textContent;
    }
    return;
  }
  // For element nodes, update attributes.
  if (existingNode.nodeType === Node.ELEMENT_NODE) {
    const existingAttrs = existingNode.attributes;
    const newAttrs = newNode.attributes;
    // Remove attributes not in new node.
    for (let i = existingAttrs.length - 1; i >= 0; i--) {
      const attr = existingAttrs[i];
      if (!newNode.hasAttribute(attr.name)) {
        Logger.debug(`Removing attribute "${attr.name}"`);
        existingNode.removeAttribute(attr.name);
      }
    }
    // Set new/updated attributes.
    for (let i = 0; i < newAttrs.length; i++) {
      const attr = newAttrs[i];
      if (existingNode.getAttribute(attr.name) !== attr.value) {
        Logger.debug(`Updating attribute "${attr.name}" to "${attr.value}"`);
        existingNode.setAttribute(attr.name, attr.value);
      }
    }
    // Diff child nodes.
    diffChildren(existingNode, newNode);
  }
}

/**
 * Diffs children of an existing parent node with a new parent node.
 * @param {Element} existingParent - The current DOM element.
 * @param {Element} newParent - The new DOM element.
 */
function diffChildren(existingParent, newParent) {
  const existingChildren = Array.from(existingParent.childNodes);
  const newChildren = Array.from(newParent.childNodes);
  const max = Math.max(existingChildren.length, newChildren.length);
  for (let i = 0; i < max; i++) {
    const existingChild = existingChildren[i];
    const newChild = newChildren[i];
    if (!existingChild && newChild) {
      Logger.debug("Appending new child:", newChild);
      existingParent.appendChild(newChild.cloneNode(true));
    } else if (existingChild && !newChild) {
      Logger.debug("Removing extra child:", existingChild);
      unregisterElement(existingChild);
      existingChild.remove();
    } else if (existingChild && newChild) {
      diffAndUpdate(existingChild, newChild);
    }
  }
}

/**
 * Parses newHTML into a DocumentFragment and performs a diff update on the element.
 * @param {Element} el - The element to update.
 * @param {string} newHTML - The new HTML string.
 */
function performInnerHTMLUpdate(el, newHTML) {
  const currentHTML = el.innerHTML.trim();
  const newHTMLTrimmed = newHTML.trim();
  if (currentHTML === newHTMLTrimmed) {
    Logger.debug("No differences detected; skipping update.");
    return;
  }
  Logger.debug("Differences detected; performing partial update.");
  const template = document.createElement('template');
  template.innerHTML = newHTMLTrimmed;
  const newFragment = template.content;
  diffChildren(el, newFragment);
  // Fallback: if the diff update leaves discrepancies, set innerHTML directly.
  if (el.innerHTML.trim() !== newHTMLTrimmed) {
    Logger.debug("Fallback: updating innerHTML directly.");
    el.innerHTML = newHTMLTrimmed;
  }
}

/**
 * Updates the DOM for the given target using the provided content.
 * Uses a diff algorithm for "innerHTML" strategy.
 * @param {Object} target - An object with {selector, strategy}.
 * @param {string} content - The HTML content.
 */
function updateTarget(target, content) {
  const elements = document.querySelectorAll(target.selector);
  elements.forEach(el => {
    Logger.debug(`Updating element(s) matching "${target.selector}" using strategy "${target.strategy}"`);
    if (target.strategy === 'innerHTML') {
      performInnerHTMLUpdate(el, content);
    } else if (target.strategy === 'outerHTML') {
      const template = document.createElement('template');
      template.innerHTML = content;
      const newNode = template.content.firstChild;
      unregisterElement(el);
      el.replaceWith(newNode);
    } else if (target.strategy === 'append') {
      el.insertAdjacentHTML('beforeend', content);
    } else if (target.strategy === 'prepend') {
      el.insertAdjacentHTML('afterbegin', content);
    } else if (target.strategy === 'before') {
      el.insertAdjacentHTML('beforebegin', content);
    } else if (target.strategy === 'after') {
      el.insertAdjacentHTML('afterend', content);
    } else if (target.strategy === 'remove') {
      unregisterElement(el);
      el.remove();
    } else {
      el.innerHTML = content;
    }
    // Re-initialize HTMLeX on new content.
    initHTMLeX();
  });
}

///////////////////////////////////////////////////////////////////////////////
// FRAGMENT PROCESSING
///////////////////////////////////////////////////////////////////////////////
/**
 * Extracts <fragment> elements from the response text and updates the DOM
 * according to each fragment's target attribute and placement strategy.
 * @param {string} responseText - The HTML response text.
 * @returns {boolean} True if one or more fragments were processed; otherwise, false.
 */
function processFragments(responseText) {
  const template = document.createElement('template');
  template.innerHTML = responseText;
  const fragmentsContainer = template.content.querySelector('fragments');
  if (fragmentsContainer) {
    const fragmentElements = fragmentsContainer.querySelectorAll('fragment');
    fragmentElements.forEach(fragment => {
      const targetAttr = fragment.getAttribute('target');
      if (targetAttr) {
        const targets = parseTargets(targetAttr);
        const fragmentContent = fragment.innerHTML;
        targets.forEach(target => {
          scheduleUpdate(() => updateTarget(target, fragmentContent), false);
        });
        Logger.info(`Processed fragment for target "${targetAttr}"`);
      }
    });
    return true;
  }
  return false;
}

///////////////////////////////////////////////////////////////////////////////
// RATE LIMITING HELPERS
///////////////////////////////////////////////////////////////////////////////
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function throttle(func, limit) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

///////////////////////////////////////////////////////////////////////////////
// FETCH HELPER WITH TIMEOUT
///////////////////////////////////////////////////////////////////////////////
function fetchWithTimeout(url, options, timeoutMs) {
  if (timeoutMs > 0) {
    return Promise.race([
      fetch(url, options),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
      )
    ]);
  }
  return fetch(url, options);
}

///////////////////////////////////////////////////////////////////////////////
// WEBSOCKET HANDLER
///////////////////////////////////////////////////////////////////////////////
function handleWebSocket(element, socketUrl) {
  try {
    const socket = new WebSocket(socketUrl);
    socket.onopen = () => Logger.info(`WebSocket connected to ${socketUrl}`);
    socket.onmessage = (event) => {
      Logger.info(`WebSocket message received: ${event.data}`);
      if (element.hasAttribute('target')) {
        const targets = parseTargets(element.getAttribute('target'));
        targets.forEach(target => {
          scheduleUpdate(() => updateTarget(target, event.data), isSequential(element));
        });
      }
    };
    socket.onerror = (error) => Logger.error("WebSocket error:", error);
    socket.onclose = () => Logger.info(`WebSocket closed for ${socketUrl}`);
    element._htmlexSocket = socket;
  } catch (error) {
    Logger.error("Failed to establish WebSocket connection:", error);
  }
}

///////////////////////////////////////////////////////////////////////////////
// URL STATE UPDATES
///////////////////////////////////////////////////////////////////////////////
function handleURLState(element) {
  let newUrl = new URL(window.location.href);
  if (element.hasAttribute('push')) {
    const pairs = element.getAttribute('push').split(/\s+/);
    pairs.forEach(pair => {
      const [key, value] = pair.split('=');
      newUrl.searchParams.set(key, value);
    });
  }
  if (element.hasAttribute('pull')) {
    const keys = element.getAttribute('pull').split(/\s+/);
    keys.forEach(key => {
      newUrl.searchParams.delete(key);
    });
  }
  if (element.hasAttribute('path')) {
    const pathValue = element.getAttribute('path');
    newUrl.pathname = pathValue;
  }
  if (element.hasAttribute('push') || element.hasAttribute('pull') || element.hasAttribute('path')) {
    const historyMethod = element.getAttribute('history') || 'replace';
    if (historyMethod === 'push') {
      history.pushState(null, '', newUrl.toString());
    } else {
      history.replaceState(null, '', newUrl.toString());
    }
    Logger.info(`Updated URL state to: ${newUrl.toString()}`);
  }
}

///////////////////////////////////////////////////////////////////////////////
// PROCESSING API RESPONSES
///////////////////////////////////////////////////////////////////////////////
async function processResponse(response, triggeringElement) {
  const responseText = await response.text();
  if (!response.ok) {
    Logger.error(`HTTP error: ${response.status} - ${responseText}`);
    return Promise.reject(new Error(`HTTP error: ${response.status} - ${responseText}`));
  }
  Logger.info("API call successful.");
  // Try to process fragments from the response.
  if (!processFragments(responseText)) {
    // Fallback: if no fragments are found, update using the raw response text.
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

///////////////////////////////////////////////////////////////////////////////
// CORE ACTION HANDLER (API CALLS)
///////////////////////////////////////////////////////////////////////////////
async function handleAction(element, method, endpoint) {
  Logger.info(`Handling ${method} action for endpoint: ${endpoint}`);
  const formData = new FormData();
  if (element.tagName.toLowerCase() === 'form') {
    new FormData(element).forEach((value, key) => {
      formData.append(key, value);
    });
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

///////////////////////////////////////////////////////////////////////////////
// ELEMENT REGISTRATION & SCANNING
///////////////////////////////////////////////////////////////////////////////
function registerElement(element) {
  if (registeredElements.has(element)) {
    Logger.debug("Element already registered:", element);
    return;
  }
  Logger.debug("Registering element:", element);
  registeredElements.add(element);
  const methodAttributes = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  const method = methodAttributes.find(m => element.hasAttribute(m));
  let triggerEvent = element.getAttribute('trigger') || (element.tagName.toLowerCase() === 'form' ? 'submit' : 'click');
  
  // Wrapped handler that fires only if the event is directly on this element.
  const wrappedHandler = async (event) => {
    // For non‑form elements, only trigger if the event originates from the element itself.
    if (element.tagName.toLowerCase() !== 'form' && event.currentTarget !== event.target) {
      Logger.debug("Ignoring event from child element:", event.target);
      return;
    }
    Logger.debug(`Triggering ${method ? method : 'signal'} action on element:`, element);
    if (method) {
      if (triggerEvent === 'submit') event.preventDefault();
      await handleAction(element, method, element.getAttribute(method));
    } else if (element.hasAttribute('signal')) {
      const signalName = element.getAttribute('signal');
      Logger.info(`Emitting signal "${signalName}" from signal-only element on event "${triggerEvent}".`);
      emitSignal(signalName);
    }
  };
  
  if (method) {
    let handler = wrappedHandler;
    const debounceMs = parseInt(element.getAttribute('debounce') || '0', 10);
    if (debounceMs > 0) {
      handler = debounce(handler, debounceMs);
      Logger.debug(`Applied debounce of ${debounceMs}ms`);
    }
    const throttleMs = parseInt(element.getAttribute('throttle') || '0', 10);
    if (throttleMs > 0) {
      handler = throttle(handler, throttleMs);
      Logger.debug(`Applied throttle of ${throttleMs}ms`);
    }
    element.addEventListener(triggerEvent, handler);
    Logger.info(`Registered ${method} action on element with event "${triggerEvent}" for endpoint "${element.getAttribute(method)}".`);
    
    if (element.hasAttribute('poll')) {
      const pollInterval = parseInt(element.getAttribute('poll'), 10);
      if (pollInterval > 0) {
        setInterval(() => {
          Logger.debug("Polling triggered for element:", element);
          handler(new Event(triggerEvent));
        }, pollInterval);
        Logger.info(`Set up polling every ${pollInterval}ms for element.`);
      }
    }
    if (element.hasAttribute('auto')) {
      const autoVal = element.getAttribute('auto');
      const delay = parseInt(autoVal, 10) || 0;
      setTimeout(() => {
        Logger.debug("Auto firing action for element:", element);
        handler(new Event(triggerEvent));
      }, delay);
      Logger.info(`Auto firing set for element with delay ${delay}ms.`);
    }
  }
  // For signal-only elements (no HTTP method, only signal attribute)
  else if (element.hasAttribute('signal')) {
    element.addEventListener(triggerEvent, wrappedHandler);
    Logger.info(`Registered signal-only element for signal "${element.getAttribute('signal')}" with event "${triggerEvent}".`);
    if (element.hasAttribute('auto')) {
      const autoVal = element.getAttribute('auto');
      const delay = parseInt(autoVal, 10) || 0;
      setTimeout(() => {
        const signalName = element.getAttribute('signal');
        Logger.info(`Auto firing signal "${signalName}" from signal-only element with delay ${delay}ms.`);
        emitSignal(signalName);
      }, delay);
    }
  }
  
  if (element.hasAttribute('socket')) {
    const socketUrl = element.getAttribute('socket');
    handleWebSocket(element, socketUrl);
  }
  if (element.hasAttribute('listen')) {
    const signals = element.getAttribute('listen').split(/\s+/);
    signals.forEach(signalName => {
      registerSignalListener(signalName, () => {
        Logger.debug(`Signal "${signalName}" triggered listener on element:`, element);
        const methodAttr = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].find(m => element.hasAttribute(m));
        if (methodAttr) {
          const endpoint = element.getAttribute(methodAttr);
          handleAction(element, methodAttr, endpoint);
        }
      });
      Logger.debug(`Registered listener for signal "${signalName}" on element:`, element);
    });
  }
}

/**
 * Scans the DOM for HTMLeX-enabled elements and registers them.
 */
export function initHTMLeX() {
  Logger.info("Initializing HTMLeX...");
  const selectors = [
    '[GET]', '[POST]', '[PUT]', '[DELETE]', '[PATCH]',
    '[auto]', '[poll]', '[socket]', '[listen]', '[signal]',
    '[debounce]', '[throttle]', '[retry]', '[timeout]', '[cache]', '[timer]', '[sequential]'
  ];
  const elements = document.querySelectorAll(selectors.join(','));
  elements.forEach(el => registerElement(el));
  Logger.info(`HTMLeX registered ${elements.length} element(s).`);
}

///////////////////////////////////////////////////////////////////////////////
// EXPORTS
///////////////////////////////////////////////////////////////////////////////
