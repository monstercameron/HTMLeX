import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const ROOT = process.cwd();
const execFileAsync = promisify(execFile);
const MAX_TRACKED_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const NODE_ENGINE_RANGE = '^20.19.0 || ^22.13.0 || >=24';
const REQUIRED_FILES = [
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'COVERAGE.md',
  'LICENSE',
  'README.md'
];
const REQUIRED_REPOSITORY_FILES = [
  '.github/workflows/quality.yml',
  '.github/workflows/release.yml',
  '.node-version',
  '.npmrc',
  ...REQUIRED_FILES
];
const REQUIRED_EXPORTS = {
  '.': {
    types: './src/public/src/htmlex.d.ts',
    import: './src/public/src/htmlex.js'
  },
  './app': {
    types: './src/app.d.ts',
    import: './src/app.js'
  },
  './render': {
    types: './src/components/HTMLeX.d.ts',
    import: './src/components/HTMLeX.js'
  }
};
const REQUIRED_KEYWORDS = ['htmlex', 'hateoas', 'html', 'server-driven-ui', 'web-components'];
const DISALLOWED_TODO_SEED_PATTERNS = [
  /^\d+$/u,
  /^test\b/iu,
  /\bplaceholder\b/iu,
  /\btodo\s*\d+\b/iu
];

async function readJson(relativePath) {
  const source = await readFile(path.join(ROOT, relativePath), 'utf8');
  return JSON.parse(source);
}

async function exists(relativePath) {
  try {
    await stat(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireField(failures, condition, message) {
  if (!condition) failures.push(message);
}

function requireArrayValues(failures, actualValues, requiredValues, fieldName) {
  requireField(failures, Array.isArray(actualValues), `${fieldName} must be an array.`);
  if (!Array.isArray(actualValues)) return;

  for (const value of requiredValues) {
    requireField(failures, actualValues.includes(value), `${fieldName} is missing "${value}".`);
  }
}

async function checkNoPackedTarballs(failures) {
  const entries = await readdir(ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.tgz')) {
      failures.push(`Generated package tarball should not be left in the repository root: ${entry.name}`);
    }
  }
}

async function checkNoOversizedTrackedFiles(failures) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync('git', ['ls-files', '-z'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    }));
  } catch {
    return;
  }

  const trackedFiles = stdout.split('\0').filter(Boolean);
  for (const file of trackedFiles) {
    const filePath = path.join(ROOT, file);
    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      continue;
    }
    if (!fileStat.isFile() || fileStat.size <= MAX_TRACKED_FILE_SIZE_BYTES) continue;

    const sizeMiB = (fileStat.size / 1024 / 1024).toFixed(1);
    failures.push(
      `Tracked file is too large for the source repository: ${file} (${sizeMiB} MiB). ` +
      'Store generated media and binary artifacts outside the repo.'
    );
  }
}

async function checkRequiredFiles(failures) {
  for (const file of REQUIRED_REPOSITORY_FILES) {
    requireField(failures, await exists(file), `Missing required repository document: ${file}`);
  }
}

async function checkPackageFileTargets(failures, packageJson) {
  if (!Array.isArray(packageJson.files)) return;

  for (const fileTarget of packageJson.files) {
    requireField(
      failures,
      await exists(fileTarget),
      `Package files entry does not exist: ${fileTarget}`
    );
  }
}

async function checkSeedData(failures) {
  const seedTodos = await readJson('src/persistence/data.json');
  requireField(failures, Array.isArray(seedTodos), 'Todo seed data must be an array.');
  if (!Array.isArray(seedTodos)) return;

  requireField(failures, seedTodos.length > 0, 'Todo seed data must include at least one useful demo item.');
  const seenIds = new Set();
  for (const [index, todo] of seedTodos.entries()) {
    requireField(
      failures,
      Number.isSafeInteger(todo?.id) && todo.id > 0,
      `Todo seed item ${index + 1} must have a positive integer id.`
    );
    requireField(
      failures,
      !seenIds.has(todo?.id),
      `Todo seed item ${index + 1} duplicates id ${todo?.id}.`
    );
    seenIds.add(todo?.id);

    const text = String(todo?.text ?? '').trim();
    requireField(failures, text.length >= 10, `Todo seed item ${index + 1} needs descriptive text.`);
    for (const pattern of DISALLOWED_TODO_SEED_PATTERNS) {
      requireField(failures, !pattern.test(text), `Todo seed item ${index + 1} looks like leftover test data: "${text}".`);
    }
  }
}

