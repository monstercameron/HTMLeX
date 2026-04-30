/**
 * @fileoverview Domain logic for managing todo items.
 * This module handles CRUD operations for todos by interacting with a JSON data file.
 * It provides functions for loading, creating, updating, and deleting todo items.
 *
 * @module features/todos
 */

import { access, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  renderTodoItem,
  renderTodoList,
  renderEditForm,
  TodoWidget,
} from '../components/Components.js';
import { render } from '../components/HTMLeX.js';
import { sendFragmentResponse, sendServerError, sendTextResponse } from './responses.js';
import { logFeatureError, logRequestError, logRequestWarning } from '../serverLogger.js';

const TODO_SEED_FILE = path.join(import.meta.dirname, '..', 'persistence/data.json');
const DEFAULT_TODOS_FILE = path.join(import.meta.dirname, '..', '..', 'tmp', 'todos.json');
const LOCK_CONTENTION_ERROR_CODES = new Set(['EACCES', 'EEXIST', 'EPERM']);
let persistenceQueue = null;
let tempFileSequence = 0;

function safeString(value, fallback = '') {
  try {
    return String(value ?? fallback);
  } catch {
    return fallback;
  }
}

function getField(target, fieldName, fallback = undefined) {
  try {
    return target?.[fieldName] ?? fallback;
  } catch {
    return fallback;
  }
}

function getRequestBodyValue(req, fieldName) {
  return getField(getField(req, 'body', {}), fieldName);
}

function getRequestParam(req, fieldName) {
  return getField(getField(req, 'params', {}), fieldName);
}

function getCurrentTimeMs() {
  try {
    const timestamp = Date.now();
    return Number.isFinite(timestamp) ? timestamp : 0;
  } catch {
    try {
      const timeOrigin = globalThis.performance?.timeOrigin || 0;
      const timestamp = timeOrigin + globalThis.performance?.now?.();
      return Number.isFinite(timestamp) ? Math.round(timestamp) : 0;
    } catch {
      return 0;
    }
  }
}

function getCurrentIsoTimestamp() {
  try {
    return new Date().toISOString();
  } catch {
    return '1970-01-01T00:00:00.000Z';
  }
}

function parseTimestamp(value) {
  try {
    return Date.parse(safeString(value));
  } catch {
    return Number.NaN;
  }
}

function createTempFileId() {
  try {
    return randomUUID();
  } catch {
    tempFileSequence = (tempFileSequence + 1) % Number.MAX_SAFE_INTEGER;
    let randomPart = 'fallback';
    try {
      const randomValue = Math.random();
      if (Number.isFinite(randomValue)) {
        randomPart = randomValue.toString(36).slice(2, 12) || randomPart;
      }
    } catch {
      randomPart = 'fallback';
    }
    return `${getCurrentTimeMs().toString(36)}-${randomPart}-${tempFileSequence.toString(36)}`;
  }
}

function enqueuePersistence(operation) {
  const nextOperation = persistenceQueue ? persistenceQueue.then(operation, operation) : operation();
  persistenceQueue = nextOperation.catch(() => {});
  return nextOperation;
}

/**
 * Ensures that the data file exists.
 * If it does not exist, an empty JSON array is written to the file.
 * @async
 * @returns {Promise<void>}
 */
async function ensureDataFile() {
  const todosFile = getTodosFile();
  try {
    await access(todosFile);
  } catch {
    try {
      await mkdir(path.dirname(todosFile), { recursive: true });
      await writeFile(todosFile, await getInitialTodosPayload(), { flag: 'wx' });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
}

function getTodosFile() {
  const configuredFile = safeString(process.env.HTMLEX_TODO_DATA_FILE).trim();
  return path.resolve(configuredFile || DEFAULT_TODOS_FILE);
}

function getTodoLockFile() {
  return `${getTodosFile()}.lock`;
}

async function getInitialTodosPayload() {
  try {
    return await readFile(TODO_SEED_FILE, 'utf8');
  } catch {
    return JSON.stringify([], null, 2);
  }
}

function parsePositiveInteger(value, defaultValue) {
  const normalizedValue = safeString(value).trim();
  if (!/^[1-9]\d*$/.test(normalizedValue)) return defaultValue;

  const parsedValue = Number.parseInt(normalizedValue, 10);
  return Number.isSafeInteger(parsedValue) ? parsedValue : defaultValue;
}

function parsePositivePid(value) {
  const parsedValue = parsePositiveInteger(value, null);
  return Number.isSafeInteger(parsedValue) ? parsedValue : null;
}

function normalizeTodoItem(todo, index) {
  if (!todo || typeof todo !== 'object' || Array.isArray(todo)) {
    throw new TypeError(`Todo item ${index} must be an object.`);
  }
  const id = getField(todo, 'id');
  const rawText = getField(todo, 'text');
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new TypeError(`Todo item ${index} has an invalid id.`);
  }
  if (typeof rawText !== 'string') {
    throw new TypeError(`Todo item ${index} has invalid text.`);
  }
  const text = rawText.trim();
  if (!text) {
    throw new TypeError(`Todo item ${index} has blank text.`);
  }

  return {
    id,
    text,
  };
}

function normalizeTodoArray(todos) {
  const seenIds = new Set();
  return todos.map((todo, index) => {
    const normalizedTodo = normalizeTodoItem(todo, index);
    if (seenIds.has(normalizedTodo.id)) {
      throw new TypeError(`Todo item ${index} duplicates id ${normalizedTodo.id}.`);
    }
    seenIds.add(normalizedTodo.id);
    return normalizedTodo;
  });
}

function getLockTimeoutMs() {
  return parsePositiveInteger(process.env.HTMLEX_TODO_LOCK_TIMEOUT_MS, 5000);
}

function getLockRetryMs() {
  return parsePositiveInteger(process.env.HTMLEX_TODO_LOCK_RETRY_MS, 10);
}

function getLockStaleMs() {
  return parsePositiveInteger(process.env.HTMLEX_TODO_LOCK_STALE_MS, 30000);
}

function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'EPERM') return true;
    if (error?.code === 'ESRCH') return false;
    return true;
  }
}

