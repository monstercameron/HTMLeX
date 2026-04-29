/**
 * @fileoverview Domain logic for managing todo items.
 * This module handles CRUD operations for todos by interacting with a JSON data file.
 * It provides functions for loading, creating, updating, and deleting todo items.
 *
 * @module features/todos
 */

import { access, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  renderTodoItem,
  renderTodoList,
  renderEditForm,
  TodoWidget,
} from '../components/Components.js';
import { render } from '../components/HTMLeX.js';
import { sendFragmentResponse, sendServerError } from './responses.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TODOS_FILE = path.join(__dirname, '..', 'persistence/data.json');

/**
 * Ensures that the data file exists.
 * If it does not exist, an empty JSON array is written to the file.
 * @async
 * @returns {Promise<void>}
 */
async function ensureDataFile() {
  try {
    await access(TODOS_FILE);
  } catch {
    await writeFile(TODOS_FILE, JSON.stringify([], null, 2));
  }
}

/**
 * Loads todos from the data file.
 * @async
 * @returns {Promise<Array<Object>>} Array of todo objects.
 */
export async function loadTodos() {
  await ensureDataFile();
  try {
    const data = await readFile(TODOS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading todos:', error);
    return [];
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
      console.error('Loaded todos is not an array:', todos);
      sendServerError(res, 'Internal server error: Invalid todo data');
      return;
    }

    sendFragmentResponse(res, '#demoCanvas(innerHTML)', TodoWidget(todos));
  } catch (error) {
    console.error('Error in getToDoWidget:', error);
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
  try {
    await writeFile(TODOS_FILE, JSON.stringify(todos, null, 2));
  } catch (error) {
    console.error('Error writing todos:', error);
    throw error;
  }
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
    const todos = await loadTodos();
    const submittedText = Array.isArray(req.body.todo) ? req.body.todo[0] : req.body.todo;
    const normalizedText = String(submittedText ?? '').trim();
    if (!normalizedText) {
      console.error('Missing todo text in request');
      if (!res.headersSent) {
        res.status(400).send('Missing todo text');
      }
      return;
    }
    const newTodo = { id: Date.now(), text: normalizedText };
    todos.push(newTodo);
    await writeTodos(todos);
    sendFragmentResponse(res, '#todoList(outerHTML)', render(renderTodoList(todos)));
  } catch (error) {
    console.error('Error in createTodo:', error);
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
      console.error('Loaded todos is not an array:', todos);
      sendServerError(res, 'Internal server error: Invalid todo data');
      return;
    }
    sendFragmentResponse(res, '#todoList(outerHTML)', render(renderTodoList(todos)));
  } catch (error) {
    console.error('Error in listTodos:', error);
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
    const id = parseInt(req.params.id, 10);
    const todo = todos.find(t => t.id === id);
    if (!todo) {
      console.error(`Todo with id ${id} not found`);
      if (!res.headersSent) return res.status(404).send('Todo not found');
      return;
    }
    sendFragmentResponse(res, `#editForm-${id}(outerHTML)`, render(renderTodoItem(todo)));
  } catch (error) {
    console.error('Error in getTodoItem:', error);
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
    const id = parseInt(req.params.id, 10);
    const todo = todos.find(t => t.id === id);
    if (!todo) {
      console.error(`Todo with id ${id} not found`);
      if (!res.headersSent) return res.status(404).send('Todo not found');
      return;
    }
    sendFragmentResponse(res, `#todo-${id}(outerHTML)`, renderEditForm(todo));
  } catch (error) {
    console.error('Error in getEditTodoForm:', error);
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
    const todos = await loadTodos();
    const id = parseInt(req.params.id, 10);
    const index = todos.findIndex(todo => todo.id === id);
    if (index === -1) {
      console.error(`Todo with id ${id} not found`);
      if (!res.headersSent) return res.status(404).send('Todo not found');
      return;
    }
    const submittedText = Array.isArray(req.body.todo) ? req.body.todo[0] : req.body.todo;
    const normalizedText = String(submittedText ?? '').trim();
    if (!normalizedText) {
      console.error('Missing updated todo text');
      if (!res.headersSent) return res.status(400).send('Missing updated todo text');
      return;
    }
    todos[index].text = normalizedText;
    await writeTodos(todos);
    sendFragmentResponse(res, `#editForm-${id}(outerHTML)`, render(renderTodoItem(todos[index])));
  } catch (error) {
    console.error('Error in updateTodo:', error);
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
    const todos = await loadTodos();
    const id = parseInt(req.params.id, 10);
    const index = todos.findIndex(todo => todo.id === id);
    if (index === -1) {
      console.error(`Todo with id ${id} not found`);
      if (!res.headersSent) return res.status(404).send('Todo not found');
      return;
    }
    todos.splice(index, 1);
    await writeTodos(todos);
    sendFragmentResponse(res, '#todoList(outerHTML)', render(renderTodoList(todos)));
  } catch (error) {
    console.error('Error in deleteTodo:', error);
    sendServerError(res);
  }
}