async function checkDemoCatalog(failures) {
  const demos = await readJson('src/persistence/demos.json');
  requireField(failures, Array.isArray(demos), 'Demo catalog must be an array.');
  if (!Array.isArray(demos)) return;

  const seenIds = new Set();
  for (const [index, demo] of demos.entries()) {
    const label = `Demo catalog item ${index + 1}`;
    requireField(failures, hasValue(demo?.id), `${label} must have an id.`);
    requireField(failures, !seenIds.has(demo?.id), `${label} duplicates id "${demo?.id}".`);
    seenIds.add(demo?.id);

    requireField(failures, hasValue(demo?.title), `${label} must have a title.`);
    requireField(failures, hasValue(demo?.description), `${label} must have a description.`);
    requireField(failures, hasValue(demo?.initDemoHref), `${label} must have an initDemoHref.`);
    requireField(failures, hasValue(demo?.learnMoreHref), `${label} must have a learnMoreHref.`);
    requireField(
      failures,
      /^\/[A-Za-z][\w-]*\/details$/u.test(String(demo?.learnMoreHref ?? '')),
      `${label} has an invalid learnMoreHref: "${demo?.learnMoreHref}".`
    );
    requireField(
      failures,
      !Object.hasOwn(demo ?? {}, 'gradients'),
      `${label} contains stale Tailwind-era gradients metadata.`
    );
  }
}

