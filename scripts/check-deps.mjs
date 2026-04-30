import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

async function readDependencyTree() {
  const options = {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  };
  try {
    const { stdout } = process.platform === 'win32'
      ? await execAsync('npm ls --omit=optional --all --json', options)
      : await execFileAsync('npm', ['ls', '--omit=optional', '--all', '--json'], options);
    return JSON.parse(stdout);
  } catch (error) {
    if (error?.stdout) {
      return JSON.parse(error.stdout);
    }
    throw error;
  }
}

const dependencyTree = await readDependencyTree();
const problems = Array.isArray(dependencyTree.problems) ? dependencyTree.problems : [];

if (problems.length > 0) {
  console.error('Dependency tree check failed:');
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exit(1);
}

console.log('Dependency tree check passed.');
