import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach } from 'node:test';
import { getHttpsOptions } from '../../src/certificates.js';

process.env.HTMLEX_LOG_LEVEL = 'silent';

let originalKeyPath;
let originalCertPath;
let originalCertDir;
let tempDirs;

beforeEach(() => {
  originalKeyPath = process.env.TLS_KEY_PATH;
  originalCertPath = process.env.TLS_CERT_PATH;
  originalCertDir = process.env.HTMLEX_CERT_DIR;
  tempDirs = [];
});

afterEach(async () => {
  if (originalKeyPath === undefined) {
    delete process.env.TLS_KEY_PATH;
  } else {
    process.env.TLS_KEY_PATH = originalKeyPath;
  }

  if (originalCertPath === undefined) {
    delete process.env.TLS_CERT_PATH;
  } else {
    process.env.TLS_CERT_PATH = originalCertPath;
  }

  if (originalCertDir === undefined) {
    delete process.env.HTMLEX_CERT_DIR;
  } else {
    process.env.HTMLEX_CERT_DIR = originalCertDir;
  }

  for (const directory of tempDirs) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function createTempDir() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'htmlex-cert-test-'));
  tempDirs.push(directory);
  return directory;
}

test('getHttpsOptions reads explicit TLS key and certificate files', async () => {
  const directory = await createTempDir();
  const keyPath = path.join(directory, 'key.pem');
  const certPath = path.join(directory, 'cert.pem');
  await writeFile(keyPath, 'unit-test-key');
  await writeFile(certPath, 'unit-test-cert');
  process.env.TLS_KEY_PATH = keyPath;
  process.env.TLS_CERT_PATH = certPath;

  const options = await getHttpsOptions(directory);

  assert.equal(options.key.toString('utf8'), 'unit-test-key');
  assert.equal(options.cert.toString('utf8'), 'unit-test-cert');
  assert.equal(options.allowHTTP1, true);
});

test('getHttpsOptions rejects incomplete explicit TLS configuration', async () => {
  const directory = await createTempDir();
  const keyPath = path.join(directory, 'key.pem');
  await writeFile(keyPath, 'unit-test-key');
  process.env.TLS_KEY_PATH = keyPath;
  delete process.env.TLS_CERT_PATH;

  await assert.rejects(
    () => getHttpsOptions(directory),
    /Both TLS_KEY_PATH and TLS_CERT_PATH/
  );
});

test('getHttpsOptions reads existing generated localhost certificate files', async () => {
  const directory = await createTempDir();
  await writeFile(path.join(directory, 'localhost-key.pem'), 'generated-key');
  await writeFile(path.join(directory, 'localhost.pem'), 'generated-cert');
  delete process.env.TLS_KEY_PATH;
  delete process.env.TLS_CERT_PATH;
  process.env.HTMLEX_CERT_DIR = directory;

  const options = await getHttpsOptions(path.dirname(directory));

  assert.equal(options.key.toString('utf8'), 'generated-key');
  assert.equal(options.cert.toString('utf8'), 'generated-cert');
  assert.equal(options.allowHTTP1, true);
});
