import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CHECK_DIRS = ['.'];
const IGNORED_DIRS = new Set([
  '.git',
  '.playwright',
  'coverage',
  'media',
  'node_modules',
  'playwright-report',
  'test-results',
  'tmp'
]);
const JAVASCRIPT_EXTENSIONS = new Set(['.cjs', '.js', '.mjs']);
const SAFETY_PATTERNS = [
  {
    label: 'dynamic function constructor',
    pattern: /\bnew\s+Function\s*\(/u,
    message: 'Use named callbacks or structured dispatch instead of runtime code generation.'
  },
  {
    label: 'eval execution',
    pattern: /\beval\s*\(/u,
    message: 'Avoid eval-style execution in runtime and tests.'
  }
];

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        files.push(...await collectJavaScriptFiles(entryPath));
      }
      continue;
    }

    if (entry.isFile() && JAVASCRIPT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

async function isDirectory(directory) {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

function findSafetyFailures(file, source) {
  const lines = source.split(/\r?\n/u);
  const failures = [];

  lines.forEach((line, index) => {
    for (const { label, pattern, message } of SAFETY_PATTERNS) {
      if (pattern.test(line)) {
        failures.push({
          file,
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

const files = [];
for (const directoryName of CHECK_DIRS) {
  const directory = path.join(ROOT, directoryName);
  if (await isDirectory(directory)) {
    files.push(...await collectJavaScriptFiles(directory));
  }
}

const failures = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  failures.push(...findSafetyFailures(path.relative(ROOT, file), source));
}

if (failures.length > 0) {
  console.error('Safety check failed:');
  for (const failure of failures) {
    console.error(
      `${failure.file}:${failure.line} ${failure.label}: ${failure.message}\n` +
      `  ${failure.text}`
    );
  }
  process.exit(1);
}

console.log(`Safety check passed for ${files.length} JavaScript files.`);
