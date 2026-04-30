import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { logFeatureError, logFeatureWarning } from './serverLogger.js';

const execFileAsync = promisify(execFile);

function getOpenSSLInvocation() {
  const command = process.env.HTMLEX_OPENSSL_BIN || 'openssl';
  const rawPrefixArgs = process.env.HTMLEX_OPENSSL_ARGV;
  if (!rawPrefixArgs) {
    return { command, prefixArgs: [] };
  }

  let prefixArgs;
  try {
    prefixArgs = JSON.parse(rawPrefixArgs);
  } catch (error) {
    throw new Error('HTMLEX_OPENSSL_ARGV must be a JSON array of strings.', { cause: error });
  }

  if (!Array.isArray(prefixArgs) || prefixArgs.some(arg => typeof arg !== 'string')) {
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
  await mkdir(path.dirname(keyPath), { recursive: true });
  const configPath = path.join(path.dirname(keyPath), 'openssl.cnf');
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
}

export async function getHttpsOptions(projectRoot) {
  const explicitKeyPath = process.env.TLS_KEY_PATH;
  const explicitCertPath = process.env.TLS_CERT_PATH;

  if (explicitKeyPath || explicitCertPath) {
    if (!explicitKeyPath || !explicitCertPath) {
      logFeatureError('certificates', 'Incomplete explicit TLS configuration.', null, {
        hasKeyPath: Boolean(explicitKeyPath),
        hasCertPath: Boolean(explicitCertPath),
      });
      throw new Error('Both TLS_KEY_PATH and TLS_CERT_PATH must be set when using explicit TLS files.');
    }

    return {
      key: await readFile(path.resolve(explicitKeyPath)),
      cert: await readFile(path.resolve(explicitCertPath)),
      allowHTTP1: true
    };
  }

  const certDir = process.env.HTMLEX_CERT_DIR
    ? path.resolve(process.env.HTMLEX_CERT_DIR)
    : path.join(projectRoot, 'tmp', 'cert');
  const keyPath = path.join(certDir, 'localhost-key.pem');
  const certPath = path.join(certDir, 'localhost.pem');

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
        `Install openssl or set TLS_KEY_PATH and TLS_CERT_PATH. Cause: ${error.message}`,
        { cause: error }
      );
    }
  }

  return {
    key: await readFile(keyPath),
    cert: await readFile(certPath),
    allowHTTP1: true
  };
}
