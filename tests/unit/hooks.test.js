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

beforeEach(() => {
  clearLifecycleHooksForTests();
});

afterEach(() => {
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

test('public hook clearing is not exported through the runtime hook module API', async () => {
  registerLifecycleHook('unit:clear', () => {});
  const hooksModule = await import('../../src/public/src/hooks.js');
  const htmlexModule = await import('../../src/public/src/htmlex.js');

  assert.equal('clearLifecycleHooks' in hooksModule, false);
  assert.equal('clearLifecycleHooks' in htmlexModule, false);

  assert.deepEqual(getLifecycleHookNames(), ['unit:clear']);
});
