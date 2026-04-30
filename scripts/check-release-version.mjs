import { readFile } from 'node:fs/promises';

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

function fail(message) {
  console.error(`Release version check failed: ${message}`);
  process.exit(1);
}

async function readJson(relativePath) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  return JSON.parse(source);
}

const packageJson = await readJson('package.json');
const packageLock = await readJson('package-lock.json');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
const version = packageJson.version;

if (typeof version !== 'string' || !SEMVER_PATTERN.test(version)) {
  fail(`package.json version must be valid semver. Found "${version}".`);
}

if (packageLock.version !== version) {
  fail(`package-lock.json version "${packageLock.version}" does not match package.json version "${version}".`);
}

if (packageLock.packages?.['']?.version !== version) {
  fail(`package-lock root package version "${packageLock.packages?.['']?.version}" does not match package.json version "${version}".`);
}

if (!readme.includes(`Version ${version} `)) {
  fail(`README.md must include the current package version "${version}".`);
}

const releaseTag = process.argv[2] || process.env.RELEASE_TAG || '';
const expectedTag = `v${version}`;

if (releaseTag && releaseTag !== expectedTag) {
  fail(`release tag "${releaseTag}" must match package version tag "${expectedTag}".`);
}

console.log(`Release version check passed. Expected tag: ${expectedTag}.`);
