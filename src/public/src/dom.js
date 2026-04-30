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
const TARGET_STRATEGIES = 'innerHTML|outerHTML|append|prepend|before|after|remove';
export const HTMLEX_ATTRIBUTE_NAMES = [
  'get', 'post', 'put', 'delete', 'patch',
  'auto', 'poll', 'socket', 'subscribe', 'publish',
  'trigger', 'debounce', 'throttle', 'retry', 'timeout',
  'retrydelay', 'retry-delay', 'retrybackoff', 'retry-backoff', 'retrymaxdelay', 'retry-max-delay',
  'cache', 'timer', 'sequential', 'repeat', 'source', 'target',
  'loading', 'onerror', 'extras', 'push', 'pull', 'path',
  'history', 'onbefore', 'onbeforeswap', 'onafterswap', 'onafter'
];
const HTMLEX_MARKUP_PATTERN = /\s(?:get|post|put|delete|patch|socket|publish|timer)\b/i;
const STRATEGY_BY_LOWERCASE = {
  innerhtml: 'innerHTML',
  outerhtml: 'outerHTML',
  append: 'append',
  prepend: 'prepend',
  before: 'before',
  after: 'after',
  remove: 'remove'
};

function hasHTMLeXBehavior(node) {
  return node.nodeType === Node.ELEMENT_NODE && HTMLEX_ATTRIBUTE_NAMES.some(attributeName => node.hasAttribute(attributeName));
}

function getHTMLeXBehaviorSignature(element) {
  return HTMLEX_ATTRIBUTE_NAMES
    .map(attributeName => `${attributeName}=${element.getAttribute(attributeName) ?? ''}`)
    .join('|');
}

function isElementNode(node) {
  return node?.nodeType === Node.ELEMENT_NODE;
}

function getNodeKey(node) {
  if (!isElementNode(node)) return '';

  for (const attributeName of ['id', 'data-key', 'key', 'data-htmlex-key']) {
    const value = node.getAttribute(attributeName);
    if (value) return `${attributeName}:${value}`;
  }

  return '';
}

function getActiveElement() {
  try {
    return document?.activeElement || null;
  } catch {
    return null;
  }
}

function captureControlState(element) {
  const tagName = element.tagName;
  const isActive = getActiveElement() === element;

  if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
    const state = {
      tagName,
      isActive,
      value: element.value,
      checked: element.checked,
    };
    if (isActive && typeof element.selectionStart === 'number' && typeof element.selectionEnd === 'number') {
      state.selectionStart = element.selectionStart;
      state.selectionEnd = element.selectionEnd;
      state.selectionDirection = element.selectionDirection;
    }
    return state;
  }

  if (tagName === 'SELECT') {
    return {
      tagName,
      isActive,
      selectedValues: [...(element.options || [])]
        .filter(option => option.selected)
        .map(option => option.value),
    };
  }

  if (tagName === 'VIDEO' || tagName === 'AUDIO') {
    return {
      tagName,
      currentTime: element.currentTime,
      muted: element.muted,
      paused: element.paused,
      playbackRate: element.playbackRate,
      volume: element.volume,
    };
  }

  return null;
}

function restoreControlState(element, state) {
  if (!state || element.tagName !== state.tagName) return;

  if (state.tagName === 'INPUT' || state.tagName === 'TEXTAREA') {
    if ('value' in element) element.value = state.value;
    if ('checked' in element && state.checked !== undefined) element.checked = state.checked;
    if (
      state.isActive &&
      typeof element.setSelectionRange === 'function' &&
      typeof state.selectionStart === 'number' &&
      typeof state.selectionEnd === 'number'
    ) {
      try {
        element.setSelectionRange(state.selectionStart, state.selectionEnd, state.selectionDirection);
      } catch {
        // Some input types do not support selection ranges.
      }
    }
  }

  if (state.tagName === 'SELECT') {
    const selectedValues = new Set(state.selectedValues || []);
    for (const option of element.options || []) {
      option.selected = selectedValues.has(option.value);
    }
  }

  if (state.tagName === 'VIDEO' || state.tagName === 'AUDIO') {
    for (const [key, value] of Object.entries({
      currentTime: state.currentTime,
      muted: state.muted,
      playbackRate: state.playbackRate,
      volume: state.volume,
    })) {
      try {
        if (value !== undefined) element[key] = value;
      } catch {
        // Media properties can reject invalid values depending on ready state.
      }
    }
    if (!state.paused && typeof element.play === 'function') {
      element.play().catch?.(() => {});
    }
  }

  if (state.isActive && typeof element.focus === 'function') {
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
  }
}