async function readTodoLockMetadata(lockFile) {
  try {
    return JSON.parse(await readFile(lockFile, 'utf8'));
  } catch {
    return null;
  }
}

async function isTodoLockStale(lockFile) {
  const [metadata, lockStats] = await Promise.all([
    readTodoLockMetadata(lockFile),
    stat(lockFile).catch(() => null),
  ]);
  if (!lockStats) return false;

  const createdAtMs = parseTimestamp(getField(metadata, 'createdAt'));
  const metadataAgeMs = Number.isFinite(createdAtMs) ? getCurrentTimeMs() - createdAtMs : 0;
  const lockAgeMs = getCurrentTimeMs() - getField(lockStats, 'mtimeMs', 0);
  const lockIsOld = Math.max(lockAgeMs, metadataAgeMs) >= getLockStaleMs();
  const ownerAlive = isProcessAlive(parsePositivePid(getField(metadata, 'pid')));

  return lockIsOld && !ownerAlive;
}

async function removeStaleTodoLockIfSafe(lockFile) {
  if (!(await isTodoLockStale(lockFile))) return false;

  await rm(lockFile, { force: true }).catch(() => {});
  return true;
}

async function syncDirectory(directoryPath) {
  let directoryHandle;
  try {
    directoryHandle = await open(directoryPath, 'r');
    await directoryHandle.sync();
  } catch {
    // Directory sync is best-effort because some Windows filesystems reject it.
  } finally {
    await directoryHandle?.close().catch(() => {});
  }
}

async function acquireTodoLock() {
  const lockFile = getTodoLockFile();
  const startedAt = getCurrentTimeMs();
  const timeoutMs = getLockTimeoutMs();
  const retryMs = getLockRetryMs();

  while (true) {
    try {
      await mkdir(path.dirname(lockFile), { recursive: true });
      const lockHandle = await open(lockFile, 'wx');
      try {
        await lockHandle.writeFile(JSON.stringify({
          pid: process.pid,
          createdAt: getCurrentIsoTimestamp()
        }));
        await lockHandle.sync();
      } catch (error) {
        await lockHandle.close().catch(() => {});
        await rm(lockFile, { force: true }).catch(() => {});
        throw error;
      }

      return async () => {
        await lockHandle.close().catch(() => {});
        await rm(lockFile, { force: true }).catch(() => {});
      };
    } catch (error) {
      if (!LOCK_CONTENTION_ERROR_CODES.has(error?.code)) throw error;
      if (await removeStaleTodoLockIfSafe(lockFile)) continue;
      if (getCurrentTimeMs() - startedAt >= timeoutMs) {
        throw new Error(`Timed out acquiring todo persistence lock after ${timeoutMs}ms.`, { cause: error });
      }
      await delay(retryMs);
    }
  }
}

function withTodoLock(operation) {
  return enqueuePersistence(async () => {
    const releaseLock = await acquireTodoLock();
    try {
      return await operation();
    } finally {
      await releaseLock();
    }
  });
}

/**
 * Loads todos from the data file.
 * @async
 * @returns {Promise<Array<Object>>} Array of todo objects.
 */
export async function loadTodos(options = {}) {
  const failClosed = getField(options && typeof options === 'object' ? options : {}, 'failClosed', false) === true;
  await persistenceQueue?.catch(() => {});
  await ensureDataFile();
  const todosFile = getTodosFile();
  try {
    const data = await readFile(todosFile, 'utf8');
    const todos = JSON.parse(data);
    return Array.isArray(todos) ? normalizeTodoArray(todos) : todos;
  } catch (error) {
    logFeatureError('todos', 'Failed to load todos from disk.', error, { file: todosFile });
    if (failClosed) return [];
    throw error;
  }
}

