// src/registration.js
/**
 * @module Registration
 * @description Scans the DOM for HTMLeX-enabled elements and registers them.
 */

import { Logger } from './logger.js';
import { registerSignalListener, emitSignal } from './signals.js';
import { handleAction } from './actions.js';
import { debounce, throttle } from './rateLimit.js';
import { handleWebSocket } from './websocket.js';

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

    // Only apply the child-target check for "click" and "submit". Other events are allowed.
    if ((triggerEvent === 'click' || triggerEvent === 'submit') &&
        element.tagName.toLowerCase() !== 'form' &&
        event.currentTarget !== event.target) {
      Logger.debug("[DEBUG] Ignoring event from child element. triggerEvent:", triggerEvent, "event.currentTarget:", event.currentTarget, "event.target:", event.target);
      return;
    }
    
    Logger.debug(`[DEBUG] Event accepted: triggerEvent: ${triggerEvent} on element:`, element);
    
    if (method) {
      if (triggerEvent === 'submit') event.preventDefault();
      Logger.debug("[DEBUG] Calling handleAction with method:", method.toUpperCase(), "endpoint:", element.getAttribute(method));
      await handleAction(element, method.toUpperCase(), element.getAttribute(method));
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

  // Auto-firing based on the "auto" attribute.
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

  // Publish-only element registration.
  if (!method && element.hasAttribute('publish')) {
    element.addEventListener(triggerEvent, wrappedHandler);
    Logger.info(`[HTMLeX INFO] Registered publish-only element for signal "${element.getAttribute('publish')}" with event "${triggerEvent}".`);
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
}

/**
 * Scans the DOM for HTMLeX-enabled elements and registers them.
 * Also sets up a MutationObserver to auto-register new elements before (or as soon as)
 * they are inserted into the document, ensuring progressive rendering (PR) elements get initialized.
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
  
  // Observe for new elements added to the DOM (for progressive rendering).
  const observer = new MutationObserver(mutationsList => {
    mutationsList.forEach(mutation => {
      if (mutation.type === 'childList' && mutation.addedNodes.length) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches(selectorString)) {
              Logger.debug("[DEBUG] New HTMLeX element found:", node);
              registerElement(node);
            }
            // Also check for any descendants with HTMLeX attributes.
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
