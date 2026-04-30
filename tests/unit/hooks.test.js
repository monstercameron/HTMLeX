import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import {
  clearLifecycleHooksForTests,
  createLifecycleHookScope,
  getLifecycleHookNames,
  registerLifecycleHook,
  runLifecycleHook,
  unregisterLifecycleHook,
} from '../../src/public/src/hooks.js';
import { Logger } from '../../src/public/src/logger.js';

let originalCustomEvent;
let originalLoggerEnabled;
let originalWindow;

beforeEach(() => {
  originalCustomEvent = globalThis.CustomEvent;
  originalLoggerEnabled = Logger.enabled;
  originalWindow = globalThis.window;
  Logger.enabled = false;
  clearLifecycleHooksForTests();
});

afterEach(() => {
  if (originalCustomEvent === undefined) {
    delete globalThis.CustomEvent;
  } else {
    globalThis.CustomEvent = originalCustomEvent;
  }
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
  Logger.enabled = originalLoggerEnabled;
  clearLifecycleHooksForTests();
});

class FakeElement {
  constructor(attributes = {}, parentElement = null) {
    this.attributes = attributes;
    this.dispatchedEvents = [];
    this.parentElement = parentElement;
  }

  hasAttribute(name) {
    return Object.hasOwn(this.attributes, name);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  dispatchEvent(event) {
    this.dispatchedEvents.push(event.type);
    return true;
  }
}

test('lifecycle hook registry rejects accidental duplicate registrations', () => {
  registerLifecycleHook('unit:hook', () => {});

  assert.throws(
    () => registerLifecycleHook('unit:hook', () => {}),
    /already registered/
  );
  assert.deepEqual(getLifecycleHookNames(), ['unit:hook']);
});

test('lifecycle hook registry supports explicit replacement and scoped unregister', () => {
  const calls = [];
  registerLifecycleHook('unit:replace', () => calls.push('first'), { owner: 'alpha' });
  registerLifecycleHook('unit:replace', () => calls.push('second'), { owner: 'beta', replace: true });

  assert.equal(unregisterLifecycleHook('unit:replace', { owner: 'alpha' }), false);

  const element = new FakeElement({ onbefore: 'unit:replace' });
  runLifecycleHook(element, 'onbefore', { type: 'click' });

  assert.deepEqual(calls, ['second']);
  assert.equal(unregisterLifecycleHook('unit:replace', { owner: 'beta' }), true);
  assert.deepEqual(getLifecycleHookNames(), []);
});

test('lifecycle hook scopes allow duplicate names and resolve by nearest element scope', () => {
  const calls = [];
  const alpha = createLifecycleHookScope('alpha');
  const beta = createLifecycleHookScope('beta');
  alpha.register('shared', ({ hookScope }) => calls.push(`alpha:${hookScope}`));
  beta.register('shared', ({ hookScope }) => calls.push(`beta:${hookScope}`));
  registerLifecycleHook('shared', ({ hookScope }) => calls.push(`global:${hookScope}`));

  runLifecycleHook(new FakeElement({ hookscope: 'alpha', onbefore: 'shared' }), 'onbefore');
  runLifecycleHook(new FakeElement({ hookscope: 'beta', onbefore: 'shared' }), 'onbefore');
  runLifecycleHook(new FakeElement({ onbefore: 'shared' }), 'onbefore');

  assert.deepEqual(calls, ['alpha:alpha', 'beta:beta', 'global:global']);
  assert.deepEqual(alpha.list(), ['shared']);
  assert.deepEqual(beta.list(), ['shared']);
  assert.deepEqual(getLifecycleHookNames(), ['shared']);
});

test('lifecycle hook lookup inherits hook scope from parent elements', () => {
  const calls = [];
  createLifecycleHookScope('panel').register('save', ({ hookScope }) => calls.push(hookScope));
  const parent = new FakeElement({ hookscope: 'panel' });
  const child = new FakeElement({ onbefore: 'save' }, parent);

  runLifecycleHook(child, 'onbefore');

  assert.deepEqual(calls, ['panel']);
});

test('invalid element hook scopes fall back to global hooks', () => {
  const calls = [];
  registerLifecycleHook('save', ({ hookScope }) => calls.push(hookScope));
  const element = new FakeElement({ hookscope: 'bad scope!', onbefore: 'save' });

  assert.doesNotThrow(() => runLifecycleHook(element, 'onbefore'));
  assert.deepEqual(calls, ['global']);
});

test('lifecycle hook APIs normalize invalid option bags and isolate dispatch failures', () => {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  const calls = [];
  registerLifecycleHook('unit:null-options', () => calls.push('called'), null);
  const scopedHooks = createLifecycleHookScope('safe-scope');
  scopedHooks.register('scoped-null-options', () => calls.push('scoped'), null);
  assert.deepEqual(getLifecycleHookNames(null), ['unit:null-options']);
  assert.deepEqual(scopedHooks.list(), ['scoped-null-options']);

  const throwingElement = new FakeElement({ onbefore: 'unit:null-options' });
  throwingElement.dispatchEvent = () => {
    throw new Error('dispatch denied');
  };

  assert.doesNotThrow(() => runLifecycleHook(throwingElement, 'onbefore'));
  assert.deepEqual(calls, ['called']);
  assert.equal(unregisterLifecycleHook('unit:null-options', null), true);
  assert.equal(scopedHooks.unregister('scoped-null-options', null), true);
});

test('lifecycle hook APIs tolerate hostile names, scopes, and option getters', () => {
  assert.throws(
    () => registerLifecycleHook({
      toString() {
        throw new Error('name denied');
      },
    }, () => {}),
    /Invalid HTMLeX lifecycle hook name/
  );
  assert.throws(
    () => createLifecycleHookScope({
      toString() {
        throw new Error('scope denied');
      },
    }),
    /Invalid HTMLeX lifecycle hook scope/
  );

  const hostileRegisterOptions = {};
  Object.defineProperties(hostileRegisterOptions, {
    owner: {
      get() {
        throw new Error('owner denied');
      },
    },
    replace: {
      get() {
        throw new Error('replace denied');
      },
    },
    scope: {
      get() {
        throw new Error('scope denied');
      },
    },
  });

  assert.doesNotThrow(() => registerLifecycleHook('hostile:options', () => {}, hostileRegisterOptions));
  assert.deepEqual(getLifecycleHookNames(), ['hostile:options']);

  const hostileUnregisterOptions = {};
  Object.defineProperties(hostileUnregisterOptions, {
    callback: {
      get() {
        throw new Error('callback denied');
      },
    },
    owner: {
      get() {
        throw new Error('owner denied');
      },
    },
  });

  assert.equal(unregisterLifecycleHook('hostile:options', hostileUnregisterOptions), true);
});

test('lifecycle hooks ignore hostile attribute names and values', () => {
  const calls = [];
  registerLifecycleHook('save', () => calls.push('called'));

  assert.doesNotThrow(() => runLifecycleHook(new FakeElement({ onbefore: 'save' }), {
    toString() {
      throw new Error('attribute denied');
    },
  }));
  assert.deepEqual(calls, []);

  const hostileValue = {
    toString() {
      throw new Error('value denied');
    },
  };
  assert.doesNotThrow(() => runLifecycleHook(new FakeElement({ onbefore: hostileValue }), 'onbefore'));
  assert.deepEqual(calls, []);
});

test('lifecycle hook dispatch tolerates hostile event APIs', () => {
  const calls = [];
  registerLifecycleHook('unit:dispatch-safe', () => calls.push('called'));

  Object.defineProperty(globalThis, 'CustomEvent', {
    configurable: true,
    get() {
      throw new Error('custom event denied');
    },
  });
  assert.doesNotThrow(() => runLifecycleHook(new FakeElement({ onbefore: 'unit:dispatch-safe' }), 'onbefore'));
  assert.deepEqual(calls, ['called']);

  Object.defineProperty(globalThis, 'CustomEvent', {
    configurable: true,
    value: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    writable: true,
  });

  const hostileElement = new FakeElement({ onbefore: 'unit:dispatch-safe' });
  Object.defineProperty(hostileElement, 'dispatchEvent', {
    get() {
      throw new Error('dispatch denied');
    },
  });

  assert.doesNotThrow(() => runLifecycleHook(hostileElement, 'onbefore'));
  assert.deepEqual(calls, ['called', 'called']);
});

test('lifecycle hooks ignore hostile element inspection and parent scope getters', () => {
  const calls = [];
  registerLifecycleHook('save', () => calls.push('called'));
  const hostileElement = {
    hasAttribute() {
      throw new Error('attributes denied');
    },
    get parentElement() {
      throw new Error('parent denied');
    },
  };

  assert.doesNotThrow(() => runLifecycleHook(hostileElement, 'onbefore'));
  assert.deepEqual(calls, []);

  const parent = new FakeElement({ hookscope: 'panel' });
  createLifecycleHookScope('panel').register('save', ({ hookScope }) => calls.push(hookScope));
  const child = new FakeElement({ onbefore: 'save' });
  Object.defineProperty(child, 'parentElement', {
    get() {
      throw new Error('parent denied');
    },
  });

  assert.doesNotThrow(() => runLifecycleHook(child, 'onbefore'));
  assert.deepEqual(calls, ['called']);
  assert.equal(parent.getAttribute('hookscope'), 'panel');
});

test('lifecycle hook global installation fails closed for hostile window objects', async () => {
  const hooksModuleUrl = new URL(`../../src/public/src/hooks.js?global=${Date.now()}`, import.meta.url);
  const { installLifecycleHookGlobal } = await import(hooksModuleUrl.href);
  globalThis.window = {};
  Object.defineProperty(globalThis.window, 'HTMLeX', {
    configurable: true,
    get() {
      throw new Error('global denied');
    },
  });

  assert.doesNotThrow(() => installLifecycleHookGlobal());
});

test('lifecycle hook global installation preserves access when existing APIs are hostile', async () => {
  const hooksModuleUrl = new URL(`../../src/public/src/hooks.js?global-copy=${Date.now()}`, import.meta.url);
  const { installLifecycleHookGlobal } = await import(hooksModuleUrl.href);
  globalThis.window = {
    HTMLeX: new Proxy({}, {
      ownKeys() {
        throw new Error('keys denied');
      },
    }),
  };

  assert.doesNotThrow(() => installLifecycleHookGlobal());
  assert.equal(typeof globalThis.window.HTMLeX.hooks.register, 'function');

  Object.defineProperty(globalThis.window, 'HTMLeX', {
    configurable: true,
    get() {
      return {};
    },
    set() {
      throw new Error('set denied');
    },
  });

  assert.doesNotThrow(() => installLifecycleHookGlobal());
});

test('public hook clearing is not exported through the runtime hook module API', async () => {
  registerLifecycleHook('unit:clear', () => {});
  const hooksModule = await import('../../src/public/src/hooks.js');
  const htmlexModule = await import('../../src/public/src/htmlex.js');

  assert.equal('clearLifecycleHooks' in hooksModule, false);
  assert.equal('clearLifecycleHooks' in htmlexModule, false);

  assert.deepEqual(getLifecycleHookNames(), ['unit:clear']);
});
