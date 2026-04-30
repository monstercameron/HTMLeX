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
 * @property {string} [extras] - Space-separated key=value pairs appended to the request body or query string.
 * @property {string} [publish] - Emits a signal when the action succeeds.
 * @property {string} [subscribe] - Signals that trigger an element's API action.
 * @property {string} [trigger] - Overrides the default event triggering the API call (e.g., "click", "submit").
 * @property {number} [debounce] - Delay in ms to prevent rapid successive API calls.
 * @property {number} [throttle] - Minimum interval in ms between API calls.
 * @property {number} [poll] - Interval in ms for automatically triggering API calls.
 * @property {number} [repeat] - Maximum number of poll iterations.
 * @property {string} [socket] - WebSocket URL for real-time updates.
 * @property {number} [retry] - Number of retry attempts for failed API calls.
 * @property {number} [timeout] - Maximum wait time in ms for an API call.
 * @property {number} [timer] - Delay in ms before emitting a signal after an API call.
 * @property {boolean|string} [sequential] - If truthy, processes API responses in FIFO order (optionally a delay in ms).
 * @property {string} [push] - Adds or updates query parameters in the URL. Format: "key=value".
 * @property {string} [pull] - Removes query parameters from the URL. Space-separated keys.
 * @property {string} [path] - Sets the URL path.
 * @property {string} [history] - History behavior: "push" or "replace".
 */

const RAW_HTML = Symbol('HTMLeX.rawHTML');
const VALID_TAG_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]*$/u;
const VALID_ATTRIBUTE_NAME_PATTERN = /^[^\s"'<>/=`]+$/u;
const VOID_TAG_NAMES = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
]);

function formatNameForError(name) {
  try {
    return String(name);
  } catch {
    return '[Unstringifiable]';
  }
}

function safeString(value, fallback = '') {
  try {
    return String(value ?? fallback);
  } catch {
    return fallback;
  }
}

function safeIsArray(value) {
  try {
    return Array.isArray(value);
  } catch {
    return false;
  }
}

function getObjectField(value, fieldName, fallback = undefined) {
  try {
    return value?.[fieldName] ?? fallback;
  } catch {
    return fallback;
  }
}

function getObjectKeys(value) {
  if (!value || typeof value !== 'object') return [];

  try {
    return Object.keys(value);
  } catch {
    return [];
  }
}

function getArrayLength(value) {
  try {
    const length = value?.length;
    return Number.isSafeInteger(length) && length > 0 ? length : 0;
  } catch {
    return 0;
  }
}

function assertValidHtmlName(name, kind) {
  const pattern = kind === 'tag' ? VALID_TAG_NAME_PATTERN : VALID_ATTRIBUTE_NAME_PATTERN;
  const hasControlCharacter = typeof name === 'string' &&
    [...name].some(character => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 0x1F || codePoint === 0x7F;
    });
  if (typeof name !== 'string' || hasControlCharacter || !pattern.test(name)) {
    throw new TypeError(`Invalid HTML ${kind} name "${formatNameForError(name)}".`);
  }
}

/**
 * Escapes text inserted into an HTML text node.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return safeString(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Escapes text inserted into an HTML attribute.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

/**
 * Marks server-owned HTML as intentionally raw. Do not wrap user input with this.
 * @param {unknown} html
 * @returns {Object}
 */
export function rawHtml(html) {
  return { [RAW_HTML]: true, html: safeString(html) };
}

function isVirtualNode(value) {
  try {
    return value && typeof value === 'object' && typeof getObjectField(value, 'tag') === 'string';
  } catch {
    return false;
  }
}

function normalizeTagArguments(attrs, children) {
  if (
    attrs === undefined ||
    attrs === null ||
    typeof attrs !== 'object' ||
    safeIsArray(attrs) ||
    isRawHtmlNode(attrs) ||
    isVirtualNode(attrs)
  ) {
    return [{}, attrs === undefined || attrs === null ? children : [attrs, ...children]];
  }

  return [attrs, children];
}

function getAttributeEntries(attributes) {
  if (!attributes || typeof attributes !== 'object') return [];

  return getObjectKeys(attributes).flatMap(key => {
    const value = getObjectField(attributes, key, undefined);
    return value === undefined ? [] : [[key, value]];
  });
}

function normalizeChildren(children) {
  if (children === undefined || children === null) return [];
  return safeIsArray(children) ? children : [children];
}

function isRawHtmlNode(node) {
  try {
    return Boolean(node?.[RAW_HTML]);
  } catch {
    return false;
  }
}