/**
 * Handles the request to get the ToDo widget.
 *
 * Loads todos, validates the data, renders the widget as HTML, and sends it in the response.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
export async function getToDoWidget(req, res) {
  try {
    const todos = await loadTodos();

    if (!Array.isArray(todos)) {
      logRequestError(req, 'Loaded todo data is not an array.', null, { dataType: typeof todos });
      sendServerError(res, 'Internal server error: Invalid todo data');
      return;
    }

    sendFragmentResponse(res, '#demoCanvas(innerHTML)', TodoWidget(todos));
  } catch (error) {
    logRequestError(req, 'Failed to render todo widget.', error);
    sendServerError(res);
  }
}

/**
 * Writes the todos array to the data file.
 * @async
 * @param {Array<Object>} todos - Array of todo objects.
 * @returns {Promise<void>}
 */
export async function writeTodos(todos) {
  return withTodoLock(() => writeTodosAtomic(todos));
}

async function writeTodosAtomic(todos) {
  const todosFile = getTodosFile();
  const tempFile = `${todosFile}.${process.pid}.${createTempFileId()}.tmp`;
  let tempHandle;
  try {
    tempHandle = await open(tempFile, 'w');
    await tempHandle.writeFile(JSON.stringify(todos, null, 2));
    await tempHandle.sync();
    await tempHandle.close();
    tempHandle = null;
    await rename(tempFile, todosFile);
    await syncDirectory(path.dirname(todosFile));
  } catch (error) {
    await tempHandle?.close().catch(() => {});
    await rm(tempFile, { force: true }).catch(() => {});
    logFeatureError('todos', 'Failed to write todos to disk.', error, { file: todosFile });
    throw error;
  }
}

async function loadTodosForMutation() {
  await ensureDataFile();
  const data = await readFile(getTodosFile(), 'utf8');
  const todos = JSON.parse(data);
  if (!Array.isArray(todos)) {
    throw new TypeError(`Expected todo data to be an array but received ${typeof todos}.`);
  }

  return normalizeTodoArray(todos);
}

function createTodoId(todos) {
  const highestExistingId = todos.reduce((highestId, todo) => (
    Number.isSafeInteger(getField(todo, 'id')) ? Math.max(highestId, getField(todo, 'id')) : highestId
  ), 0);
  const usedIds = new Set(todos.map(todo => getField(todo, 'id')).filter(Number.isSafeInteger));
  let nextId = getCurrentTimeMs();
  if (highestExistingId < Number.MAX_SAFE_INTEGER) {
    nextId = Math.max(nextId, highestExistingId + 1);
  }

  while (usedIds.has(nextId) && nextId < Number.MAX_SAFE_INTEGER) {
    nextId += 1;
  }
  if (!Number.isSafeInteger(nextId) || usedIds.has(nextId)) {
    throw new RangeError('Unable to allocate a safe todo id.');
  }

  return nextId;
}

function parseTodoId(rawId) {
  const value = safeString(rawId).trim();
  if (!/^[1-9]\d*$/.test(value)) return null;

  const id = Number.parseInt(value, 10);
  return Number.isSafeInteger(id) ? id : null;
}

function sendTodoNotFound(req, res, logMessage, id) {
  logRequestWarning(req, logMessage, { id, statusCode: 404 });
  return sendTextResponse(res, 404, 'Todo not found');
}

function mutateTodos(mutator) {
  return withTodoLock(async () => {
    const todos = await loadTodosForMutation();
    const result = await mutator(todos);
    if (getField(result, 'write') !== false) {
      await writeTodosAtomic(todos);
    }
    return {
      ...(result && typeof result === 'object' ? result : {}),
      todos
    };
  });
}

