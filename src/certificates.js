import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { logFeatureError, logFeatureWarning } from './serverLogger.js';

const execFileAsync = promisify(execFile);
const DEFAULT_OPENSSL_COMMAND = 'openssl';
const DEFAULT_CERT_PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const LOCALHOST_KEY_FILE = 'localhost-key.pem';
const LOCALHOST_CERT_FILE = 'localhost.pem';

function safeString(value, fallback = '') {
  try {
    return String(value ?? fallback);
  } catch {
    return fallback;
  }
}

function getEnvironmentValue(name) {
  try {
    return safeString(process.env[name]).trim();
  } catch {
    return '';
  }
}

function getErrorMessage(error) {
  return safeString(error?.message || error, 'Unknown error');
}

function resolvePath(inputPath, description) {
  const normalizedPath = safeString(inputPath).trim();
  if (!normalizedPath) {
    throw new TypeError(`Invalid ${description} path.`);
  }
  if (normalizedPath.includes('\0')) {
    throw new TypeError(`Invalid ${description} path: path contains a null byte.`);
  }

  try {
    return path.resolve(normalizedPath);
  } catch (error) {
    throw new TypeError(`Invalid ${description} path: ${getErrorMessage(error)}`, { cause: error });
  }
}

function joinPath(parentPath, ...segments) {
  try {
    return path.join(parentPath, ...segments);
  } catch {
    return path.join(DEFAULT_CERT_PROJECT_ROOT, ...segments);
  }
}

function getOpenSSLInvocation() {
  const command = getEnvironmentValue('HTMLEX_OPENSSL_BIN') || DEFAULT_OPENSSL_COMMAND;
  const rawPrefixArgs = getEnvironmentValue('HTMLEX_OPENSSL_ARGV');
  if (!rawPrefixArgs) {
    return { command, prefixArgs: [] };
  }

  let prefixArgs;
  try {
    prefixArgs = JSON.parse(rawPrefixArgs);
  } catch (error) {
    throw new Error('HTMLEX_OPENSSL_ARGV must be a JSON array of strings.', { cause: error });
  }

  if (!Array.isArray(prefixArgs) || prefixArgs.some(arg => typeof arg !== 'string' || arg.trim().length === 0)) {
    throw new TypeError('HTMLEX_OPENSSL_ARGV must be a JSON array of strings.');
  }

  return { command, prefixArgs };
}

async function fileExists(filePath) {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function generateLocalhostCertificate(keyPath, certPath) {
  const certDir = path.dirname(keyPath);
  await mkdir(certDir, { recursive: true });
  const configPath = path.join(certDir, 'openssl.cnf');
  const { command, prefixArgs } = getOpenSSLInvocation();
  await writeFile(
    configPath,
    [
      '[req]',
      'distinguished_name = dn',
      'prompt = no',
      '',
      '[dn]',
      'CN = localhost',
      ''
    ].join('\n')
  );
  await execFileAsync(
    command,
    [
      ...prefixArgs,
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-days',
      '365',
      '-config',
      configPath,
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
      '-keyout',
      keyPath,
      '-out',
      certPath
    ],
    { stdio: 'ignore' }
  );

  if (!await fileExists(keyPath) || !await fileExists(certPath)) {
    throw new Error('OpenSSL completed without producing both certificate files.');
  }
}

async function readCertificatePair(keyPath, certPath, description) {
  try {
    return {
      key: await readFile(keyPath),
      cert: await readFile(certPath),
      allowHTTP1: true
    };
  } catch (error) {
    throw new Error(`Unable to read ${description} TLS certificate files: ${getErrorMessage(error)}`, {
      cause: error
    });
  }
}

export async function getHttpsOptions(projectRoot) {
  const explicitKeyPath = getEnvironmentValue('TLS_KEY_PATH');
  const explicitCertPath = getEnvironmentValue('TLS_CERT_PATH');

  if (explicitKeyPath || explicitCertPath) {
    if (!explicitKeyPath || !explicitCertPath) {
      logFeatureError('certificates', 'Incomplete explicit TLS configuration.', null, {
        hasKeyPath: Boolean(explicitKeyPath),
        hasCertPath: Boolean(explicitCertPath),
      });
      throw new Error('Both TLS_KEY_PATH and TLS_CERT_PATH must be set when using explicit TLS files.');
    }

    return readCertificatePair(
      resolvePath(explicitKeyPath, 'TLS key'),
      resolvePath(explicitCertPath, 'TLS certificate'),
      'explicit'
    );
  }

  const configuredCertDir = getEnvironmentValue('HTMLEX_CERT_DIR');
  const certDir = configuredCertDir
    ? resolvePath(configuredCertDir, 'generated TLS certificate directory')
    : joinPath(projectRoot || DEFAULT_CERT_PROJECT_ROOT, 'tmp', 'cert');
  const keyPath = path.join(certDir, LOCALHOST_KEY_FILE);
  const certPath = path.join(certDir, LOCALHOST_CERT_FILE);

  if (!await fileExists(keyPath) || !await fileExists(certPath)) {
    try {
      logFeatureWarning('certificates', 'Local HTTPS certificate is missing. Generating a localhost certificate.', {
        certDir,
      });
      await generateLocalhostCertificate(keyPath, certPath);
    } catch (error) {
      logFeatureError('certificates', 'Failed to generate local HTTPS certificate.', error, { certDir });
      throw new Error(
        `Unable to generate a local HTTPS certificate with openssl. ` +
        `Install openssl or set TLS_KEY_PATH and TLS_CERT_PATH. Cause: ${getErrorMessage(error)}`,
        { cause: error }
      );
    }
  }

  return readCertificatePair(keyPath, certPath, 'generated localhost');
}
