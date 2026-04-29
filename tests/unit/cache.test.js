import assert from 'node:assert/strict';
import test from 'node:test';
import { getCache, setCache } from '../../src/public/src/cache.js';

test('cache evicts oldest entries after the configured cap', () => {
  const prefix = `cache-cap-${Date.now()}-`;

  for (let i = 0; i < 105; i++) {
    setCache(`${prefix}${i}`, `value-${i}`, 10000);
  }

  assert.equal(getCache(`${prefix}0`), null);
  assert.equal(getCache(`${prefix}4`), null);
  assert.equal(getCache(`${prefix}5`), 'value-5');
  assert.equal(getCache(`${prefix}104`), 'value-104');
});

test('cache treats missing or invalid TTL values as non-expiring entries', () => {
  const prefix = `cache-permanent-${Date.now()}-`;

  setCache(`${prefix}zero`, 'zero', 0);
  setCache(`${prefix}negative`, 'negative', -1);
  setCache(`${prefix}text`, 'text', 'not-a-number');

  assert.equal(getCache(`${prefix}zero`), 'zero');
  assert.equal(getCache(`${prefix}negative`), 'negative');
  assert.equal(getCache(`${prefix}text`), 'text');
});
