// server/api.js
/**
 * @fileoverview Main server application for the HTMLeX Todo App.
 * Combines Express API endpoints, static file serving, and a WebSocket counter.
 */

import express from 'express';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
import { WebSocketServer } from 'ws';
import {
  renderTodoItem,
  renderTodoList,
  renderEditForm,
  renderCounter
} from './components.js';

const app = express();
const PORT = process.env.PORT || 5500;

// Get __dirname in ES modules.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from the "public" directory.
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for form data processing.
const upload = multer();

// Path to the data file storing todos.
const dataPath = path.join(__dirname, 'data.json');

/**
 * Loads todos from the data file.
 * @returns {Array<Object>} The array of todo objects.
 */
const loadTodos = () => {
  try {
    const data = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
};

/**
 * Writes the provided todos array to the data file.
 * @param {Array<Object>} todos - The todos to write.
 */
const writeTodos = (todos) => {
  fs.writeFileSync(dataPath, JSON.stringify(todos, null, 2));
};

/**
 * Wraps an HTML snippet in an HTMLeX fragment structure.
 * @param {string} targetSelector - e.g. "#todoList(innerHTML)".
 * @param {string} htmlSnippet - The HTML snippet to wrap.
 * @returns {string} The complete fragment response.
 */
const wrapFragment = (targetSelector, htmlSnippet) => {
  return `<fragments><fragment target="${targetSelector}">${htmlSnippet}</fragment></fragments>`;
};

// ------------------------------
// API Endpoints
// ------------------------------

// CREATE: Add a new todo
app.post('/todos/create', upload.none(), (req, res) => {
  const todos = loadTodos();
  // If req.body.todo is an array, take the first element.
  const newText = Array.isArray(req.body.todo) ? req.body.todo[0] : req.body.todo;
  if (!newText) return res.status(400).send('Missing todo text');
  const newTodo = { id: Date.now(), text: newText };
  todos.push(newTodo);
  writeTodos(todos);
  const htmlSnippet = renderTodoList(todos);
  res.send(wrapFragment('#todoList(innerHTML)', htmlSnippet));
});

// READ: List all todos
app.get('/todos/list', (req, res) => {
  console.info('[SERVER] GET /todos/list');
  const todos = loadTodos();
  const htmlSnippet = renderTodoList(todos);
  res.send(wrapFragment('#todoList(innerHTML)', htmlSnippet));
});

// READ SINGLE: Return a single todo item
app.get('/todos/item/:id', (req, res) => {
  const todos = loadTodos();
  const id = parseInt(req.params.id, 10);
  const todo = todos.find(t => t.id === id);
  if (!todo) return res.status(404).send('Todo not found');
  const htmlSnippet = renderTodoItem(todo);
  res.send(wrapFragment(`#todo-${id}(outerHTML)`, htmlSnippet));
});

// EDIT FORM: Return an edit form for a todo item
app.get('/todos/edit/:id', (req, res) => {
  const todos = loadTodos();
  const id = parseInt(req.params.id, 10);
  const todo = todos.find(t => t.id === id);
  if (!todo) return res.status(404).send('Todo not found');
  const htmlSnippet = renderEditForm(todo);
  res.send(wrapFragment(`#todo-${id}(outerHTML)`, htmlSnippet));
});

// UPDATE: Update a todo
app.put('/todos/:id', upload.none(), (req, res) => {
  const todos = loadTodos();
  const id = parseInt(req.params.id, 10);
  const index = todos.findIndex(todo => todo.id === id);
  if (index === -1) return res.status(404).send('Todo not found');
  const newText = Array.isArray(req.body.todo) ? req.body.todo[0] : req.body.todo;
  if (!newText) return res.status(400).send('Missing updated todo text');
  todos[index].text = newText;
  writeTodos(todos);
  const updatedHtml = renderTodoItem(todos[index]);
  res.send(wrapFragment(`#todo-${id}(outerHTML)`, updatedHtml));
});

// DELETE: Remove a todo
app.delete('/todos/:id', (req, res) => {
  const todos = loadTodos();
  const id = parseInt(req.params.id, 10);
  const index = todos.findIndex(todo => todo.id === id);
  if (index === -1) return res.status(404).send('Todo not found');
  todos.splice(index, 1);
  writeTodos(todos);
  res.send(wrapFragment(`#todo-${id}(remove)`, '<div class="fade-out"></div>'));
});

// ------------------------------
// WebSocket Counter
// ------------------------------

/* Create an HTTP server from the Express app */
const server = http.createServer(app);

/* Create a WebSocket server on path '/counter' */
const wss = new WebSocketServer({ server, path: '/counter' });

wss.on('connection', (ws) => {
  console.log('WebSocket connection established for counter');
  let count = 0;
  const interval = setInterval(() => {
    count++;
    // Use the renderCounter component to generate the HTML snippet.
    const html = renderCounter(count);
    ws.send(html);
  }, 1000);

  ws.on('close', () => {
    console.log('WebSocket connection closed for counter');
    clearInterval(interval);
  });
});

/**
 * Starts the server on the given port.
 * @param {number} port - The port number to listen on.
 */
export function startServer(port = PORT) {
  server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

// If this module is run directly, start the server.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
