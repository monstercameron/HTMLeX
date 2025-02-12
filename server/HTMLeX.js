// ./server/HTMLeX.js
// A scalable HTML rendering library for HTMLeX responses with enhanced DevX via JSDoc.

/* -------------------------------------------------------------------------
   1. Define the HTMLeX Attributes Type
   ------------------------------------------------------------------------- */
/**
 * @typedef {Object} HTMLeXAttrs
 * @property {string} [GET] - Specifies the API endpoint for a GET call. Value: URL string.
 * @property {string} [POST] - Specifies the API endpoint for a POST call. Value: URL string.
 * @property {string} [PUT] - Specifies the API endpoint for a PUT call. Value: URL string.
 * @property {string} [DELETE] - Specifies the API endpoint for a DELETE call. Value: URL string.
 * @property {string} [PATCH] - Specifies the API endpoint for a PATCH call. Value: URL string.
 * @property {string} [source] - Gathers additional form data from the specified CSS selectors.
 * @property {string} [target] - Specifies where returned HTML is applied. Format: "CSS_SELECTOR(REPLACEMENT_STRATEGY)".
 * @property {string} [loading] - Defines the UI update to show while waiting for an API call.
 * @property {string} [onerror] - Defines the UI update to show if an API call fails.
 * @property {string} [auto] - Automatically fires an API call when the element is inserted into the DOM (optionally with a delay in ms).
 * @property {string|number} [cache] - Caches the API response for a given TTL (in ms) or a flag.
 * @property {string} [signal] - Emits a signal upon action completion. Format: "@signalName".
 * @property {string} [listen] - Specifies signals to wait for before triggering the API call.
 * @property {string} [trigger] - Overrides the default event that triggers the API call (e.g., "click", "submit").
 * @property {number} [debounce] - Prevents rapid successive API calls by waiting for a quiet period (ms).
 * @property {number} [throttle] - Ensures a minimum interval (ms) between API calls.
 * @property {number} [poll] - Automatically triggers API calls at a fixed interval (ms).
 * @property {string} [socket] - Specifies a WebSocket URL for real‑time updates.
 * @property {number} [retry] - Specifies the number of retry attempts for failed API calls.
 * @property {number} [timeout] - Specifies the maximum wait time (ms) for an API call.
 * @property {number} [timer] - Delays signal emission after an API call, specified in ms.
 * @property {boolean|string} [sequential] - If true, processes API responses in FIFO order using requestAnimationFrame.
 * @property {string} [push] - Adds or updates query parameters in the URL. Format: "key=value".
 * @property {string} [pull] - Removes query parameters from the URL. Space-separated keys.
 * @property {string} [path] - Sets the URL path.
 * @property {string} [history] - Specifies history behavior: "push" or "replace".
 */

/* -------------------------------------------------------------------------
   2. Generic Virtual Node Creator
   ------------------------------------------------------------------------- */
/**
 * Creates a virtual node for any HTML tag.
 *
 * @param {string} tagName - The tag name (e.g., "div", "span").
 * @param {HTMLeXAttrs} [attrs={}] - An object of HTML attributes conforming to the HTMLeX spec.
 * @param {...any} children - Child nodes (strings or other virtual nodes).
 * @returns {Object} A virtual node.
 */
