import { getArray, getField, runNpmJson } from './check-utils.mjs';

const MAX_PACKED_SIZE_BYTES = 200 * 1024;
const MAX_UNPACKED_SIZE_BYTES = 1024 * 1024;
const REQUIRED_PACKED_FILES = [
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'COVERAGE.md',
  'LICENSE',
  'README.md',
  'package.json',
  'src/app.d.ts',
  'src/app.js',
  'src/components/HTMLeX.d.ts',
  'src/components/HTMLeX.js',
  'src/public/src/htmlex.d.ts',
  'src/public/src/htmlex.js'
];
const DISALLOWED_PACKED_PATHS = [
  /^\.github\//u,
  /^\.playwright\//u,
  /^coverage\//u,
  /^media\//u,
  /^node_modules\//u,
  /^playwright-report\//u,
  /^scripts\//u,
  /^src\/cert\//u,
  /^test-results\//u,
  /^tests\//u,
  /^tmp\//u,
  /^package-lock\.json$/u,
  /\.tgz$/u
];

function requireField(failures, condition, message) {
  if (!condition) failures.push(message);
}

async function readPackedMetadata() {
  return runNpmJson(
    ['pack', '--dry-run', '--json'],
    { maxBuffer: 10 * 1024 * 1024 },
    'npm pack dry run'
  );
}

const failures = [];
const packResults = await readPackedMetadata();
const packResult = getArray(packResults)[0] ?? null;
const bundled = getField(packResult, 'bundled');

requireField(failures, getArray(packResults).length === 1, 'npm pack must return one package result.');
requireField(failures, getField(packResult, 'name') === 'htmlex', 'Packed package name must be htmlex.');
requireField(failures, getField(packResult, 'version') === '1.2.3', 'Packed package version must match package.json.');
requireField(failures, getField(packResult, 'size') <= MAX_PACKED_SIZE_BYTES, `Packed package must stay under ${MAX_PACKED_SIZE_BYTES} bytes.`);
requireField(
  failures,
  getField(packResult, 'unpackedSize') <= MAX_UNPACKED_SIZE_BYTES,
  `Unpacked package must stay under ${MAX_UNPACKED_SIZE_BYTES} bytes.`
);
requireField(failures, Array.isArray(bundled) && bundled.length === 0, 'Package must not bundle dependencies.');

const packedFiles = new Set(
  getArray(getField(packResult, 'files'))
    .map(file => getField(file, 'path', ''))
    .filter(Boolean)
);
for (const requiredFile of REQUIRED_PACKED_FILES) {
  requireField(failures, packedFiles.has(requiredFile), `Packed package is missing required file: ${requiredFile}`);
}

for (const file of packedFiles) {
  for (const pattern of DISALLOWED_PACKED_PATHS) {
    requireField(failures, !pattern.test(file), `Packed package includes disallowed file: ${file}`);
  }
}

if (failures.length > 0) {
  console.error('Package dry-run check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Package dry-run check passed with ${packedFiles.size} files.`);