function findKeyedChild(parent, key, fromIndex) {
  if (!key) return null;
  const children = [...parent.childNodes];
  for (let index = fromIndex; index < children.length; index += 1) {
    if (getNodeKey(children[index]) === key) return children[index];
  }
  return null;
}

function moveChildBefore(parent, child, referenceNode) {
  if (child === referenceNode) return;
  if (typeof parent.insertBefore === 'function') {
    parent.insertBefore(child, referenceNode || null);
    return;
  }

  const children = parent.childNodes;
  const currentIndex = children.indexOf(child);
  if (currentIndex < 0) return;
  children.splice(currentIndex, 1);
  const nextIndex = referenceNode ? children.indexOf(referenceNode) : children.length;
  children.splice(nextIndex < 0 ? children.length : nextIndex, 0, child);
}

export function hasHTMLeXMarkup(content) {
  return HTMLEX_MARKUP_PATTERN.test(String(content ?? ''));
}

/**
 * Parses the target attribute into an array of target instructions.
 * @param {string} targetAttr - The target attribute string.
 * @returns {TargetInstruction[]} Array of parsed target instructions.
 */
export function parseTargets(targetAttr) {
  Logger.system.debug("[DOM] Parsing target attribute:", targetAttr);
  const input = String(targetAttr ?? '').trim();
  if (!input) {
    return [];
  }

  const targets = [];
  const targetPattern = new RegExp(`(.+?)\\((${TARGET_STRATEGIES})\\)(?:\\s+|$)`, 'gi');
  let match;
  while ((match = targetPattern.exec(input)) !== null) {
    const rawStrategy = match[2].trim();
    targets.push({
      selector: match[1].trim(),
      strategy: STRATEGY_BY_LOWERCASE[rawStrategy.toLowerCase()] || rawStrategy
    });
  }

  if (!targets.length) {
    targets.push({ selector: input, strategy: 'innerHTML' });
  }
  Logger.system.debug("[DOM] Parsed target instructions:", targets);
  return targets;
}

export function querySelectorSafe(selector, root = document) {
  try {
    return root.querySelector(selector);
  } catch (error) {
    Logger.system.warn(`[DOM] Invalid selector "${selector}"`, error);
    return null;
  }
}

export function querySelectorAllResult(selector, root = document) {
  try {
    return {
      matches: [...root.querySelectorAll(selector)],
      valid: true,
    };
  } catch (error) {
    Logger.system.warn(`[DOM] Invalid selector "${selector}"`, error);
    return {
      matches: [],
      valid: false,
    };
  }
}

