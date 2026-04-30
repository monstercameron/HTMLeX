/**
 * @module Hooks
 * @description Safe lifecycle hook registration and dispatch for HTMLeX actions.
 */

import { Logger } from './logger.js';

export const LIFECYCLE_HOOK_EVENT = 'htmlex:hook';

const GLOBAL_API_NAME = 'HTMLeX';
const DEFAULT_HOOK_SCOPE = 'global';
const VALID_HOOK_NAME_PATTERN = /^[A-Za-z][\w:.-]*$/u;
const SCRIPT_LIKE_HOOK_PATTERN = /[=;(){}]|\b(?:document|eval|fetch|Function|globalThis|import|localStorage|sessionStorage|window)\b/u;
const HOOK_SCOPE_ATTRIBUTE_NAMES = ['hookscope', 'data-htmlex-hook-scope'];
const lifecycleHooks = new Map();
const TEST_CLEAR_TOKEN = Symbol('HTMLeX.testClearToken');

function parseHookNames(rawValue) {
  return String(rawValue ?? '')
    .split(/[\s,]+/u)
    .map(name => name.trim())
    .filter(Boolean);
}

function normalizeHookEventName(hookAttributeName) {
  return `htmlex:${String(hookAttributeName).toLowerCase()}`;
}

function normalizeHookScope(scope = DEFAULT_HOOK_SCOPE) {
  const normalizedScope = String(scope || DEFAULT_HOOK_SCOPE).trim();
  if (!VALID_HOOK_NAME_PATTERN.test(normalizedScope)) {
    throw new TypeError(`Invalid HTMLeX lifecycle hook scope "${normalizedScope}".`);
  }
  return normalizedScope;
}

function getHookKey(scope, hookName) {
  return `${scope}\u0000${hookName}`;
}

function getElementHookScope(element) {
  let current = element;
  while (current) {
    for (const attributeName of HOOK_SCOPE_ATTRIBUTE_NAMES) {
      if (current.hasAttribute?.(attributeName)) {
        const scope = current.getAttribute(attributeName)?.trim();
        if (scope) return normalizeHookScope(scope);
      }
    }
    current = current.parentElement || current.parentNode?.host || null;
  }

  return DEFAULT_HOOK_SCOPE;
}

function dispatchLifecycleEvent(element, detail) {
  if (typeof CustomEvent !== 'function' || typeof element?.dispatchEvent !== 'function') return;

  element.dispatchEvent(new CustomEvent(LIFECYCLE_HOOK_EVENT, {
    bubbles: true,
    detail
  }));
  element.dispatchEvent(new CustomEvent(normalizeHookEventName(detail.hookAttributeName), {
    bubbles: true,
    detail
  }));
}

function createHookContext({ element, event, hookAttributeName, hookName, hookScope, rawValue }) {
  return {
    element,
    event,
    hookAttributeName,
    hookName,
    hookScope,
    rawValue
  };
}

export function registerLifecycleHook(name, callback, options = {}) {
  const hookName = String(name ?? '').trim();
  const hookScope = normalizeHookScope(options.scope);
  if (!VALID_HOOK_NAME_PATTERN.test(hookName)) {
    throw new TypeError(`Invalid HTMLeX lifecycle hook name "${hookName}".`);
  }
  if (typeof callback !== 'function') {
    throw new TypeError(`HTMLeX lifecycle hook "${hookName}" must be a function.`);
  }
  const hookKey = getHookKey(hookScope, hookName);
  const existing = lifecycleHooks.get(hookKey);
  if (existing && !options.replace) {
    throw new TypeError(
      `HTMLeX lifecycle hook "${hookName}" is already registered in scope "${hookScope}". ` +
      'Unregister it first or pass { replace: true }.'
    );
  }

  lifecycleHooks.set(hookKey, {
    callback,
    name: hookName,
    owner: options.owner || 'default',
    scope: hookScope
  });
  Logger.system.debug(`[HOOKS] Registered lifecycle hook "${hookName}" in scope "${hookScope}".`);

  return () => unregisterLifecycleHook(hookName, { callback, scope: hookScope });
}

