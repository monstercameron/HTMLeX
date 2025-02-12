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
 * Registers an individual element for HTMLeX behavior.
 * @param {Element} element - The element to register.
 */
export function registerElement(element) {
  if (registeredElements.has(element)) {
    Logger.debug("Element already registered:", element);
    return;
  }
  Logger.debug("Registering element:", element);
  registeredElements.add(element);
  const methodAttributes = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  const method = methodAttributes.find(m => element.hasAttribute(m));
  const triggerEvent = element.getAttribute('trigger') || (element.tagName.toLowerCase() === 'form' ? 'submit' : 'click');

  const wrappedHandler = async (event) => {
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
  } else if (element.hasAttribute('signal')) {
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
