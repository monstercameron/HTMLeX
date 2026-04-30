import {
  collectMatchingFiles,
  DEFAULT_IGNORED_DIRS,
  getRelativePath,
  readFileWithContext,
} from './check-utils.mjs';

const ROOT = process.cwd();
const CHECK_DIRS = ['.'];
const JAVASCRIPT_EXTENSIONS = new Set(['.cjs', '.js', '.mjs']);
const BARE_NODE_BUILTINS = [
  'assert',
  'buffer',
  'child_process',
  'crypto',
  'events',
  'fs',
  'fs/promises',
  'http',
  'https',
  'net',
  'os',
  'path',
  'process',
  'stream',
  'stream/promises',
  'timers',
  'timers/promises',
  'url',
  'util',
  'zlib'
].join('|').replaceAll('/', '\\/');
const SYNC_API_PATTERN = [
  'readFile',
  'writeFile',
  'execFile',
  'spawn',
  'access',
  'mkdir',
  'readdir',
  'stat'
].map(name => `${name}Sync`).join('|');
const PROMISE_STATIC_SETTLERS = ['resolve', 'reject'].join('|');

const LEGACY_PATTERNS = [
  {
    label: 'CommonJS module syntax',
    pattern: /\brequire\s*\(|\bmodule\.exports\b|\bexports\./,
    message: 'Use native ES modules instead of CommonJS.'
  },
  {
    label: 'legacy ESM path shim',
    pattern: /\bfileURLToPath\b|\b__dirname\b|\b__filename\b/,
    message: 'Use import.meta.dirname and import.meta.filename.'
  },
  {
    label: 'synchronous Node filesystem/process API',
    pattern: new RegExp(`\\b(?:${SYNC_API_PATTERN})\\b`, 'u'),
    message: 'Use async Node APIs in runtime/tooling code.'
  },
  {
    label: 'bare Node builtin import',
    pattern: new RegExp(`\\bfrom\\s+['"](?:${BARE_NODE_BUILTINS})['"]|\\bimport\\s*\\(\\s*['"](?:${BARE_NODE_BUILTINS})['"]\\s*\\)|^\\s*import\\s+['"](?:${BARE_NODE_BUILTINS})['"]`, 'u'),
    message: 'Use explicit node: specifiers for Node builtins.'
  },
  {
    label: 'raw parseInt',
    pattern: /(^|[^.\w$])parseInt\s*\(/,
    message: 'Use Number.parseInt for explicit namespaced parsing.'
  },
  {
    label: 'manual promise settlement helper',
    pattern: new RegExp(`\\bPromise\\.(?:${PROMISE_STATIC_SETTLERS})\\s*\\(`, 'u'),
    message: 'Use async functions and direct returns/throws instead of Promise.resolve or Promise.reject.'
  },
  {
    label: 'legacy variable declaration',
    pattern: /\bvar\s+[A-Za-z_$]/,
    message: 'Use const or let instead of var.'
  }
];

const NON_BROWSER_LEGACY_PATTERNS = [
  {
    label: 'promise-wrapped timer delay',
    pattern: /new Promise\s*\(\s*resolve\s*=>\s*setTimeout\s*\(\s*resolve\s*,/,
    message: 'Use node:timers/promises for Node-side delays.'
  }
];

function isBrowserRuntimeFile(file) {
  return getRelativePath(ROOT, file).startsWith('src/public/');
}

function findLegacyPatterns(file, source) {
  const patterns = isBrowserRuntimeFile(file)
    ? LEGACY_PATTERNS
    : [...LEGACY_PATTERNS, ...NON_BROWSER_LEGACY_PATTERNS];
  const lines = source.split(/\r?\n/);
  const failures = [];

  lines.forEach((line, index) => {
    for (const { label, pattern, message } of patterns) {
      if (pattern.test(line)) {
        failures.push({
          line: index + 1,
          label,
          message,
          text: line.trim()
        });
      }
    }
  });

  return failures;
}

const files = await collectMatchingFiles(ROOT, {
  directories: CHECK_DIRS,
  ignoredDirs: DEFAULT_IGNORED_DIRS,
  extensions: JAVASCRIPT_EXTENSIONS
});

const failures = [];
for (const file of files) {
  const relativePath = getRelativePath(ROOT, file);
  const source = await readFileWithContext(file, 'utf8', relativePath);
  const fileFailures = findLegacyPatterns(file, source);
  for (const failure of fileFailures) {
    failures.push({
      file: relativePath,
      ...failure
    });
  }
}

if (failures.length > 0) {
  console.error('Modern JavaScript check failed:');
  for (const failure of failures) {
    console.error(
      `${failure.file}:${failure.line} ${failure.label}: ${failure.message}\n` +
      `  ${failure.text}`
    );
  }
  process.exit(1);
}

console.log(`Modern JavaScript check passed for ${files.length} JavaScript files.`);
