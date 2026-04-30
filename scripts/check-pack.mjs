import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
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
  const options = {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  };
  const { stdout } = process.platform === 'win32'
    ? await execAsync('npm pack --dry-run --json', options)
    : await execFileAsync('npm', ['pack', '--dry-run', '--json'], options);
  return JSON.parse(stdout);
}

const failures = [];
const packResults = await readPackedMetadata();
const packResult = Array.isArray(packResults) ? packResults[0] : null;

requireField(failures, Array.isArray(packResults) && packResults.length === 1, 'npm pack must return one package result.');
requireField(failures, packResult?.name === 'htmlex', 'Packed package name must be htmlex.');
requireField(failures, packResult?.version === '1.2.3', 'Packed package version must match package.json.');
requireField(failures, packResult?.size <= MAX_PACKED_SIZE_BYTES, `Packed package must stay under ${MAX_PACKED_SIZE_BYTES} bytes.`);
requireField(
  failures,
  packResult?.unpackedSize <= MAX_UNPACKED_SIZE_BYTES,
  `Unpacked package must stay under ${MAX_UNPACKED_SIZE_BYTES} bytes.`
);
requireField(failures, Array.isArray(packResult?.bundled) && packResult.bundled.length === 0, 'Package must not bundle dependencies.');

const packedFiles = new Set((packResult?.files ?? []).map(file => file.path));
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
