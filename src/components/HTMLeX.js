// ./src/HTMLeX.js

/**
 * @fileoverview A scalable HTML rendering library for HTMLeX responses with enhanced developer experience.
 */

/**
 * HTMLeX attribute definitions.
 *
 * @typedef {Object} HTMLeXAttrs
 * @property {string} [GET] - API endpoint for a GET call (URL string).
 * @property {string} [POST] - API endpoint for a POST call (URL string).
 * @property {string} [PUT] - API endpoint for a PUT call (URL string).
 * @property {string} [DELETE] - API endpoint for a DELETE call (URL string).
 * @property {string} [PATCH] - API endpoint for a PATCH call (URL string).
 * @property {string} [source] - CSS selectors to gather additional form data.
 * @property {string} [target] - Destination for returned HTML. Format: "CSS_SELECTOR(REPLACEMENT_STRATEGY)".
 * @property {string} [loading] - UI update displayed while waiting for an API call.
 * @property {string} [onerror] - UI update displayed if an API call fails.
 * @property {string} [auto] - Automatically fires an API call on DOM insertion (can include a delay in ms).
 * @property {string|number} [cache] - Cache API response for a TTL (in ms) or as a flag.
 * @property {string} [signal] - Emits a signal upon completion. Format: "@signalName".
 * @property {string} [listen] - Signals to wait for before triggering the API call.
 * @property {string} [trigger] - Overrides the default event triggering the API call (e.g., "click", "submit").
 * @property {number} [debounce] - Delay in ms to prevent rapid successive API calls.
 * @property {number} [throttle] - Minimum interval in ms between API calls.
 * @property {number} [poll] - Interval in ms for automatically triggering API calls.
 * @property {string} [socket] - WebSocket URL for real‑time updates.
 * @property {number} [retry] - Number of retry attempts for failed API calls.
 * @property {number} [timeout] - Maximum wait time in ms for an API call.
 * @property {number} [timer] - Delay in ms before emitting a signal after an API call.
 * @property {boolean|string} [sequential] - If truthy, processes API responses in FIFO order (optionally a delay in ms).
 * @property {string} [push] - Adds or updates query parameters in the URL. Format: "key=value".
 * @property {string} [pull] - Removes query parameters from the URL. Space-separated keys.
 * @property {string} [path] - Sets the URL path.
 * @property {string} [history] - History behavior: "push" or "replace".
 */

/**
 * Creates a virtual node representing an HTML element.
 *
 * @param {string} tagName - The HTML tag name (e.g., "div", "span").
 * @param {HTMLeXAttrs} [attrs={}] - An object of attributes conforming to the HTMLeX specification.
 * @param {...(string|Object)} children - Child nodes, which can be strings or other virtual nodes.
 * @returns {Object} A virtual node.
 */
export const tag = (tagName, attrs = {}, ...children) => ({
  tag: tagName,
  attrs,
  children
});

/**
 * An array of common HTML tag names.
 * @type {string[]}
 */
export const tagNames = [
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo',
  'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'colgroup',
  'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head',
  'header', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'keygen', 'label', 'legend',
  'li', 'link', 'main', 'map', 'mark', 'menu', 'menuitem', 'meta', 'meter', 'nav', 'noscript', 'object',
  'ol', 'optgroup', 'option', 'output', 'p', 'param', 'picture', 'pre', 'progress', 'q', 'rp', 'rt',
  'ruby', 's', 'samp', 'script', 'section', 'select', 'small', 'source', 'span', 'strong', 'style',
  'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time',
  'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr'
];

/**
 * An object containing helper functions for each HTML tag.
 *
 * @namespace tags
 */
export const tags = {};

// Generate a helper function for each tag name.
tagNames.forEach((tagName) => {
  /**
   * Creates a virtual node for a given HTML tag.
   *
   * @param {HTMLeXAttrs} [attrs={}] - Attributes for the HTML element.
   * @param {...(string|Object)} children - Child nodes.
   * @returns {Object} A virtual node.
   */
  tags[tagName] = (attrs = {}, ...children) => tag(tagName, attrs, ...children);
});

/**
 * Commonly used HTML tags for direct import.
 * @typedef {Object} CommonTags
 * @property {Function} div - Creates a "div" virtual node.
 * @property {Function} button - Creates a "button" virtual node.
 * @property {Function} span - Creates a "span" virtual node.
 * @property {Function} p - Creates a "p" virtual node.
 * @property {Function} a - Creates an "a" virtual node.
 */

/** @type {CommonTags} */
export const { div, button, span, p, a } = tags;

/**
 * Recursively renders a virtual node or string into an HTML string.
 *
 * @param {Object|string} node - The virtual node or string to render.
 * @returns {string} The resulting HTML string.
 */
export const render = (node) => {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  const { tag: tagName, attrs, children } = node;
  const attrString = Object.entries(attrs || {})
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');
  const childrenHTML = (children || []).map(render).join('');
  return `<${tagName}${attrString ? ' ' + attrString : ''}>${childrenHTML}</${tagName}>`;
};

/* ============================================================================
   Fragment Generation Functions
   These functions assist in generating HTMLeX fragment virtual nodes for
   progressive rendering and state updates.
   ============================================================================ */

/**
 * Generates a fragment virtual node.
 *
 * A fragment is a container element that may include an optional status attribute
 * (e.g., "500" for an error) and wraps provided content.
 *
 * @param {Object|string} content - The content to be included in the fragment.
 * @param {string} [status] - Optional status code for the fragment.
 * @returns {Object} A virtual fragment node.
 *
 * @example
 * const loadingFragment = createFragment('Loading...');
 * const errorFragment = createFragment('An error occurred!', '500');
 */
export const createFragment = (content, status) => {
  const attrs = status ? { status } : {};
  return tag('fragment', attrs, content);
};

/**
 * Generates a fragment virtual node and associates it with a target.
 *
 * This helper creates a fragment that specifies a target where the fragment's
 * content should be applied. Useful for progressive updates to the DOM.
 *
 * @param {string} target - A CSS selector representing the target element.
 * @param {Object|string} content - The content to be wrapped in the fragment.
 * @param {string} [status] - Optional status code for the fragment.
 * @returns {Object} A virtual fragment node with a target attribute.
 *
 * @example
 * const frag = generateFragment('#todoList', div({ class: 'loading' }, 'Loading todos...'));
 */
export const generateFragment = (target, content, status) => {
  const attrs = { target };
  if (status) {
    attrs.status = status;
  }
  return tag('fragment', attrs, content);
};

/**
 * Wraps HTML content into an HTMLeX fragment for progressive updates.
 *
 * @param {string} target - A CSS selector that identifies the target element.
 * @param {string} htmlContent - The HTML content to be injected.
 * @param {string} [status] - Optional status code to include in the fragment.
 * @returns {string} HTML string representing the fragment.
 *
 * @example
 * const fragHtml = renderFragment('#todoList(innerHTML)', '<div>Updated Content</div>');
 */
export function renderFragment(target, htmlContent, status) {
  // Create attributes for the fragment. Include the target and optional status.
  const attrs = { target };
  if (status) {
    attrs.status = status;
  }
  // Create a virtual fragment node using the HTMLeX tag function.
  const fragmentNode = tag('fragment', attrs, htmlContent);
  // Render the virtual node to an HTML string.
  return render(fragmentNode);
}