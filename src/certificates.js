import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function generateLocalhostCertificate(keyPath, certPath) {
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  const configPath = path.join(path.dirname(keyPath), 'openssl.cnf');
  fs.writeFileSync(
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
  execFileSync(
    'openssl',
    [
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

export function getHttpsOptions(projectRoot) {
  const explicitKeyPath = process.env.TLS_KEY_PATH;
  const explicitCertPath = process.env.TLS_CERT_PATH;

  if (explicitKeyPath || explicitCertPath) {
    if (!explicitKeyPath || !explicitCertPath) {
      throw new Error('Both TLS_KEY_PATH and TLS_CERT_PATH must be set when using explicit TLS files.');
    }

    return {
      key: fs.readFileSync(path.resolve(explicitKeyPath)),
      cert: fs.readFileSync(path.resolve(explicitCertPath)),
      allowHTTP1: true
    };
  }

  const certDir = process.env.HTMLEX_CERT_DIR
    ? path.resolve(process.env.HTMLEX_CERT_DIR)
    : path.join(projectRoot, 'tmp', 'cert');
  const keyPath = path.join(certDir, 'localhost-key.pem');
  const certPath = path.join(certDir, 'localhost.pem');

  if (!fileExists(keyPath) || !fileExists(certPath)) {
    try {
      generateLocalhostCertificate(keyPath, certPath);
    } catch (error) {
      throw new Error(
        `Unable to generate a local HTTPS certificate with openssl. ` +
        `Install openssl or set TLS_KEY_PATH and TLS_CERT_PATH. Cause: ${error.message}`
      );
    }
  }

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
    allowHTTP1: true
  };
}
