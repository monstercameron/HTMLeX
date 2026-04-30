import { getArray, getField, runNpmJsonAllowingFailures } from './check-utils.mjs';

async function readDependencyTree() {
  return runNpmJsonAllowingFailures(
    ['ls', '--omit=optional', '--all', '--json'],
    { maxBuffer: 20 * 1024 * 1024 },
    'npm dependency tree'
  );
}

const dependencyTree = await readDependencyTree();
const problems = getArray(getField(dependencyTree, 'problems'));

if (problems.length > 0) {
  console.error('Dependency tree check failed:');
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exit(1);
}

console.log('Dependency tree check passed.');
