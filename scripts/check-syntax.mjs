import { spawn } from 'node:child_process';
import {
  collectMatchingFiles,
  DEFAULT_IGNORED_DIRS,
} from './check-utils.mjs';

const ROOT = process.cwd();
const CHECK_DIRS = ['.'];
const JAVASCRIPT_EXTENSIONS = new Set(['.cjs', '.js', '.mjs']);

function checkSyntax(file) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    let child;
    try {
      child = spawn(process.execPath, ['--check', file], { stdio: 'inherit' });
    } catch (error) {
      finish(error);
      return;
    }

    child.once('error', finish);
    child.once('close', (code) => {
      if (code === 0) {
        finish();
        return;
      }
      finish(new Error(`Syntax check failed for ${file} with exit code ${code}`));
    });
  });
}

const files = await collectMatchingFiles(ROOT, {
  directories: CHECK_DIRS,
  ignoredDirs: DEFAULT_IGNORED_DIRS,
  extensions: JAVASCRIPT_EXTENSIONS
});

for (const file of files) {
  await checkSyntax(file);
}

console.log(`Syntax check passed for ${files.length} JavaScript files.`);
