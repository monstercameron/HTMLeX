import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const ALLOWED_LICENSES = new Set([
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'ISC',
  'MIT'
]);
const FORBIDDEN_LICENSE_PATTERN = /\b(?:AGPL|GPL|LGPL|SSPL)\b/iu;
const LICENSE_OVERRIDES = {
  '@andrewbranch/untar.js': {
    license: 'MIT',
    reason: 'package-lock omits license metadata; package tarball includes MIT LICENSE'
  },
  busboy: {
    license: 'MIT',
    reason: 'package-lock omits legacy licenses array; package metadata and LICENSE are MIT'
  },
  streamsearch: {
    license: 'MIT',
    reason: 'package-lock omits legacy licenses array; package metadata and LICENSE are MIT'
  }
};

function packageNameFromLockPath(lockPath) {
  const withoutPrefix = lockPath.replace(/^node_modules\//u, '');
  if (!withoutPrefix.startsWith('@')) return withoutPrefix.split('/')[0];

  const [scope, name] = withoutPrefix.split('/');
  return `${scope}/${name}`;
}

function normalizeLicenseExpression(license) {
  return String(license ?? '')
    .replace(/[()]/gu, ' ')
    .split(/\s+(?:OR|AND)\s+/iu)
    .map(part => part.trim())
    .filter(Boolean);
}

const packageLock = JSON.parse(await readFile(path.join(ROOT, 'package-lock.json'), 'utf8'));
const failures = [];
const seenOverrides = new Set();

for (const [lockPath, packageMetadata] of Object.entries(packageLock.packages ?? {})) {
  if (!lockPath.startsWith('node_modules/')) continue;

  const packageName = packageNameFromLockPath(lockPath);
  const override = LICENSE_OVERRIDES[packageName];
  const license = packageMetadata.license ?? override?.license ?? '';
  if (override) seenOverrides.add(packageName);

  if (!license) {
    failures.push(`${packageName} is missing license metadata.`);
    continue;
  }

  if (FORBIDDEN_LICENSE_PATTERN.test(license)) {
    failures.push(`${packageName} uses a forbidden license expression: ${license}`);
    continue;
  }

  const licenseParts = normalizeLicenseExpression(license);
  const unknownParts = licenseParts.filter(part => !ALLOWED_LICENSES.has(part));
  if (unknownParts.length > 0) {
    failures.push(`${packageName} uses an unreviewed license expression: ${license}`);
  }
}

for (const packageName of Object.keys(LICENSE_OVERRIDES)) {
  if (!seenOverrides.has(packageName)) {
    failures.push(`License override is stale and should be removed: ${packageName}`);
  }
}

if (failures.length > 0) {
  console.error('License policy check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('License policy check passed.');
