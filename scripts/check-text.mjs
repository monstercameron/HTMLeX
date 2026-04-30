import {
  collectMatchingFiles,
  DEFAULT_IGNORED_DIRS,
  getRelativePath,
  readFileWithContext,
} from './check-utils.mjs';

const ROOT = process.cwd();
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

function checkTextFile(file, buffer) {
  const failures = [];
  const relativePath = getRelativePath(ROOT, file);

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

const files = await collectMatchingFiles(ROOT, {
  ignoredDirs: DEFAULT_IGNORED_DIRS,
  extensions: TEXT_EXTENSIONS,
  filenames: TEXT_FILENAMES
});
const failures = [];

for (const file of files) {
  failures.push(...checkTextFile(file, await readFileWithContext(file, undefined, getRelativePath(ROOT, file))));
}

if (failures.length > 0) {
  console.error('Text hygiene check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Text hygiene check passed for ${files.length} text files.`);
