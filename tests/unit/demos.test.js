import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAndRenderDemos, renderDemoDetails } from '../../src/features/demos.js';

process.env.HTMLEX_LOG_LEVEL = 'silent';

function createResponse() {
  return {
    body: '',
    headers: {},
    headersSent: false,
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    type(value) {
      this.headers['Content-Type'] = value;
      return this;
    },
    send(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    }
  };
}

test('loadAndRenderDemos renders the catalog into a fragment', async () => {
  const response = createResponse();

  await loadAndRenderDemos({ requestId: 'demos-unit' }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.match(response.body, /<fragment target="this\(innerHTML\)">/);
  assert.match(response.body, /Todo App with Lifecycle Hooks/);
  assert.match(response.body, /GET="\/todos\/init"/);
});

test('renderDemoDetails serves catalog learn-more routes', async () => {
  const response = createResponse();

  await renderDemoDetails({
    path: '/todos/details',
    requestId: 'demos-details-unit',
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Content-Type'], 'html');
  assert.match(response.body, /^<!DOCTYPE html>/);
  assert.match(response.body, /Todo App with Lifecycle Hooks/);
  assert.match(response.body, /Create and manage todos/);
  assert.match(response.body, /href="\/todos\/init"/);
});

test('renderDemoDetails returns 404 for unknown catalog routes', async () => {
  const response = createResponse();

  await renderDemoDetails({
    path: '/missing/details',
    requestId: 'missing-demo',
  }, response);

  assert.equal(response.statusCode, 404);
  assert.equal(response.headers['Content-Type'], 'text/plain');
  assert.match(response.body, /Demo details not found/);
  assert.match(response.body, /missing-demo/);
});

test('loadAndRenderDemos reuses cached catalog html when the source file is unchanged', async () => {
  const firstResponse = createResponse();
  const secondResponse = createResponse();

  await loadAndRenderDemos({ requestId: 'demos-cache-one' }, firstResponse);
  await loadAndRenderDemos({ requestId: 'demos-cache-two' }, secondResponse);

  assert.equal(secondResponse.statusCode, 200);
  assert.equal(secondResponse.body, firstResponse.body);
});