function checkPackageMetadata(failures, packageJson) {
  requireField(failures, packageJson.name === 'htmlex', 'Package name must stay "htmlex".');
  requireField(failures, hasValue(packageJson.version), 'Package version is required.');
  requireField(failures, hasValue(packageJson.description), 'Package description is required.');
  requireField(failures, hasValue(packageJson.author), 'Package author must not be empty.');
  requireField(failures, packageJson.license === 'ISC', 'Package license must be ISC.');
  requireField(failures, packageJson.type === 'module', 'Package type must remain module.');
  requireField(failures, packageJson.main === 'src/public/src/htmlex.js', 'Package main must point to the browser runtime entry.');
  requireField(failures, packageJson.types === 'src/public/src/htmlex.d.ts', 'Package types must point to browser runtime declarations.');
  requireField(failures, hasValue(packageJson.repository?.url), 'Package repository URL is required.');
  requireField(failures, hasValue(packageJson.bugs?.url), 'Package bugs URL is required.');
  requireField(failures, hasValue(packageJson.homepage), 'Package homepage is required.');
  requireField(
    failures,
    packageJson.engines?.node === NODE_ENGINE_RANGE,
    'Node engine range must stay aligned with the repository toolchain.'
  );
  requireField(
    failures,
    documents.nodeVersion.trim() === '20.19.0',
    '.node-version must match the minimum supported Node 20 toolchain.'
  );
  requireField(
    failures,
    documents.npmrc.trim().split(/\r?\n/u).includes('engine-strict=true'),
    '.npmrc must enforce engine-strict installs.'
  );
  requireField(
    failures,
    packageJson.scripts?.['check:audit'] === 'npm audit --omit=dev --audit-level=moderate',
    'Production dependency audit must check moderate-or-higher advisories.'
  );
  requireField(
    failures,
    packageJson.scripts?.['check:text'] === 'node scripts/check-text.mjs',
    'Text hygiene check must be exposed as npm run check:text.'
  );
  requireField(
    failures,
    packageJson.scripts?.quality?.includes('npm run check:text'),
    'Quality gate must include the text hygiene check.'
  );
  requireField(
    failures,
    packageJson.scripts?.['check:lockfile'] === 'npm ci --ignore-scripts --dry-run',
    'Lockfile reproducibility check must be exposed as npm run check:lockfile.'
  );
  requireField(
    failures,
    packageJson.scripts?.quality?.includes('npm run check:lockfile'),
    'Quality gate must include the lockfile reproducibility check.'
  );
  requireField(
    failures,
    packageJson.scripts?.['check:release-version'] === 'node scripts/check-release-version.mjs',
    'Release version check must be exposed as npm run check:release-version.'
  );
  requireField(
    failures,
    packageJson.scripts?.quality?.includes('npm run check:release-version'),
    'Quality gate must include the release version check.'
  );
  requireField(
    failures,
    packageJson.scripts?.['check:deps'] === 'node scripts/check-deps.mjs',
    'Dependency tree check must be exposed as npm run check:deps.'
  );
  requireField(
    failures,
    packageJson.scripts?.quality?.includes('npm run check:deps'),
    'Quality gate must include the dependency tree check.'
  );
  requireField(
    failures,
    packageJson.scripts?.['check:licenses'] === 'node scripts/check-licenses.mjs',
    'License policy check must be exposed as npm run check:licenses.'
  );
  requireField(
    failures,
    packageJson.scripts?.quality?.includes('npm run check:licenses'),
    'Quality gate must include the license policy check.'
  );
  requireField(
    failures,
    packageJson.scripts?.['check:pack'] === 'node scripts/check-pack.mjs',
    'Package dry-run check must be exposed as npm run check:pack.'
  );
  requireField(
    failures,
    packageJson.scripts?.quality?.includes('npm run check:pack'),
    'Quality gate must include the package dry-run check.'
  );
  requireField(
    failures,
    packageJson.scripts?.['check:publint'] === 'publint',
    'Package lint check must be exposed as npm run check:publint.'
  );
  requireField(
    failures,
    packageJson.scripts?.quality?.includes('npm run check:publint'),
    'Quality gate must include publint package validation.'
  );
  requireField(
    failures,
    packageJson.scripts?.['check:types'] === 'attw --pack . --profile esm-only',
    'Package type-resolution check must be exposed as npm run check:types.'
  );
  requireField(
    failures,
    packageJson.scripts?.quality?.includes('npm run check:types'),
    'Quality gate must include package type-resolution validation.'
  );
  requireField(
    failures,
    hasValue(packageJson.devDependencies?.publint),
    'publint must be installed as a dev dependency.'
  );
  requireField(
    failures,
    hasValue(packageJson.devDependencies?.['@arethetypeswrong/cli']),
    '@arethetypeswrong/cli must be installed as a dev dependency.'
  );
  requireArrayValues(failures, packageJson.keywords, REQUIRED_KEYWORDS, 'keywords');
  requireArrayValues(failures, packageJson.files, ['src/', ...REQUIRED_FILES], 'files');
}

