import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after, before, beforeEach } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  createTodo,
  deleteTodo,
  getEditTodoForm,
  getToDoWidget,
  getTodoItem,
  listTodos,
  loadTodos,
  updateTodo,
} from '../../src/features/todos.js';

process.env.HTMLEX_LOG_LEVEL = 'silent';

const dataPath = path.resolve(import.meta.dirname, '../../tmp/unit-todos.json');
const lockPath = `${dataPath}.lock`;
const originalTodoDataFile = process.env.HTMLEX_TODO_DATA_FILE;
process.env.HTMLEX_TODO_DATA_FILE = dataPath;
const fixtureTodos = [
  { id: 1, text: 'Alpha <safe>' },
  { id: 2, text: 'Beta' },
];
let originalData;

before(async () => {
  await mkdir(path.dirname(dataPath), { recursive: true });
  try {
    originalData = await readFile(dataPath, 'utf8');
  } catch {
    originalData = null;
  }
});

beforeEach(async () => {
  await rm(lockPath, { force: true });
  await writeFile(dataPath, JSON.stringify(fixtureTodos, null, 2));
});

after(async () => {
  await rm(lockPath, { force: true });
  if (originalData === null) {
    await rm(dataPath, { force: true });
  } else {
    await writeFile(dataPath, originalData);
  }

  if (originalTodoDataFile === undefined) {
    delete process.env.HTMLEX_TODO_DATA_FILE;
  } else {
    process.env.HTMLEX_TODO_DATA_FILE = originalTodoDataFile;
  }
});

function createResponse() {
  return {
    body: '',
    headers: {},
    headersSent: false,
    statusCode: 200,
    writableEnded: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    send(body) {
      this.body = body;
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    }
  };
}

function createRequest({ body = {}, params = {} } = {}) {
  return {
    body,
    params,
    requestId: 'todo-unit',
  };
}

test('todo route handlers render widget and list fragments from persisted data', async () => {
  const widgetResponse = createResponse();
  await getToDoWidget(createRequest(), widgetResponse);

  assert.equal(widgetResponse.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.match(widgetResponse.body, /<fragment target="#demoCanvas\(innerHTML\)">/);
  assert.match(widgetResponse.body, /Alpha &lt;safe&gt;/);

  const listResponse = createResponse();
  await listTodos(createRequest(), listResponse);

  assert.match(listResponse.body, /<fragment target="#todoList\(outerHTML\)">/);
  assert.match(listResponse.body, /todo-1/);
  assert.match(listResponse.body, /todo-2/);
});

test('createTodo validates input and persists normalized todos', async () => {
  const rejectedResponse = createResponse();
  await createTodo(createRequest({ body: { todo: '   ' } }), rejectedResponse);

  assert.equal(rejectedResponse.statusCode, 400);
  assert.equal(rejectedResponse.body, 'Missing todo text');

  const createdResponse = createResponse();
  await createTodo(createRequest({ body: { todo: ['  Gamma  '] } }), createdResponse);

  assert.match(createdResponse.body, /Gamma/);
  const todos = await loadTodos();
  assert.equal(todos.length, 3);
  assert.equal(todos.at(-1).text, 'Gamma');
});

test('createTodo serializes concurrent writes without losing items or duplicating ids', async () => {
  const labels = ['Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta'];

  const responses = await Promise.all(labels.map(async (label) => {
    const response = createResponse();
    await createTodo(createRequest({ body: { todo: ` ${label} ` } }), response);
    return response;
  }));

  for (const response of responses) {
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /<fragment target="#todoList\(outerHTML\)">/);
  }

  const todos = await loadTodos();
  const ids = todos.map(todo => todo.id);
  assert.equal(todos.length, fixtureTodos.length + labels.length);
  assert.equal(new Set(ids).size, ids.length);
  for (const label of labels) {
    assert.equal(todos.filter(todo => todo.text === label).length, 1);
  }
});

test('createTodo waits for a cross-process persistence lock before writing', async () => {
  await writeFile(lockPath, 'held-by-unit-test');
  const createdResponse = createResponse();
  let completed = false;
  const createPromise = createTodo(createRequest({ body: { todo: ' Locked write ' } }), createdResponse)
    .finally(() => {
      completed = true;
    });

  await delay(35);
  assert.equal(completed, false);

  await rm(lockPath, { force: true });
  await createPromise;

  assert.equal(createdResponse.statusCode, 200);
  assert.equal(completed, true);
  assert.equal((await loadTodos()).some(todo => todo.text === 'Locked write'), true);
});