function renderChildList(children) {
  const normalizedChildren = normalizeChildren(children);
  if (!safeIsArray(normalizedChildren)) return render(normalizedChildren);

  let html = '';
  for (let index = 0; index < getArrayLength(normalizedChildren); index += 1) {
    const child = getObjectField(normalizedChildren, index, undefined);
    if (child !== undefined) html += render(child);
  }
  return html;
}

/**
 * Creates a virtual node representing an HTML element.
 *
 * @param {string} tagName - The HTML tag name (e.g., "div", "span").
 * @param {HTMLeXAttrs} [attrs={}] - An object of attributes conforming to the HTMLeX specification.
 * @param {...(string|number|bigint|boolean|Object|Array)} children - Child nodes, primitives, raw HTML nodes, arrays, or virtual nodes.
 * @returns {Object} A virtual node.
 */
export const tag = (tagName, attrs = {}, ...children) => {
  assertValidHtmlName(tagName, 'tag');
  const [normalizedAttrs, normalizedChildren] = normalizeTagArguments(attrs, children);
  return {
    tag: tagName,
    attrs: normalizedAttrs,
    children: normalizedChildren
  };
};

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
export const tags = Object.fromEntries(
  tagNames.map(tagName => [
    tagName,
    (attrs = {}, ...children) => tag(tagName, attrs, ...children)
  ])
);

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
 * @param {Object|string|number|bigint|boolean|Array|null|undefined} node - The value to render.
 * @returns {string} The resulting HTML string.
 */
export const render = (node) => {
  if (safeIsArray(node)) return renderChildList(node);
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return escapeHtml(node);
  }
  if (typeof node === 'bigint') {
    return escapeHtml(safeString(node));
  }
  if (!node || typeof node !== 'object') return '';
  if (isRawHtmlNode(node)) return safeString(getObjectField(node, 'html', ''));
  const tagName = getObjectField(node, 'tag', null);
  if (typeof tagName !== 'string') return '';
  const attributes = getObjectField(node, 'attrs', {});
  const children = getObjectField(node, 'children', []);
  assertValidHtmlName(tagName, 'tag');
  const attributeHtml = getAttributeEntries(attributes)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => {
      assertValidHtmlName(key, 'attribute');
      return value === true ? `${key}` : `${key}="${escapeAttribute(value)}"`;
    })
    .join(' ');
  if (VOID_TAG_NAMES.has(tagName.toLowerCase())) {
    return `<${tagName}${attributeHtml ? ' ' + attributeHtml : ''}>`;
  }
  const childHtml = renderChildList(children);
  return `<${tagName}${attributeHtml ? ' ' + attributeHtml : ''}>${childHtml}</${tagName}>`;
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
 * @param {Object|string|number|bigint|boolean|Array|null|undefined} content - The content to be included in the fragment.
 * @param {string|number|bigint|boolean|null|undefined} [status] - Optional status code for the fragment.
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
 * @param {Object|string|number|bigint|boolean|Array|null|undefined} content - The content to be wrapped in the fragment.
 * @param {string|number|bigint|boolean|null|undefined} [status] - Optional status code for the fragment.
 * @returns {Object} A virtual fragment node with a target attribute.
 *
 * @example
 * const fragment = generateFragment('#todoList', div({ class: 'loading' }, 'Loading todos...'));
 */
export const generateFragment = (target, content, status) => {
  const attrs = { target };
  if (status) {
    attrs.status = status;
  }
  return tag('fragment', attrs, content);
};

function normalizeFragmentAttributes(target, fragmentAttributes) {
  if (!fragmentAttributes) {
    return { target };
  }

  if (typeof fragmentAttributes === 'object' && !safeIsArray(fragmentAttributes)) {
    const attributes = {};
    for (const key of getObjectKeys(fragmentAttributes)) {
      if (key === 'target') continue;
      const value = getObjectField(fragmentAttributes, key, undefined);
      if (value !== undefined) attributes[key] = value;
    }
    attributes.target = target;
    return attributes;
  }

  return {
    target,
    status: fragmentAttributes
  };
}

/**
 * Wraps HTML content into an HTMLeX fragment for progressive updates.
 *
 * @param {string} target - A CSS selector that identifies the target element.
 * @param {unknown} htmlContent - The HTML content to be injected.
 * @param {string|number|bigint|boolean|Object|null|undefined} [fragmentAttributes] - Optional fragment attributes or status code.
 * @returns {string} HTML string representing the fragment.
 *
 * @example
 * const fragmentHtml = renderFragment('#todoList(innerHTML)', '<div>Updated Content</div>');
 */
export function renderFragment(target, htmlContent, fragmentAttributes = {}) {
  const attrs = normalizeFragmentAttributes(target, fragmentAttributes);
  const fragmentNode = tag('fragment', attrs, rawHtml(htmlContent));
  return render(fragmentNode);
}
