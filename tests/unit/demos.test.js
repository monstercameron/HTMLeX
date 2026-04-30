import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

async function withTempDemoFile(contents, callback) {
  const originalDemosFile = process.env.HTMLEX_DEMOS_FILE;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'htmlex-demos-test-'));
  const demosFile = path.join(directory, 'demos.json');
  await writeFile(demosFile, contents);
  process.env.HTMLEX_DEMOS_FILE = demosFile;

  try {
    await callback();
  } finally {
    if (originalDemosFile === undefined) {
      delete process.env.HTMLEX_DEMOS_FILE;
    } else {
      process.env.HTMLEX_DEMOS_FILE = originalDemosFile;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

function createDemo(overrides = {}) {
  return {
    id: 'unitDemo',
    icon: 'Unit',
    title: 'Unit Demo',
    subtitle: 'Temp Catalog',
    description: 'Loaded from a temporary catalog.',
    highlights: ['Validated shape'],
    initDemoHref: '/unit/init',
    launchButtonText: 'Open Unit Demo',
    learnMoreText: 'Details',
    learnMoreHref: '/unit/details',
    ...overrides,
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

test('renderDemoDetails fails closed for hostile request fields', async () => {
  const response = createResponse();
  const request = {};
  Object.defineProperty(request, 'path', {
    get() {
      throw new Error('path denied');
    },
  });
  Object.defineProperty(request, 'requestId', {
    get() {
      throw new Error('request id denied');
    },
  });

  await renderDemoDetails(request, response);

  assert.equal(response.statusCode, 404);
  assert.equal(response.headers['Content-Type'], 'text/plain');
  assert.match(response.body, /Demo details not found/);
});

test('loadAndRenderDemos reuses cached catalog html when the source file is unchanged', async () => {
  const firstResponse = createResponse();
  const secondResponse = createResponse();

  await loadAndRenderDemos({ requestId: 'demos-cache-one' }, firstResponse);
  await loadAndRenderDemos({ requestId: 'demos-cache-two' }, secondResponse);

  assert.equal(secondResponse.statusCode, 200);
  assert.equal(secondResponse.body, firstResponse.body);
});

test('loadAndRenderDemos validates catalog shape before rendering', async () => {
  await withTempDemoFile(JSON.stringify([{ id: 'missing-required-fields' }]), async () => {
    const response = createResponse();

    await loadAndRenderDemos({ requestId: 'invalid-demos-unit' }, response);

    assert.equal(response.statusCode, 500);
    assert.equal(response.body, 'Error loading demos');
  });
});

test('loadAndRenderDemos rejects malformed catalog highlight lists', async () => {
  await withTempDemoFile(JSON.stringify([createDemo({ highlights: [] })]), async () => {
    const response = createResponse();

    await loadAndRenderDemos({ requestId: 'bad-highlights' }, response);

    assert.equal(response.statusCode, 500);
    assert.equal(response.body, 'Error loading demos');
  });
});

test('demo error responses tolerate failing response methods', async () => {
  await withTempDemoFile('{not json', async () => {
    const response = {
      headersSent: false,
      status() {
        throw new Error('status denied');
      },
      send() {
        throw new Error('send denied');
      },
    };

    await assert.doesNotReject(() => loadAndRenderDemos({ requestId: 'response-denied' }, response));
  });

  await withTempDemoFile(JSON.stringify([createDemo()]), async () => {
    const hostileStateResponse = {};
    Object.defineProperties(hostileStateResponse, {
      headersSent: {
        get() {
          throw new Error('headers denied');
        },
      },
      req: {
        get() {
          throw new Error('request denied');
        },
      },
    });
    const throwingMethodsResponse = {
      headersSent: false,
      status() {
        throw new Error('status denied');
      },
      type() {
        throw new Error('type denied');
      },
      send() {
        throw new Error('send denied');
      },
    };

    await assert.doesNotReject(() => renderDemoDetails({
      path: '/missing/details',
      requestId: 'missing-denied',
    }, hostileStateResponse));
    await assert.doesNotReject(() => renderDemoDetails({
      path: '/unit/details',
      requestId: 'success-denied',
    }, throwingMethodsResponse));
  });
});

test('loadAndRenderDemos trims and validates demo routes before rendering', async () => {
  await withTempDemoFile(JSON.stringify([createDemo({
    initDemoHref: ' /unit/init ',
    learnMoreHref: ' /unit/details ',
    title: ' Trimmed Unit Demo ',
  })]), async () => {
    const response = createResponse();

    await loadAndRenderDemos({ requestId: 'trimmed-demos-unit' }, response);

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Trimmed Unit Demo/);
    assert.match(response.body, /GET="\/unit\/init"/);
    assert.match(response.body, /href="\/unit\/details"/);
  });
});

test('loadAndRenderDemos rejects unsafe or duplicate configured routes', async () => {
  await withTempDemoFile(JSON.stringify([createDemo({
    initDemoHref: 'javascript:alert(1)',
  })]), async () => {
    const response = createResponse();

    await loadAndRenderDemos({ requestId: 'unsafe-demos-unit' }, response);

    assert.equal(response.statusCode, 500);
    assert.equal(response.body, 'Error loading demos');
  });

  await withTempDemoFile(JSON.stringify([
    createDemo({ id: 'one' }),
    createDemo({ id: 'two' }),
  ]), async () => {
    const response = createResponse();

    await loadAndRenderDemos({ requestId: 'duplicate-demos-unit' }, response);

    assert.equal(response.statusCode, 500);
    assert.equal(response.body, 'Error loading demos');
  });
});

test('renderDemoDetails uses the configured demo catalog file safely', async () => {
  await withTempDemoFile(JSON.stringify([createDemo()]), async () => {
    const response = createResponse();

    await renderDemoDetails({
      path: '/unit/details',
      requestId: 'configured-demos-unit',
    }, response);

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Unit Demo/);
    assert.match(response.body, /href="\/unit\/init"/);
  });
});
