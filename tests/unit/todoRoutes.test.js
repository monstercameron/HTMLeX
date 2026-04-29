import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after, before, beforeEach } from 'node:test';
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

const dataPath = path.resolve(import.meta.dirname, '../../src/persistence/data.json');
const fixtureTodos = [
  { id: 1, text: 'Alpha <safe>' },
  { id: 2, text: 'Beta' },
];
let originalData;

before(async () => {
  try {
    originalData = await readFile(dataPath, 'utf8');
  } catch {
    originalData = null;
  }
});

beforeEach(async () => {
  await writeFile(dataPath, JSON.stringify(fixtureTodos, null, 2));
});

after(async () => {
  if (originalData === null) {
    await rm(dataPath, { force: true });
    return;
  }

  await writeFile(dataPath, originalData);
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

test('loadTodos fails closed to an empty list for invalid JSON', async () => {
  await writeFile(dataPath, '{not valid json');

  assert.deepEqual(await loadTodos(), []);
});
