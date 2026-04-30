import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
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
const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.d.ts',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.txt',
  '.yaml',
  '.yml'
]);
const TEXT_FILENAMES = new Set([
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  '.node-version',
  '.npmrc',
  'LICENSE'
]);

async function collectTextFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        files.push(...await collectTextFiles(entryPath));
      }
      continue;
    }

    if (!entry.isFile()) continue;

    if (TEXT_FILENAMES.has(entry.name) || TEXT_EXTENSIONS.has(path.extname(entry.name))) {
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

function checkTextFile(file, buffer) {
  const failures = [];
  const relativePath = path.relative(ROOT, file);

  if (buffer.length > 0 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    failures.push(`${relativePath}: UTF-8 BOM is not allowed.`);
  }

  const source = buffer.toString('utf8');
  if (source.includes('\r')) {
    failures.push(`${relativePath}: use LF line endings.`);
  }

  if (source.length > 0 && !source.endsWith('\n')) {
    failures.push(`${relativePath}: missing final newline.`);
  }

  const lines = source.split('\n');
  lines.forEach((line, index) => {
    if (/[ \t]+$/u.test(line)) {
      failures.push(`${relativePath}:${index + 1} trailing whitespace.`);
    }
  });

  return failures;
}

const rootIsDirectory = await isDirectory(ROOT);
const files = rootIsDirectory ? await collectTextFiles(ROOT) : [];
const failures = [];

for (const file of files) {
  failures.push(...checkTextFile(file, await readFile(file)));
}

if (failures.length > 0) {
  console.error('Text hygiene check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Text hygiene check passed for ${files.length} text files.`);
