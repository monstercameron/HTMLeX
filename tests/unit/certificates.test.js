import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach } from 'node:test';
import { getHttpsOptions } from '../../src/certificates.js';

process.env.HTMLEX_LOG_LEVEL = 'silent';

let originalKeyPath;
let originalCertPath;
let originalCertDir;
let originalOpenSSLArgv;
let originalOpenSSLBin;
let tempDirs;

beforeEach(() => {
  originalKeyPath = process.env.TLS_KEY_PATH;
  originalCertPath = process.env.TLS_CERT_PATH;
  originalCertDir = process.env.HTMLEX_CERT_DIR;
  originalOpenSSLArgv = process.env.HTMLEX_OPENSSL_ARGV;
  originalOpenSSLBin = process.env.HTMLEX_OPENSSL_BIN;
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

  if (originalOpenSSLArgv === undefined) {
    delete process.env.HTMLEX_OPENSSL_ARGV;
  } else {
    process.env.HTMLEX_OPENSSL_ARGV = originalOpenSSLArgv;
  }

  if (originalOpenSSLBin === undefined) {
    delete process.env.HTMLEX_OPENSSL_BIN;
  } else {
    process.env.HTMLEX_OPENSSL_BIN = originalOpenSSLBin;
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

async function writeFakeOpenSSL(directory) {
  const fakeOpenSSLModule = path.join(directory, 'openssl.mjs');
  await writeFile(fakeOpenSSLModule, [
    "import { writeFile } from 'node:fs/promises';",
    'const args = process.argv.slice(2);',
    "const keyPath = args[args.indexOf('-keyout') + 1];",
    "const certPath = args[args.indexOf('-out') + 1];",
    "if (!keyPath || !certPath) process.exit(2);",
    "await writeFile(keyPath, 'fake-generated-key');",
    "await writeFile(certPath, 'fake-generated-cert');",
    ''
  ].join('\n'));
  return fakeOpenSSLModule;
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

test('getHttpsOptions generates localhost certificate files when missing', async () => {
  const directory = await createTempDir();
  const certDir = path.join(directory, 'certs');
  const fakeOpenSSLModule = await writeFakeOpenSSL(directory);
  delete process.env.TLS_KEY_PATH;
  delete process.env.TLS_CERT_PATH;
  process.env.HTMLEX_CERT_DIR = certDir;
  process.env.HTMLEX_OPENSSL_BIN = process.execPath;
  process.env.HTMLEX_OPENSSL_ARGV = JSON.stringify([fakeOpenSSLModule]);

  const options = await getHttpsOptions(directory);
  const openSSLConfig = await readFile(path.join(certDir, 'openssl.cnf'), 'utf8');

  assert.equal(options.key.toString('utf8'), 'fake-generated-key');
  assert.equal(options.cert.toString('utf8'), 'fake-generated-cert');
  assert.equal(options.allowHTTP1, true);
  assert.match(openSSLConfig, /CN = localhost/);
});

test('getHttpsOptions rejects invalid OpenSSL argument override configuration', async () => {
  const directory = await createTempDir();
  delete process.env.TLS_KEY_PATH;
  delete process.env.TLS_CERT_PATH;
  process.env.HTMLEX_CERT_DIR = path.join(directory, 'certs');
  process.env.HTMLEX_OPENSSL_BIN = process.execPath;
  process.env.HTMLEX_OPENSSL_ARGV = '{"not":"an array"}';

  await assert.rejects(
    () => getHttpsOptions(directory),
    /HTMLEX_OPENSSL_ARGV must be a JSON array of strings/
  );
});
