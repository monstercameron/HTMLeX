import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  collectMatchingFiles,
  getArray,
  getField,
  getNpmInvocation,
  getObjectEntries,
  getObjectKeys,
  getRelativePath,
  hasOwn,
  parseJsonText,
  pathIsDirectory,
  readFileWithContext,
  safeString,
} from '../../scripts/check-utils.mjs';

test('script utilities safely coerce hostile values', () => {
  const hostileString = {
    [Symbol.toPrimitive]() {
      throw new Error('cannot stringify');
    }
  };
  const hostileObject = Object.defineProperty({}, 'danger', {
    get() {
      throw new Error('cannot read');
    }
  });
  const hostileProxy = new Proxy({}, {
    ownKeys() {
      throw new Error('cannot enumerate');
    }
  });

  assert.equal(safeString(hostileString, 'fallback'), 'fallback');
  assert.equal(safeString(null, 'fallback'), 'fallback');
  assert.equal(safeString(undefined, 'fallback'), 'fallback');
  assert.equal(getField(hostileObject, 'danger', 'fallback'), 'fallback');
  assert.deepEqual(getArray('not-array'), []);
  assert.deepEqual(getObjectEntries(hostileProxy), []);
  assert.deepEqual(getObjectKeys(hostileProxy), []);
  assert.equal(hasOwn(hostileProxy, 'field'), false);
});

test('script utilities preserve valid values', () => {
  const value = { field: 'value' };

  assert.equal(safeString(42), '42');
  assert.equal(getField(value, 'field'), 'value');
  assert.deepEqual(getArray(['one']), ['one']);
  assert.deepEqual(getObjectEntries({ one: 1 }), [['one', 1]]);
  assert.deepEqual(getObjectKeys({ one: 1 }), ['one']);
  assert.equal(hasOwn(value, 'field'), true);
});

test('script utilities include context in JSON parse failures', () => {
  const hostileDescription = {
    [Symbol.toPrimitive]() {
      throw new Error('cannot stringify description');
    }
  };

  assert.deepEqual(parseJsonText('{"ok":true}', 'unit JSON'), { ok: true });
  assert.throws(
    () => parseJsonText('{nope', 'unit JSON'),
    /Unable to parse unit JSON as JSON\./u
  );
  assert.throws(
    () => parseJsonText('{nope', hostileDescription),
    /Unable to parse <unknown> as JSON\./u
  );
});

test('npm invocation uses the npm JavaScript CLI when available', () => {
  const originalNpmExecPath = process.env.npm_execpath;

  try {
    process.env.npm_execpath = 'C:\\npm\\node_modules\\npm\\bin\\npm-cli.js';
    assert.deepEqual(getNpmInvocation(['ls', '--json', 42]), {
      command: process.execPath,
      args: ['C:\\npm\\node_modules\\npm\\bin\\npm-cli.js', 'ls', '--json', '42']
    });
    assert.deepEqual(getNpmInvocation('version'), {
      command: process.execPath,
      args: ['C:\\npm\\node_modules\\npm\\bin\\npm-cli.js', 'version']
    });
  } finally {
    if (originalNpmExecPath === undefined) {
      delete process.env.npm_execpath;
    } else {
      process.env.npm_execpath = originalNpmExecPath;
    }
  }
});

test('script utilities collect matching files with stable ignores and relative paths', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'htmlex-check-utils-'));

  try {
    await writeFile(path.join(root, 'README.md'), 'readme\n');
    await writeFile(path.join(root, 'ignored.bin'), 'ignored\n');
    await mkdir(path.join(root, 'nested'));
    await writeFile(path.join(root, 'nested', 'tool.mjs'), 'export default 1;\n');
    await mkdir(path.join(root, 'node_modules'));
    await writeFile(path.join(root, 'node_modules', 'ignored.js'), 'throw new Error();\n');

    const files = await collectMatchingFiles(root, {
      directories: '.',
      extensions: ['.mjs'],
      filenames: ['README.md'],
      ignoredDirs: ['node_modules']
    });
    const relativePaths = files.map(file => getRelativePath(root, file)).sort();

    assert.deepEqual(relativePaths, ['README.md', 'nested/tool.mjs']);
    assert.equal(await pathIsDirectory(path.join(root, 'nested')), true);
    assert.equal(await pathIsDirectory(path.join(root, 'missing')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('script utilities wrap file read failures with useful context', async () => {
  await assert.rejects(
    () => readFileWithContext(path.join(os.tmpdir(), 'htmlex-missing-file'), 'utf8', 'unit missing file'),
    /Unable to read unit missing file\./u
  );
});
