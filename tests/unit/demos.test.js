import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAndRenderDemos } from '../../src/features/demos.js';

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
