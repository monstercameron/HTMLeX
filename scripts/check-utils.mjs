import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const DEFAULT_IGNORED_DIRS = new Set([
  '.git',
  '.playwright',
  'coverage',
  'media',
  'node_modules',
  'playwright-report',
  'test-results',
  'tmp'
]);

export function safeString(value, fallback = '') {
  try {
    return String(value ?? fallback);
  } catch {
    return fallback;
  }
}

export function getField(target, fieldName, fallback = undefined) {
  try {
    return target?.[fieldName] ?? fallback;
  } catch {
    return fallback;
  }
}

export function getArray(value) {
  return Array.isArray(value) ? value : [];
}

export function getObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function hasOwn(value, fieldName) {
  try {
    return Object.hasOwn(getObject(value), fieldName);
  } catch {
    return false;
  }
}

export function getObjectEntries(value) {
  try {
    return Object.entries(getObject(value));
  } catch {
    return [];
  }
}

export function getObjectKeys(value) {
  try {
    return Object.keys(getObject(value));
  } catch {
    return [];
  }
}

function getOptionList(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];

  try {
    if (typeof value?.[Symbol.iterator] === 'function') return Array.from(value);
  } catch {
    return [];
  }

  return [value];
}

export function getRelativePath(root, filePath) {
  try {
    return path.relative(root, filePath).replaceAll(path.sep, '/') || '.';
  } catch {
    return safeString(filePath, '<unknown>');
  }
}

function setHas(values, value) {
  try {
    const has = values?.has;
    if (typeof has === 'function' && has.call(values, value) === true) return true;
  } catch {
    // Fall through to the other supported collection shapes.
  }

  try {
    if (Array.isArray(values)) return values.includes(value);
    if (typeof values === 'string') return values === value;
  } catch {
    return false;
  }

  return false;
}

function hasMatchingExtension(fileName, extensions) {
  try {
    return setHas(extensions, path.extname(fileName));
  } catch {
    return false;
  }
}

export async function pathIsDirectory(directory) {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

async function collectMatchingFilesInDirectory(root, directory, options) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Unable to read directory ${getRelativePath(root, directory)}.`, { cause: error });
  }

  entries.sort((left, right) => safeString(left?.name).localeCompare(safeString(right?.name)));
  const files = [];

  for (const entry of entries) {
    const entryName = safeString(entry?.name);
    if (!entryName) continue;

    const entryPath = path.join(directory, entryName);
    if (entry.isDirectory()) {
      if (!setHas(options.ignoredDirs, entryName)) {
        files.push(...await collectMatchingFilesInDirectory(root, entryPath, options));
      }
      continue;
    }

    if (!entry.isFile()) continue;

    if (setHas(options.filenames, entryName) || hasMatchingExtension(entryName, options.extensions)) {
      files.push(entryPath);
    }
  }

  return files;
}

export async function collectMatchingFiles(root, {
  directories = ['.'],
  ignoredDirs = DEFAULT_IGNORED_DIRS,
  extensions = new Set(),
  filenames = new Set()
} = {}) {
  const files = [];

  for (const directoryName of getOptionList(directories)) {
    const directory = path.join(root, safeString(directoryName));
    if (await pathIsDirectory(directory)) {
      files.push(...await collectMatchingFilesInDirectory(root, directory, {
        extensions,
        filenames,
        ignoredDirs
      }));
    }
  }

  return files;
}

export async function readFileWithContext(filePath, options = undefined, description = filePath) {
  try {
    return await readFile(filePath, options);
  } catch (error) {
    throw new Error(`Unable to read ${safeString(description, '<unknown>')}.`, { cause: error });
  }
}

export function parseJsonText(source, description) {
  const sourceDescription = safeString(description, '<unknown>');
  try {
    return JSON.parse(safeString(source));
  } catch (error) {
    throw new Error(`Unable to parse ${sourceDescription} as JSON.`, { cause: error });
  }
}

export async function readJsonFile(filePath, description = filePath) {
  return parseJsonText(await readFileWithContext(filePath, 'utf8', description), description);
}

export function getNpmInvocation(args) {
  const normalizedArgs = getOptionList(args).map(arg => safeString(arg));
  const npmExecPath = safeString(process.env.npm_execpath).trim();
  if (/\.(?:c|m)?js$/iu.test(npmExecPath)) {
    return {
      command: process.execPath,
      args: [npmExecPath, ...normalizedArgs]
    };
  }

  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', ...normalizedArgs]
    };
  }

  return {
    command: npmExecPath || 'npm',
    args: normalizedArgs
  };
}

export function getNpmExecutable() {
  return getNpmInvocation([]).command;
}

function getNpmDescription(args) {
  return `npm ${getOptionList(args).map(arg => safeString(arg)).join(' ')}`.trim();
}

export async function runNpmJson(args, options = {}, description = getNpmDescription(args)) {
  const invocation = getNpmInvocation(args);
  const { stdout } = await execFileAsync(invocation.command, invocation.args, {
    ...options,
    encoding: 'utf8'
  });
  return parseJsonText(stdout, `${description} output`);
}

export async function runNpmJsonAllowingFailures(args, options = {}, description = getNpmDescription(args)) {
  try {
    return await runNpmJson(args, options, description);
  } catch (error) {
    const stdout = getField(error, 'stdout');
    if (stdout) {
      return parseJsonText(stdout, `${description} error output`);
    }
    throw error;
  }
}
