import { readFile } from 'node:fs/promises';
import { getField, readJsonFile, safeString } from './check-utils.mjs';

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

function fail(message) {
  console.error(`Release version check failed: ${message}`);
  process.exit(1);
}

const packageJson = await readJsonFile(new URL('../package.json', import.meta.url), 'package.json');
const packageLock = await readJsonFile(new URL('../package-lock.json', import.meta.url), 'package-lock.json');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
const version = getField(packageJson, 'version');
const lockVersion = getField(packageLock, 'version');
const lockRootVersion = getField(getField(getField(packageLock, 'packages'), ''), 'version');

if (typeof version !== 'string' || !SEMVER_PATTERN.test(version)) {
  fail(`package.json version must be valid semver. Found "${version}".`);
}

if (lockVersion !== version) {
  fail(`package-lock.json version "${lockVersion}" does not match package.json version "${version}".`);
}

if (lockRootVersion !== version) {
  fail(`package-lock root package version "${lockRootVersion}" does not match package.json version "${version}".`);
}

if (!readme.includes(`Version ${version} `)) {
  fail(`README.md must include the current package version "${version}".`);
}

const releaseTag = safeString(getField(process.argv, 2) || process.env.RELEASE_TAG).trim();
const expectedTag = `v${version}`;

if (releaseTag && releaseTag !== expectedTag) {
  fail(`release tag "${releaseTag}" must match package version tag "${expectedTag}".`);
}

console.log(`Release version check passed. Expected tag: ${expectedTag}.`);