export function querySelectorAllSafe(selector, root = document) {
  return querySelectorAllResult(selector, root).matches;
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
  if (
    existingNode.nodeType === Node.ELEMENT_NODE &&
    (hasHTMLeXBehavior(existingNode) || hasHTMLeXBehavior(newNode)) &&
    getHTMLeXBehaviorSignature(existingNode) !== getHTMLeXBehaviorSignature(newNode)
  ) {
    Logger.system.debug("[DOM] HTMLeX behavior attributes changed; replacing node so it can be re-registered.");
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
    const liveState = captureControlState(existingNode);
    Logger.system.debug("[DOM] Diffing attributes for element:", existingNode);
    const existingAttrs = existingNode.attributes;
    const newAttrs = newNode.attributes;
    for (let i = existingAttrs.length - 1; i >= 0; i--) {
      const attribute = existingAttrs[i];
      if (!newNode.hasAttribute(attribute.name)) {
        Logger.system.debug(`[DOM] Removing attribute "${attribute.name}" from element:`, existingNode);
        existingNode.removeAttribute(attribute.name);
      }
    }
    for (let i = 0; i < newAttrs.length; i++) {
      const attribute = newAttrs[i];
      if (existingNode.getAttribute(attribute.name) !== attribute.value) {
        Logger.system.debug(
          `[DOM] Updating attribute "${attribute.name}" to "${attribute.value}" on element:`,
          existingNode
        );
        existingNode.setAttribute(attribute.name, attribute.value);
      }
    }
    diffChildren(existingNode, newNode);
    restoreControlState(existingNode, liveState);
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
  const newChildren = [...newParent.childNodes];
  for (let i = 0; i < newChildren.length; i++) {
    const newChild = newChildren[i];
    const newKey = getNodeKey(newChild);
    const keyedChild = findKeyedChild(existingParent, newKey, i);
    if (keyedChild && keyedChild !== existingParent.childNodes[i]) {
      Logger.system.debug("[DOM] Moving keyed child into position:", newKey);
      moveChildBefore(existingParent, keyedChild, existingParent.childNodes[i] || null);
    }

    const existingChild = existingParent.childNodes[i];
    if (!existingChild && newChild) {
      Logger.system.debug("[DOM] Appending new child:", newChild);
      existingParent.appendChild(newChild.cloneNode(true));
    } else if (existingChild && newChild) {
      diffAndUpdate(existingChild, newChild);
    }
  }

  while (existingParent.childNodes.length > newChildren.length) {
    const extraChild = existingParent.childNodes[existingParent.childNodes.length - 1];
    Logger.system.debug("[DOM] Removing extra child:", extraChild);
    extraChild.remove();
  }
  Logger.system.debug("[DOM] Completed diffing children for element:", existingParent);
}

/**
 * Performs an innerHTML update on an element using a diff algorithm.
 * @param {Element} element - The element to update.
 * @param {string} newHTML - The new HTML content.
 */
export function performInnerHTMLUpdate(element, newHTML) {
  Logger.system.debug("[DOM] Performing innerHTML update on element:", element);
  const currentHTML = element.innerHTML.trim();
  const newHTMLTrimmed = newHTML.trim();
  if (currentHTML === newHTMLTrimmed) {
    Logger.system.debug("[DOM] No differences detected in innerHTML; skipping update.");
    return;
  }
  Logger.system.debug("[DOM] Differences detected; performing partial update using diffing algorithm.");
  const range = document.createRange();
  range.selectNodeContents(element);
  const newFragment = range.createContextualFragment(newHTMLTrimmed);
  diffChildren(element, newFragment);
  if (element.innerHTML.trim() !== newHTMLTrimmed) {
    Logger.system.debug("[DOM] Fallback: innerHTML mismatch after diffing; updating innerHTML directly.");
    element.innerHTML = newHTMLTrimmed;
  }
}

/**
 * Updates target elements with new content based on the update strategy.
 * @param {TargetInstruction} target - The target instruction.
 * @param {string} content - The HTML content to update.
 * @param {Element|null} [resolvedElement=null] - Explicit element used for `this(...)` or forced resolved updates.
 * @param {object} [options={}]
 * @param {boolean} [options.forceResolvedElement=false] - Use the resolved element without querying the selector again.
 */
export function updateTarget(target, content, resolvedElement = null, options = {}) {
  Logger.system.debug(
    "[DOM] Updating target with instruction:",
    target,
    "and content length:",
    content.length
  );
  const useResolvedElement = resolvedElement && (
    options.forceResolvedElement ||
    target.selector.trim().toLowerCase() === 'this'
  );
  const elements = useResolvedElement
    ? [resolvedElement]
    : querySelectorAllSafe(target.selector);
  for (const targetElement of elements) {
    let registrationRoot = targetElement;
    Logger.system.debug(
      `[DOM] Updating element(s) matching "${target.selector}" using strategy "${target.strategy}"`,
      targetElement
    );
    switch (target.strategy) {
      case 'innerHTML':
        performInnerHTMLUpdate(targetElement, content);
        break;
      case 'outerHTML': {
        const range = document.createRange();
        range.selectNode(targetElement);
        const fragment = range.createContextualFragment(content);
        const newNodes = [...fragment.childNodes];
        if (newNodes.length > 0) {
          const parent = targetElement.parentElement;
          Logger.system.debug("[DOM] Replacing element with outerHTML strategy. New node count:", newNodes.length);
          targetElement.replaceWith(fragment);
          registrationRoot = parent || newNodes.find(node => node.nodeType === Node.ELEMENT_NODE) || document.body;
        } else {
          Logger.system.warn("[DOM] outerHTML update failed: no new nodes generated from content.");
        }
        break;
      }
      case 'append':
        Logger.system.debug("[DOM] Appending content to element:", targetElement);
        targetElement.insertAdjacentHTML('beforeend', content);
        break;
      case 'prepend':
        Logger.system.debug("[DOM] Prepending content to element:", targetElement);
        targetElement.insertAdjacentHTML('afterbegin', content);
        break;
      case 'before':
        Logger.system.debug("[DOM] Inserting content before element:", targetElement);
        targetElement.insertAdjacentHTML('beforebegin', content);
        registrationRoot = targetElement.parentElement || document.body;
        break;
      case 'after':
        Logger.system.debug("[DOM] Inserting content after element:", targetElement);
        targetElement.insertAdjacentHTML('afterend', content);
        registrationRoot = targetElement.parentElement || document.body;
        break;
      case 'remove':
        Logger.system.debug("[DOM] Removing element:", targetElement);
        targetElement.remove();
        registrationRoot = document.body;
        break;
      default:
        Logger.system.debug("[DOM] Default update strategy; updating innerHTML of element:", targetElement);
        targetElement.innerHTML = content;
    }
    if (hasHTMLeXMarkup(content)) {
      document.dispatchEvent(new CustomEvent('htmlex:dom-updated', {
        detail: { root: registrationRoot }
      }));
    }
  }
}
