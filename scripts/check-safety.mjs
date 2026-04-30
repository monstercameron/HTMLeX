import {
  collectMatchingFiles,
  DEFAULT_IGNORED_DIRS,
  getRelativePath,
  readFileWithContext,
} from './check-utils.mjs';

const ROOT = process.cwd();
const CHECK_DIRS = ['.'];
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

const files = await collectMatchingFiles(ROOT, {
  directories: CHECK_DIRS,
  ignoredDirs: DEFAULT_IGNORED_DIRS,
  extensions: JAVASCRIPT_EXTENSIONS
});

const failures = [];
for (const file of files) {
  const relativePath = getRelativePath(ROOT, file);
  const source = await readFileWithContext(file, 'utf8', relativePath);
  failures.push(...findSafetyFailures(relativePath, source));
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
