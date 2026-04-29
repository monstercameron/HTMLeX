import assert from 'node:assert/strict';
import https from 'node:https';
import { after, before, test } from 'node:test';

let server;
let port;

function get(pathname, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'localhost',
        port,
        path: pathname,
        method: 'GET',
        rejectUnauthorized: false,
        timeout
      },
      (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );

    req.on('timeout', () => req.destroy(new Error(`Timed out waiting for ${pathname}`)));
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  process.env.HTMLEX_TEST_FAST = '1';
  const appModule = await import('../../src/app.js');
  server = await appModule.startServer(0);
  port = server.address().port;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

test('loadMoreItems writes loading and final fragments then closes', async () => {
  const response = await get('/items/loadMore');

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Loading more items/);
  assert.match(response.body, /Item \d+/);
});

test('demoLoading writes loading and final fragments then closes', async () => {
  const response = await get('/demo/loading');

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Loading, wait 5000ms/);
  assert.match(response.body, /Payload received after 5000ms/);
});
