/**
 * @module WebComponentAdapter
 * @description Provides a formal custom-element bridge for HTMLeX registration.
 */

import { HTMLEX_ATTRIBUTE_NAMES } from './dom.js';
import { registerElement, unregisterElement } from './registration.js';

function scheduleRegistration(element) {
  if (element._htmlexAdapterRegistrationQueued) return;

  element._htmlexAdapterRegistrationQueued = true;
  queueMicrotask(() => {
    element._htmlexAdapterRegistrationQueued = false;
    if (element.isConnected) {
      registerElement(element);
    }
  });
}

export function createHTMLeXElementClass(BaseElement = HTMLElement) {
  return class HTMLeXElement extends BaseElement {
    static get observedAttributes() {
      return HTMLEX_ATTRIBUTE_NAMES;
    }

    connectedCallback() {
      registerElement(this);
    }

    disconnectedCallback() {
      unregisterElement(this);
    }

    attributeChangedCallback() {
      if (this.isConnected) {
        scheduleRegistration(this);
      }
    }

    htmlexRegister() {
      registerElement(this);
    }

    htmlexUnregister() {
      unregisterElement(this);
    }
  };
}

export function defineHTMLeXElement(name = 'htmlex-element', options = {}) {
  if (typeof customElements === 'undefined') {
    throw new Error('customElements is not available in this environment.');
  }

  const existingElement = customElements.get(name);
  if (existingElement) return existingElement;

  const ElementClass = options.elementClass || createHTMLeXElementClass(options.baseClass);
  customElements.define(name, ElementClass);
  return ElementClass;
}
