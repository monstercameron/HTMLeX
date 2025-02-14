// src/dom.js
/**
 * @module DOM
 * @description Provides functions for diffing and updating the DOM.
 *
 * @typedef {Object} TargetInstruction
 * @property {string} selector - The CSS selector.
 * @property {string} strategy - The update strategy (e.g., "innerHTML", "append").
 */

import { Logger } from './logger.js';
import { scheduleUpdate } from './utils.js';

/**
 * Parses the target attribute into an array of target instructions.
 * @param {string} targetAttr - The target attribute string.
 * @returns {TargetInstruction[]} Array of parsed target instructions.
 */
export function parseTargets(targetAttr) {
  return targetAttr.split(/\s+/).map(instruction => {
    const match = instruction.match(/^(.+?)\((.+?)\)$/);
    if (match) {
      return { selector: match[1].trim(), strategy: match[2].trim() };
    }
    return { selector: instruction, strategy: 'innerHTML' };
  });
}

/**
 * Recursively diffs two DOM nodes and updates only parts that differ.
 * @param {Node} existingNode - The existing DOM node.
 * @param {Node} newNode - The new DOM node.
 */
export function diffAndUpdate(existingNode, newNode) {
  if (
    existingNode.nodeType !== newNode.nodeType ||
    (existingNode.nodeType === Node.ELEMENT_NODE && existingNode.nodeName !== newNode.nodeName)
  ) {
    Logger.debug("Nodes differ in type or tag; replacing node.");
    existingNode.replaceWith(newNode.cloneNode(true));
    return;
  }
  if (existingNode.nodeType === Node.TEXT_NODE) {
    if (existingNode.textContent !== newNode.textContent) {
      Logger.debug(`Updating text from "${existingNode.textContent}" to "${newNode.textContent}"`);
      existingNode.textContent = newNode.textContent;
    }
    return;
  }
  if (existingNode.nodeType === Node.ELEMENT_NODE) {
    const existingAttrs = existingNode.attributes;
    const newAttrs = newNode.attributes;
    for (let i = existingAttrs.length - 1; i >= 0; i--) {
      const attr = existingAttrs[i];
      if (!newNode.hasAttribute(attr.name)) {
        Logger.debug(`Removing attribute "${attr.name}"`);
        existingNode.removeAttribute(attr.name);
      }
    }
    for (let i = 0; i < newAttrs.length; i++) {
      const attr = newAttrs[i];
      if (existingNode.getAttribute(attr.name) !== attr.value) {
        Logger.debug(`Updating attribute "${attr.name}" to "${attr.value}"`);
        existingNode.setAttribute(attr.name, attr.value);
      }
    }
    diffChildren(existingNode, newNode);
  }
}

/**
 * Recursively diffs the children of two elements.
 * @param {Element} existingParent - The current DOM element.
 * @param {Element} newParent - The new DOM element.
 */
export function diffChildren(existingParent, newParent) {
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
      existingChild.remove();
    } else if (existingChild && newChild) {
      diffAndUpdate(existingChild, newChild);
    }
  }
}

/**
 * Performs an innerHTML update on an element using a diff algorithm.
 * @param {Element} el - The element to update.
 * @param {string} newHTML - The new HTML content.
 */
export function performInnerHTMLUpdate(el, newHTML) {
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
  if (el.innerHTML.trim() !== newHTMLTrimmed) {
    Logger.debug("Fallback: updating innerHTML directly.");
    el.innerHTML = newHTMLTrimmed;
  }
}

/**
 * Updates target elements with new content based on the update strategy.
 * @param {TargetInstruction} target - The target instruction.
 * @param {string} content - The HTML content to update.
 */
export function updateTarget(target, content) {
  const elements = document.querySelectorAll(target.selector);
  elements.forEach(el => {
    Logger.debug(`Updating element(s) matching "${target.selector}" using strategy "${target.strategy}"`);
    switch (target.strategy) {
      case 'innerHTML':
        performInnerHTMLUpdate(el, content);
        break;
      case 'outerHTML': {
        const template = document.createElement('template');
        template.innerHTML = content;
        const newNode = template.content.firstChild;
        el.replaceWith(newNode);
        break;
      }
      case 'append':
        el.insertAdjacentHTML('beforeend', content);
        break;
      case 'prepend':
        el.insertAdjacentHTML('afterbegin', content);
        break;
      case 'before':
        el.insertAdjacentHTML('beforebegin', content);
        break;
      case 'after':
        el.insertAdjacentHTML('afterend', content);
        break;
      case 'remove':
        el.remove();
        break;
      default:
        el.innerHTML = content;
    }
    // Optionally, you may reinitialize HTMLeX here if new content introduces HTMLeX-enabled elements.
  });
}