async function checkPackageExports(failures, packageJson) {
  const requireExistingTarget = async (target, label) => {
    if (!hasValue(target)) return;
    const relativeTarget = target.replace(/^\.\//u, '');
    requireField(failures, await exists(relativeTarget), `${label} points to a missing file: ${target}`);
  };

  await requireExistingTarget(packageJson.main, 'Package main');
  await requireExistingTarget(packageJson.types, 'Package types');

  for (const [entryPoint, expected] of Object.entries(REQUIRED_EXPORTS)) {
    const actual = packageJson.exports?.[entryPoint];
    requireField(failures, actual?.types === expected.types, `${entryPoint} export has an incorrect types target.`);
    requireField(failures, actual?.import === expected.import, `${entryPoint} export has an incorrect import target.`);
    requireField(failures, actual?.require === null, `${entryPoint} export must block CommonJS require resolution.`);
    await requireExistingTarget(actual?.types, `${entryPoint} export types`);
    await requireExistingTarget(actual?.import, `${entryPoint} export import`);
  }

  requireField(
    failures,
    packageJson.typesVersions?.['*']?.app?.includes('src/app.d.ts'),
    'typesVersions must map htmlex/app to src/app.d.ts.'
  );
  requireField(
    failures,
    packageJson.typesVersions?.['*']?.render?.includes('src/components/HTMLeX.d.ts'),
    'typesVersions must map htmlex/render to src/components/HTMLeX.d.ts.'
  );

  for (const target of packageJson.typesVersions?.['*']?.app ?? []) {
    await requireExistingTarget(target, 'typesVersions app target');
  }
  for (const target of packageJson.typesVersions?.['*']?.render ?? []) {
    await requireExistingTarget(target, 'typesVersions render target');
  }
}

function checkDocumentationText(failures, documents) {
  requireField(failures, documents.license.startsWith('ISC License'), 'LICENSE must contain the ISC license text.');
  requireField(failures, documents.readme.includes('[CONTRIBUTING.md](CONTRIBUTING.md)'), 'README must link to CONTRIBUTING.md.');
  requireField(failures, documents.readme.includes('[ISC License](LICENSE)'), 'README must link to the ISC license.');
  requireField(failures, !documents.readme.includes('MIT License'), 'README must not advertise a mismatched MIT license.');
}

function checkWorkflowText(failures, documents) {
  requireField(
    failures,
    documents.qualityWorkflow.includes('permissions:\n  contents: read'),
    'Quality workflow must use read-only repository permissions.'
  );
  requireField(
    failures,
    documents.qualityWorkflow.includes('timeout-minutes: 15'),
    'Quality workflow must keep an explicit timeout.'
  );
  for (const nodeVersion of ['20.19.0', '22', '24']) {
    requireField(
      failures,
      documents.qualityWorkflow.includes(`- ${nodeVersion}`),
      `Quality workflow must test Node ${nodeVersion}.`
    );
  }
  requireField(
    failures,
    documents.qualityWorkflow.includes('actions/upload-artifact@v4'),
    'Quality workflow must upload the built package artifact.'
  );
  requireField(
    failures,
    documents.releaseWorkflow.includes('permissions:\n  contents: write'),
    'Release workflow must be allowed to create GitHub releases.'
  );
  requireField(
    failures,
    documents.releaseWorkflow.includes("tags:\n      - 'v*.*.*'"),
    'Release workflow must run for version tags.'
  );
  requireField(
    failures,
    documents.releaseWorkflow.includes('node scripts/check-release-version.mjs "$RELEASE_TAG"'),
    'Release workflow must validate the tag against package metadata.'
  );
  requireField(
    failures,
    documents.releaseWorkflow.includes('npm run quality'),
    'Release workflow must run the full quality gate before publishing a release.'
  );
  requireField(
    failures,
    documents.releaseWorkflow.includes('gh release create'),
    'Release workflow must create GitHub releases.'
  );
}

const failures = [];
const packageJson = await readJson('package.json');
const documents = {
  qualityWorkflow: await readFile(path.join(ROOT, '.github/workflows/quality.yml'), 'utf8'),
  releaseWorkflow: await readFile(path.join(ROOT, '.github/workflows/release.yml'), 'utf8'),
  nodeVersion: await readFile(path.join(ROOT, '.node-version'), 'utf8'),
  npmrc: await readFile(path.join(ROOT, '.npmrc'), 'utf8'),
  license: await readFile(path.join(ROOT, 'LICENSE'), 'utf8'),
  readme: await readFile(path.join(ROOT, 'README.md'), 'utf8')
};

await checkRequiredFiles(failures);
await checkNoPackedTarballs(failures);
await checkNoOversizedTrackedFiles(failures);
await checkPackageFileTargets(failures, packageJson);
await checkSeedData(failures);
await checkDemoCatalog(failures);
checkPackageMetadata(failures, packageJson);
await checkPackageExports(failures, packageJson);
checkDocumentationText(failures, documents);
checkWorkflowText(failures, documents);

if (failures.length > 0) {
  console.error('Package metadata check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Package metadata check passed.');
