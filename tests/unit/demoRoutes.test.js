import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { app } from '../../src/app.js';

const demosPath = path.resolve(import.meta.dirname, '../../src/persistence/demos.json');

function getRegisteredGetRoutes() {
  const routerStack = app._router?.stack ?? app.router?.stack ?? [];
  return routerStack
    .filter(layer => layer.route?.methods?.get)
    .map(layer => layer.route.path);
}

test('every demo catalog item has registered init and details routes', async () => {
  const demos = JSON.parse(await fs.readFile(demosPath, 'utf8'));
  const routes = new Set(getRegisteredGetRoutes());

  assert.ok(demos.length > 0);
  assert.ok(routes.has('/:demoSlug/details'), 'demo detail route is not registered');
  for (const demo of demos) {
    assert.equal(typeof demo.initDemoHref, 'string', `${demo.id} is missing initDemoHref`);
    assert.ok(demo.initDemoHref.length > 0, `${demo.id} has an empty initDemoHref`);
    assert.ok(routes.has(demo.initDemoHref), `${demo.id} points to unregistered route ${demo.initDemoHref}`);
    assert.equal(typeof demo.learnMoreHref, 'string', `${demo.id} is missing learnMoreHref`);
    assert.match(demo.learnMoreHref, /^\/[A-Za-z][\w-]*\/details$/u);
  }
});
