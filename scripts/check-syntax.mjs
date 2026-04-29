import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CHECK_DIRS = ['.'];
const IGNORED_DIRS = new Set([
  '.git',
  '.playwright',
  'node_modules',
  'playwright-report',
  'test-results',
  'tmp'
]);
const JAVASCRIPT_EXTENSIONS = new Set(['.cjs', '.js', '.mjs']);

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        files.push(...await collectJavaScriptFiles(path.join(directory, entry.name)));
      }
      continue;
    }

    if (entry.isFile() && JAVASCRIPT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(directory, entry.name));
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

function checkSyntax(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', file], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Syntax check failed for ${file} with exit code ${code}`));
    });
  });
}

const files = [];
for (const directoryName of CHECK_DIRS) {
  const directory = path.join(ROOT, directoryName);
  if (await isDirectory(directory)) {
    files.push(...await collectJavaScriptFiles(directory));
  }
}

for (const file of files) {
  await checkSyntax(file);
}

console.log(`Syntax check passed for ${files.length} JavaScript files.`);
