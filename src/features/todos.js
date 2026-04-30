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
import { sendFragmentResponse, sendServerError } from './responses.js';
import { logFeatureError, logRequestError, logRequestWarning } from '../serverLogger.js';

const TODO_SEED_FILE = path.join(import.meta.dirname, '..', 'persistence/data.json');
const DEFAULT_TODOS_FILE = path.join(import.meta.dirname, '..', '..', 'tmp', 'todos.json');
let persistenceQueue = null;

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
  return path.resolve(process.env.HTMLEX_TODO_DATA_FILE || DEFAULT_TODOS_FILE);
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

function getLockTimeoutMs() {
  const timeoutMs = Number.parseInt(process.env.HTMLEX_TODO_LOCK_TIMEOUT_MS || '5000', 10);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;
}

function getLockRetryMs() {
  const retryMs = Number.parseInt(process.env.HTMLEX_TODO_LOCK_RETRY_MS || '10', 10);
  return Number.isFinite(retryMs) && retryMs > 0 ? retryMs : 10;
}

function getLockStaleMs() {
  const staleMs = Number.parseInt(process.env.HTMLEX_TODO_LOCK_STALE_MS || '30000', 10);
  return Number.isFinite(staleMs) && staleMs > 0 ? staleMs : 30000;
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

  const createdAtMs = Date.parse(metadata?.createdAt || '');
  const metadataAgeMs = Number.isFinite(createdAtMs) ? Date.now() - createdAtMs : 0;
  const lockAgeMs = Date.now() - lockStats.mtimeMs;
  const lockIsOld = Math.max(lockAgeMs, metadataAgeMs) >= getLockStaleMs();
  const ownerAlive = isProcessAlive(Number.parseInt(metadata?.pid, 10));

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
  const startedAt = Date.now();
  const timeoutMs = getLockTimeoutMs();
  const retryMs = getLockRetryMs();

  while (true) {
    try {
      await mkdir(path.dirname(lockFile), { recursive: true });
      const lockHandle = await open(lockFile, 'wx');
      try {
        await lockHandle.writeFile(JSON.stringify({
          pid: process.pid,
          createdAt: new Date().toISOString()
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
      if (error?.code !== 'EEXIST') throw error;
      if (await removeStaleTodoLockIfSafe(lockFile)) continue;
      if (Date.now() - startedAt >= timeoutMs) {
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
export async function loadTodos({ failClosed = false } = {}) {
  await persistenceQueue?.catch(() => {});
  await ensureDataFile();
  const todosFile = getTodosFile();
  try {
    const data = await readFile(todosFile, 'utf8');
    return JSON.parse(data);
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
  const tempFile = `${todosFile}.${process.pid}.${randomUUID()}.tmp`;
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

  return todos;
}

function createTodoId(todos) {
  const highestExistingId = todos.reduce((highestId, todo) => (
    Number.isSafeInteger(todo.id) ? Math.max(highestId, todo.id) : highestId
  ), 0);
  return Math.max(Date.now(), highestExistingId + 1);
}

function mutateTodos(mutator) {
  return withTodoLock(async () => {
    const todos = await loadTodosForMutation();
    const result = await mutator(todos);
    if (result?.write !== false) {
      await writeTodosAtomic(todos);
    }
    return { ...result, todos };
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
    const submittedText = Array.isArray(req.body.todo) ? req.body.todo[0] : req.body.todo;
    const normalizedText = String(submittedText ?? '').trim();
    if (!normalizedText) {
      logRequestWarning(req, 'Rejected todo create request without text.', { statusCode: 400 });
      if (!res.headersSent) {
        res.status(400).send('Missing todo text');
      }
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
    const todos = await loadTodos();
    const id = Number.parseInt(req.params.id, 10);
    const todo = todos.find(t => t.id === id);
    if (!todo) {
      logRequestWarning(req, 'Todo item was not found.', { id, statusCode: 404 });
      if (!res.headersSent) return res.status(404).send('Todo not found');
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
    const todos = await loadTodos();
    const id = Number.parseInt(req.params.id, 10);
    const todo = todos.find(t => t.id === id);
    if (!todo) {
      logRequestWarning(req, 'Todo edit target was not found.', { id, statusCode: 404 });
      if (!res.headersSent) return res.status(404).send('Todo not found');
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
    const id = Number.parseInt(req.params.id, 10);
    const submittedText = Array.isArray(req.body.todo) ? req.body.todo[0] : req.body.todo;
    const normalizedText = String(submittedText ?? '').trim();
    if (!normalizedText) {
      logRequestWarning(req, 'Rejected todo update request without text.', { id, statusCode: 400 });
      if (!res.headersSent) return res.status(400).send('Missing updated todo text');
      return;
    }
    const result = await mutateTodos((todos) => {
      const index = todos.findIndex(todo => todo.id === id);
      if (index === -1) {
        return { found: false, write: false };
      }

      todos[index].text = normalizedText;
      return { found: true, todo: todos[index] };
    });

    if (!result.found) {
      logRequestWarning(req, 'Todo update target was not found.', { id, statusCode: 404 });
      if (!res.headersSent) return res.status(404).send('Todo not found');
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
    const id = Number.parseInt(req.params.id, 10);
    const result = await mutateTodos((todos) => {
      const index = todos.findIndex(todo => todo.id === id);
      if (index === -1) {
        return { found: false, write: false };
      }

      todos.splice(index, 1);
      return { found: true };
    });

    if (!result.found) {
      logRequestWarning(req, 'Todo delete target was not found.', { id, statusCode: 404 });
      if (!res.headersSent) return res.status(404).send('Todo not found');
      return;
    }

    sendFragmentResponse(res, '#todoList(outerHTML)', render(renderTodoList(result.todos)));
  } catch (error) {
    logRequestError(req, 'Failed to delete todo.', error);
    sendServerError(res);
  }
}