export const tag = (tagName, attrs = {}, ...children) => ({
    tag: tagName,
    attrs,
    children
  });
  
  /* -------------------------------------------------------------------------
     3. Automatically Generated Tag Functions
     ------------------------------------------------------------------------- */
  // List of top ~100 HTML tag names.
  const tagNames = [
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
  
  // Container to hold our auto‑generated functions.
  export const tags = {};
  
  // Loop over the list of tag names and create a function for each.
  tagNames.forEach(tagName => {
    tags[tagName] = (attrs = {}, ...children) => tag(tagName, attrs, ...children);
  });
  
  /* -------------------------------------------------------------------------
     4. Common Named Exports (for backwards compatibility)
     ------------------------------------------------------------------------- */
  // These are the most common tags. You can import these directly.
  export const div = tags.div;
  export const button = tags.button;
  export const span = tags.span;
  export const p = tags.p;
  export const a = tags.a;
  
  /* -------------------------------------------------------------------------
     5. Render Function
     ------------------------------------------------------------------------- */
  /**
   * Recursively renders a virtual node (or plain string) to an HTML string.
   *
   * @param {Object|string} node - A virtual node or a plain string.
   * @returns {string} The HTML string representation.
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
  
  /* -------------------------------------------------------------------------
     6. Export the List of Tag Names (Optional)
     ------------------------------------------------------------------------- */
  export const tagList = tagNames;
  
  /* -------------------------------------------------------------------------
     7. HTMLeX Attribute Helpers for DevX
     ------------------------------------------------------------------------- */
  
  /**
   * A set of valid HTMLeX attribute names.
   * @type {Set<string>}
   */
  const validHTMLeXAttrs = new Set([
    "GET", "POST", "PUT", "DELETE", "PATCH",
    "source", "target", "loading", "onerror",
    "auto", "cache", "signal", "listen", "trigger",
    "debounce", "throttle", "poll", "socket",
    "retry", "timeout", "timer", "sequential",
    "push", "pull", "path", "history"
  ]);
  
  /**
   * Validates an HTMLeX attribute object.
   *
   * @param {HTMLeXAttrs} attrs - The attribute object to validate.
   * @returns {{ valid: HTMLeXAttrs, invalid: Object<string, any> }}
   *          An object containing the valid attributes and any invalid ones.
   *
   * @example
   * const { valid, invalid } = validateHTMLeXAttrs({ GET: '/api', foo: 'bar' });
   * // valid = { GET: '/api' }, invalid = { foo: 'bar' }
   */
  export const validateHTMLeXAttrs = (attrs) => {
    const valid = {};
    const invalid = {};
    for (const key in attrs) {
      if (validHTMLeXAttrs.has(key)) {
        valid[key] = attrs[key];
      } else {
        invalid[key] = attrs[key];
      }
    }
    return { valid, invalid };
  };
  
  /**
   * A dictionary mapping HTMLeX attribute names to their descriptions.
   *
   * @type {Object<string, string>}
   */
  const attrDescriptions = {
    "GET": "Specifies the API endpoint for a GET call. Value: URL string.",
    "POST": "Specifies the API endpoint for a POST call. Value: URL string.",
    "PUT": "Specifies the API endpoint for a PUT call. Value: URL string.",
    "DELETE": "Specifies the API endpoint for a DELETE call. Value: URL string.",
    "PATCH": "Specifies the API endpoint for a PATCH call. Value: URL string.",
    "source": "Gathers additional form data from the specified CSS selectors.",
    "target": "Specifies where returned HTML is applied. Format: 'CSS_SELECTOR(REPLACEMENT_STRATEGY)'.",
    "loading": "Defines the UI update to show while waiting for an API call.",
    "onerror": "Defines the UI update to show if an API call fails.",
    "auto": "Automatically fires an API call when the element is inserted into the DOM (optionally with a delay in ms).",
    "cache": "Caches the API response for a given TTL in milliseconds.",
    "signal": "Emits a signal upon action completion. Format: '@signalName'.",
    "listen": "Specifies signals to wait for before triggering the API call.",
    "trigger": "Overrides the default event that triggers the API call (e.g., 'click', 'submit').",
    "debounce": "Prevents rapid successive API calls by waiting for a quiet period (ms).",
    "throttle": "Ensures a minimum interval (ms) between API calls.",
    "poll": "Triggers API calls at a fixed interval (ms).",
    "socket": "Specifies a WebSocket URL for real‑time updates.",
    "retry": "Specifies the number of retry attempts for failed API calls.",
    "timeout": "Specifies the maximum wait time (ms) for an API call.",
    "timer": "Delays signal emission after an API call, specified in ms.",
    "sequential": "If true, processes API responses in FIFO order using requestAnimationFrame.",
    "push": "Adds or updates query parameters in the URL. Format: 'key=value'.",
    "pull": "Removes query parameters from the URL. Space-separated keys.",
    "path": "Sets the URL path.",
    "history": "Specifies history behavior: 'push' or 'replace'."
  };
  
  /**
   * Returns a description for a given HTMLeX attribute.
   *
   * @param {string} attrName - The HTMLeX attribute name.
   * @returns {string} A human‑readable description of the attribute.
   *
   * @example
   * console.log(explainHTMLeXAttr("GET"));
   */
  export const explainHTMLeXAttr = (attrName) => {
    return attrDescriptions[attrName] || "No description available for this attribute.";
  };
  
  /**
   * Lists all HTMLeX attribute names with their descriptions.
   *
   * @returns {string} A formatted string listing all HTMLeX attributes and their descriptions.
   *
   * @example
   * console.log(listHTMLeXAttrs());
   */
  export const listHTMLeXAttrs = () => {
    let output = "HTMLeX Attributes:\n";
    for (const attr in attrDescriptions) {
      output += `${attr}: ${attrDescriptions[attr]}\n`;
    }
    return output;
  };
  