export function unregisterLifecycleHook(name, options = {}) {
  const hookName = String(name ?? '').trim();
  const hookScope = normalizeHookScope(options.scope);
  const hookKey = getHookKey(hookScope, hookName);
  const existing = lifecycleHooks.get(hookKey);
  if (options.callback && existing?.callback !== options.callback) {
    return false;
  }
  if (options.owner && existing?.owner !== options.owner) {
    return false;
  }
  if (lifecycleHooks.delete(hookKey)) {
    Logger.system.debug(`[HOOKS] Unregistered lifecycle hook "${hookName}" from scope "${hookScope}".`);
    return true;
  }
  return false;
}

function clearLifecycleHooks(token) {
  if (token !== TEST_CLEAR_TOKEN) {
    throw new TypeError('clearLifecycleHooks is reserved for tests and isolated runtime teardown.');
  }
  lifecycleHooks.clear();
  Logger.system.debug('[HOOKS] Cleared lifecycle hook registry.');
}

export function clearLifecycleHooksForTests() {
  clearLifecycleHooks(TEST_CLEAR_TOKEN);
}

export function getLifecycleHookNames(scope = DEFAULT_HOOK_SCOPE) {
  const hookScope = normalizeHookScope(scope);
  return [...lifecycleHooks.values()]
    .filter(record => record.scope === hookScope)
    .map(record => record.name);
}

function getLifecycleHookRecord(hookName, hookScope) {
  return lifecycleHooks.get(getHookKey(hookScope, hookName)) ||
    (hookScope === DEFAULT_HOOK_SCOPE ? null : lifecycleHooks.get(getHookKey(DEFAULT_HOOK_SCOPE, hookName)));
}

export function createLifecycleHookScope(scope) {
  const hookScope = normalizeHookScope(scope);
  return Object.freeze({
    register(name, callback, options = {}) {
      return registerLifecycleHook(name, callback, { ...options, scope: hookScope });
    },
    unregister(name, options = {}) {
      return unregisterLifecycleHook(name, { ...options, scope: hookScope });
    },
    list() {
      return getLifecycleHookNames(hookScope);
    }
  });
}

export function runLifecycleHook(element, hookAttributeName, event = null) {
  if (!element?.hasAttribute?.(hookAttributeName)) return;

  const rawValue = element.getAttribute(hookAttributeName);
  const hookNames = parseHookNames(rawValue);
  if (!hookNames.length) return;
  const hookScope = getElementHookScope(element);

  for (const hookName of hookNames) {
    const context = createHookContext({
      element,
      event,
      hookAttributeName,
      hookName,
      hookScope,
      rawValue
    });

    if (!VALID_HOOK_NAME_PATTERN.test(hookName)) {
      Logger.system.warn(`[HOOKS] Ignoring invalid lifecycle hook name "${hookName}" on ${hookAttributeName}.`);
      dispatchLifecycleEvent(element, context);
      continue;
    }

    const record = getLifecycleHookRecord(hookName, hookScope);
    if (record) {
      try {
        Logger.system.debug(`[HOOKS] Running lifecycle hook "${hookName}" for ${hookAttributeName}.`);
        record.callback(context);
      } catch (error) {
        Logger.system.error(`[HOOKS] Error in lifecycle hook "${hookName}":`, error);
      }
    } else if (SCRIPT_LIKE_HOOK_PATTERN.test(hookName)) {
      Logger.system.warn(
        `[HOOKS] Ignored script-like lifecycle hook value for ${hookAttributeName}. ` +
        'Register a named hook with HTMLeX.hooks.register(name, callback) instead.'
      );
    } else {
      Logger.system.debug(`[HOOKS] No registered callback for lifecycle hook "${hookName}". Dispatching events only.`);
    }

    dispatchLifecycleEvent(element, context);
  }
}

export const hooks = Object.freeze({
  register: registerLifecycleHook,
  unregister: unregisterLifecycleHook,
  list: getLifecycleHookNames,
  scope: createLifecycleHookScope
});

export function installLifecycleHookGlobal() {
  if (typeof window === 'undefined') return;

  const existingApi = window[GLOBAL_API_NAME] || {};
  window[GLOBAL_API_NAME] = {
    ...existingApi,
    hooks
  };
}
