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
  Logger.system.debug("[DOM] Parsing target attribute:", targetAttr);
  const targets = targetAttr.split(/\s+/).map(instruction => {
    const match = instruction.match(/^(.+?)\((.+?)\)$/);
    if (match) {
      return { selector: match[1].trim(), strategy: match[2].trim() };
    }
    return { selector: instruction, strategy: 'innerHTML' };
  });
  Logger.system.debug("[DOM] Parsed target instructions:", targets);
  return targets;
}

/**
 * Recursively diffs two DOM nodes and updates only parts that differ.
 * @param {Node} existingNode - The existing DOM node.
 * @param {Node} newNode - The new DOM node.
 */
export function diffAndUpdate(existingNode, newNode) {
  Logger.system.debug("[DOM] Diffing nodes:", existingNode, newNode);
  if (
    existingNode.nodeType !== newNode.nodeType ||
    (existingNode.nodeType === Node.ELEMENT_NODE && existingNode.nodeName !== newNode.nodeName)
  ) {
    Logger.system.debug("[DOM] Nodes differ in type or tag; replacing node.");
    existingNode.replaceWith(newNode.cloneNode(true));
    return;
  }
  if (existingNode.nodeType === Node.TEXT_NODE) {
    if (existingNode.textContent !== newNode.textContent) {
      Logger.system.debug(
        `[DOM] Updating text from "${existingNode.textContent}" to "${newNode.textContent}"`
      );
      existingNode.textContent = newNode.textContent;
    }
    return;
  }
  if (existingNode.nodeType === Node.ELEMENT_NODE) {
    Logger.system.debug("[DOM] Diffing attributes for element:", existingNode);
    const existingAttrs = existingNode.attributes;
    const newAttrs = newNode.attributes;
    for (let i = existingAttrs.length - 1; i >= 0; i--) {
      const attr = existingAttrs[i];
      if (!newNode.hasAttribute(attr.name)) {
        Logger.system.debug(`[DOM] Removing attribute "${attr.name}" from element:`, existingNode);
        existingNode.removeAttribute(attr.name);
      }
    }
    for (let i = 0; i < newAttrs.length; i++) {
      const attr = newAttrs[i];
      if (existingNode.getAttribute(attr.name) !== attr.value) {
        Logger.system.debug(
          `[DOM] Updating attribute "${attr.name}" to "${attr.value}" on element:`,
          existingNode
        );
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
  Logger.system.debug(
    "[DOM] Diffing children of element:",
    existingParent,
    "with new element:",
    newParent
  );
  const existingChildren = Array.from(existingParent.childNodes);
  const newChildren = Array.from(newParent.childNodes);
  const max = Math.max(existingChildren.length, newChildren.length);
  for (let i = 0; i < max; i++) {
    const existingChild = existingChildren[i];
    const newChild = newChildren[i];
    if (!existingChild && newChild) {
      Logger.system.debug("[DOM] Appending new child:", newChild);
      existingParent.appendChild(newChild.cloneNode(true));
    } else if (existingChild && !newChild) {
      Logger.system.debug("[DOM] Removing extra child:", existingChild);
      existingChild.remove();
    } else if (existingChild && newChild) {
      diffAndUpdate(existingChild, newChild);
    }
  }
  Logger.system.debug("[DOM] Completed diffing children for element:", existingParent);
}

/**
 * Performs an innerHTML update on an element using a diff algorithm.
 * @param {Element} el - The element to update.
 * @param {string} newHTML - The new HTML content.
 */
export function performInnerHTMLUpdate(el, newHTML) {
  Logger.system.debug("[DOM] Performing innerHTML update on element:", el);
  const currentHTML = el.innerHTML.trim();
  const newHTMLTrimmed = newHTML.trim();
  if (currentHTML === newHTMLTrimmed) {
    Logger.system.debug("[DOM] No differences detected in innerHTML; skipping update.");
    return;
  }
  Logger.system.debug("[DOM] Differences detected; performing partial update using diffing algorithm.");
  const template = document.createElement('template');
  template.innerHTML = newHTMLTrimmed;
  const newFragment = template.content;
  diffChildren(el, newFragment);
  if (el.innerHTML.trim() !== newHTMLTrimmed) {
    Logger.system.debug("[DOM] Fallback: innerHTML mismatch after diffing; updating innerHTML directly.");
    el.innerHTML = newHTMLTrimmed;
  }
}

/**
 * Updates target elements with new content based on the update strategy.
 * @param {TargetInstruction} target - The target instruction.
 * @param {string} content - The HTML content to update.
 */
export function updateTarget(target, content) {
  Logger.system.debug(
    "[DOM] Updating target with instruction:",
    target,
    "and content length:",
    content.length
  );
  const elements = document.querySelectorAll(target.selector);
  elements.forEach(el => {
    Logger.system.debug(
      `[DOM] Updating element(s) matching "${target.selector}" using strategy "${target.strategy}"`,
      el
    );
    switch (target.strategy) {
      case 'innerHTML':
        performInnerHTMLUpdate(el, content);
        break;
      case 'outerHTML': {
        const template = document.createElement('template');
        template.innerHTML = content;
        const newNode = template.content.firstChild;
        if (newNode) {
          Logger.system.debug("[DOM] Replacing element with outerHTML strategy. New node:", newNode);
          el.replaceWith(newNode);
        } else {
          Logger.system.warn("[DOM] outerHTML update failed: no new node generated from content.");
        }
        break;
      }
      case 'append':
        Logger.system.debug("[DOM] Appending content to element:", el);
        el.insertAdjacentHTML('beforeend', content);
        break;
      case 'prepend':
        Logger.system.debug("[DOM] Prepending content to element:", el);
        el.insertAdjacentHTML('afterbegin', content);
        break;
      case 'before':
        Logger.system.debug("[DOM] Inserting content before element:", el);
        el.insertAdjacentHTML('beforebegin', content);
        break;
      case 'after':
        Logger.system.debug("[DOM] Inserting content after element:", el);
        el.insertAdjacentHTML('afterend', content);
        break;
      case 'remove':
        Logger.system.debug("[DOM] Removing element:", el);
        el.remove();
        break;
      default:
        Logger.system.debug("[DOM] Default update strategy; updating innerHTML of element:", el);
        el.innerHTML = content;
    }
    // Optionally, reinitialize HTMLeX here if new content introduces HTMLeX-enabled elements.
  });
}