test('createTodo removes stale dead-owner lock files before writing', async () => {
  const originalStaleMs = process.env.HTMLEX_TODO_LOCK_STALE_MS;
  const originalRetryMs = process.env.HTMLEX_TODO_LOCK_RETRY_MS;
  process.env.HTMLEX_TODO_LOCK_STALE_MS = '1';
  process.env.HTMLEX_TODO_LOCK_RETRY_MS = '1';

  try {
    await writeFile(lockPath, JSON.stringify({
      pid: -1,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    }));
    await delay(5);

    const createdResponse = createResponse();
    await createTodo(createRequest({ body: { todo: ' Stale lock recovered ' } }), createdResponse);

    assert.equal(createdResponse.statusCode, 200);
    assert.equal((await loadTodos()).some(todo => todo.text === 'Stale lock recovered'), true);
  } finally {
    if (originalStaleMs === undefined) {
      delete process.env.HTMLEX_TODO_LOCK_STALE_MS;
    } else {
      process.env.HTMLEX_TODO_LOCK_STALE_MS = originalStaleMs;
    }

    if (originalRetryMs === undefined) {
      delete process.env.HTMLEX_TODO_LOCK_RETRY_MS;
    } else {
      process.env.HTMLEX_TODO_LOCK_RETRY_MS = originalRetryMs;
    }
  }
});

test('item and edit handlers return found fragments and 404 for missing ids', async () => {
  const itemResponse = createResponse();
  await getTodoItem(createRequest({ params: { id: '1' } }), itemResponse);

  assert.match(itemResponse.body, /<fragment target="#editForm-1\(outerHTML\)">/);
  assert.match(itemResponse.body, /Alpha &lt;safe&gt;/);

  const editResponse = createResponse();
  await getEditTodoForm(createRequest({ params: { id: '2' } }), editResponse);

  assert.match(editResponse.body, /<fragment target="#todo-2\(outerHTML\)">/);
  assert.match(editResponse.body, /id="editForm-2"/);

  const missingResponse = createResponse();
  await getTodoItem(createRequest({ params: { id: '999' } }), missingResponse);

  assert.equal(missingResponse.statusCode, 404);
  assert.equal(missingResponse.body, 'Todo not found');
});

test('updateTodo validates, persists, and renders the updated item', async () => {
  const blankResponse = createResponse();
  await updateTodo(createRequest({
    params: { id: '1' },
    body: { todo: '' },
  }), blankResponse);

  assert.equal(blankResponse.statusCode, 400);
  assert.equal(blankResponse.body, 'Missing updated todo text');

  const updatedResponse = createResponse();
  await updateTodo(createRequest({
    params: { id: '1' },
    body: { todo: ' Updated value ' },
  }), updatedResponse);

  assert.match(updatedResponse.body, /<fragment target="#editForm-1\(outerHTML\)">/);
  assert.match(updatedResponse.body, /Updated value/);
  assert.equal((await loadTodos())[0].text, 'Updated value');
});

test('deleteTodo removes existing items and returns 404 for missing ids', async () => {
  const deletedResponse = createResponse();
  await deleteTodo(createRequest({ params: { id: '1' } }), deletedResponse);

  assert.match(deletedResponse.body, /<fragment target="#todoList\(outerHTML\)">/);
  assert.equal((await loadTodos()).some(todo => todo.id === 1), false);

  const missingResponse = createResponse();
  await deleteTodo(createRequest({ params: { id: '999' } }), missingResponse);

  assert.equal(missingResponse.statusCode, 404);
  assert.equal(missingResponse.body, 'Todo not found');
});

test('loadTodos surfaces invalid JSON unless failClosed is explicitly requested', async () => {
  await writeFile(dataPath, '{not valid json');

  await assert.rejects(() => loadTodos(), SyntaxError);
  assert.deepEqual(await loadTodos({ failClosed: true }), []);
});

test('todo widget and list handlers return server errors for invalid JSON', async () => {
  await writeFile(dataPath, '{not valid json');

  const widgetResponse = createResponse();
  await getToDoWidget(createRequest(), widgetResponse);

  assert.equal(widgetResponse.statusCode, 500);
  assert.equal(widgetResponse.body, 'Internal server error');

  const listResponse = createResponse();
  await listTodos(createRequest(), listResponse);

  assert.equal(listResponse.statusCode, 500);
  assert.equal(listResponse.body, 'Internal server error');
});

test('todo widget and list handlers reject non-array persistence data', async () => {
  await writeFile(dataPath, JSON.stringify({ todos: fixtureTodos }, null, 2));

  const widgetResponse = createResponse();
  await getToDoWidget(createRequest(), widgetResponse);

  assert.equal(widgetResponse.statusCode, 500);
  assert.equal(widgetResponse.body, 'Internal server error: Invalid todo data');

  const listResponse = createResponse();
  await listTodos(createRequest(), listResponse);

  assert.equal(listResponse.statusCode, 500);
  assert.equal(listResponse.body, 'Internal server error: Invalid todo data');
});