/**
 * Handles the creation of a new todo item.
 * Extracts the todo text from the request, creates a new todo, saves it,
 * and sends back an HTML fragment with the updated todo list.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export async function createTodo(req, res) {
  try {
    const submittedTodo = getRequestBodyValue(req, 'todo');
    const submittedText = Array.isArray(submittedTodo) ? submittedTodo[0] : submittedTodo;
    const normalizedText = safeString(submittedText).trim();
    if (!normalizedText) {
      logRequestWarning(req, 'Rejected todo create request without text.', { statusCode: 400 });
      sendTextResponse(res, 400, 'Missing todo text');
      return;
    }
    const { todos } = await mutateTodos((todos) => {
      const newTodo = { id: createTodoId(todos), text: normalizedText };
      todos.push(newTodo);
      return { newTodo };
    });
    sendFragmentResponse(res, '#todoList(outerHTML)', render(renderTodoList(todos)));
  } catch (error) {
    logRequestError(req, 'Failed to create todo.', error);
    sendServerError(res);
  }
}

/**
 * Handles listing all todo items.
 * Reads todos from the data file and sends back an HTML fragment with the rendered todo list.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export async function listTodos(req, res) {
  try {
    const todos = await loadTodos();
    if (!Array.isArray(todos)) {
      logRequestError(req, 'Loaded todo data is not an array.', null, { dataType: typeof todos });
      sendServerError(res, 'Internal server error: Invalid todo data');
      return;
    }
    sendFragmentResponse(res, '#todoList(outerHTML)', render(renderTodoList(todos)));
  } catch (error) {
    logRequestError(req, 'Failed to list todos.', error);
    sendServerError(res);
  }
}

/**
 * Retrieves a single todo item based on its ID and returns an HTML fragment.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export async function getTodoItem(req, res) {
  try {
    const rawId = getRequestParam(req, 'id');
    const id = parseTodoId(rawId);
    if (id === null) {
      sendTodoNotFound(req, res, 'Todo item request used an invalid id.', rawId);
      return;
    }

    const todos = await loadTodos();
    const todo = todos.find(todo => getField(todo, 'id') === id);
    if (!todo) {
      sendTodoNotFound(req, res, 'Todo item was not found.', id);
      return;
    }
    sendFragmentResponse(res, `#editForm-${id}(outerHTML)`, render(renderTodoItem(todo)));
  } catch (error) {
    logRequestError(req, 'Failed to render todo item.', error);
    sendServerError(res);
  }
}

/**
 * Retrieves an edit form for a todo item and returns it as an HTML fragment.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export async function getEditTodoForm(req, res) {
  try {
    const rawId = getRequestParam(req, 'id');
    const id = parseTodoId(rawId);
    if (id === null) {
      sendTodoNotFound(req, res, 'Todo edit request used an invalid id.', rawId);
      return;
    }

    const todos = await loadTodos();
    const todo = todos.find(todo => getField(todo, 'id') === id);
    if (!todo) {
      sendTodoNotFound(req, res, 'Todo edit target was not found.', id);
      return;
    }
    sendFragmentResponse(res, `#todo-${id}(outerHTML)`, renderEditForm(todo));
  } catch (error) {
    logRequestError(req, 'Failed to render todo edit form.', error);
    sendServerError(res);
  }
}

/**
 * Updates an existing todo item.
 * Expects updated todo text in the request body, updates the item, and returns an HTML fragment.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export async function updateTodo(req, res) {
  try {
    const rawId = getRequestParam(req, 'id');
    const id = parseTodoId(rawId);
    if (id === null) {
      sendTodoNotFound(req, res, 'Todo update request used an invalid id.', rawId);
      return;
    }

    const submittedTodo = getRequestBodyValue(req, 'todo');
    const submittedText = Array.isArray(submittedTodo) ? submittedTodo[0] : submittedTodo;
    const normalizedText = safeString(submittedText).trim();
    if (!normalizedText) {
      logRequestWarning(req, 'Rejected todo update request without text.', { id, statusCode: 400 });
      sendTextResponse(res, 400, 'Missing updated todo text');
      return;
    }
    const result = await mutateTodos((todos) => {
      const index = todos.findIndex(todo => getField(todo, 'id') === id);
      if (index === -1) {
        return { found: false, write: false };
      }

      todos[index].text = normalizedText;
      return { found: true, todo: todos[index] };
    });

    if (!result.found) {
      sendTodoNotFound(req, res, 'Todo update target was not found.', id);
      return;
    }

    sendFragmentResponse(res, `#editForm-${id}(outerHTML)`, render(renderTodoItem(result.todo)));
  } catch (error) {
    logRequestError(req, 'Failed to update todo.', error);
    sendServerError(res);
  }
}

/**
 * Deletes a todo item.
 * Removes the specified todo from the list and returns an HTML fragment with the updated list.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export async function deleteTodo(req, res) {
  try {
    const rawId = getRequestParam(req, 'id');
    const id = parseTodoId(rawId);
    if (id === null) {
      sendTodoNotFound(req, res, 'Todo delete request used an invalid id.', rawId);
      return;
    }

    const result = await mutateTodos((todos) => {
      const index = todos.findIndex(todo => getField(todo, 'id') === id);
      if (index === -1) {
        return { found: false, write: false };
      }

      todos.splice(index, 1);
      return { found: true };
    });

    if (!result.found) {
      sendTodoNotFound(req, res, 'Todo delete target was not found.', id);
      return;
    }

    sendFragmentResponse(res, '#todoList(outerHTML)', render(renderTodoList(result.todos)));
  } catch (error) {
    logRequestError(req, 'Failed to delete todo.', error);
    sendServerError(res);
  }
}
