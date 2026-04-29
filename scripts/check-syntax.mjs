import { execFileSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const CHECK_DIRS = ['src', 'tests'];
const IGNORED_DIRS = new Set(['node_modules', '.git', 'playwright-report', 'test-results']);
const JAVASCRIPT_EXTENSIONS = new Set(['.js', '.mjs']);

function collectJavaScriptFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        files.push(...collectJavaScriptFiles(path.join(directory, entry.name)));
      }
      continue;
    }

    if (entry.isFile() && JAVASCRIPT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(directory, entry.name));
    }
  }

  return files;
}

const files = CHECK_DIRS
  .map(directoryName => path.join(ROOT, directoryName))
  .filter(directory => statSync(directory, { throwIfNoEntry: false })?.isDirectory())
  .flatMap(collectJavaScriptFiles);

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

console.log(`Syntax check passed for ${files.length} JavaScript files.`);
