/**
 * @fileoverview Domain logic for managing todo items.
 * This module handles CRUD operations for todos by interacting with a JSON data file.
 * It provides functions for loading, creating, updating, and deleting todo items.
 *
 * @module features/todos
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  renderTodoItem,
  renderTodoList,
  renderEditForm,
  TodoWidget,
  renderFragment
} from '../components/Components.js';

// Determine the directory name of this module.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the data file storing todos.
const dataPath = path.join(__dirname, '..', 'persistence/data.json');

/**
 * Ensures that the data file exists.
 * If it does not exist, an empty JSON array is written to the file.
 * @async
 * @returns {Promise<void>}
 */
async function ensureDataFile() {
  try {
    await fs.promises.access(dataPath);
  } catch (err) {
    console.log('Data file not found, creating empty file');
    await fs.promises.writeFile(dataPath, JSON.stringify([], null, 2));
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
    const data = await fs.promises.readFile(dataPath, 'utf8');
    console.log('Loaded todos data:', data);
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading todos:', err);
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
      if (!res.headersSent) {
        return res.status(500).send('Internal server error: Invalid todo data');
      }
      return;
    }

    const htmlSnippet = TodoWidget(todos);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderFragment('#demoCanvas(innerHTML)', htmlSnippet));
  } catch (err) {
    console.error('Error in getToDoWidget:', err);
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
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
    await fs.promises.writeFile(dataPath, JSON.stringify(todos, null, 2));
    console.log('Successfully wrote todos to file');
  } catch (err) {
    console.error('Error writing todos:', err);
    throw err;
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
    const newText = Array.isArray(req.body.todo) ? req.body.todo[0] : req.body.todo;
    if (!newText) {
      console.error('Missing todo text in request');
      if (!res.headersSent) {
        res.status(400).send('Missing todo text');
      }
      return;
    }
    const newTodo = { id: Date.now(), text: newText };
    todos.push(newTodo);
    await writeTodos(todos);
    const htmlSnippet = renderTodoList(todos);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderFragment('#todoList(innerHTML)', htmlSnippet));
  } catch (err) {
    console.error('Error in createTodo:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
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
      if (!res.headersSent)
        return res.status(500).send('Internal server error: Invalid todo data');
      return;
    }
    const htmlSnippet = renderTodoList(todos);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderFragment('#todoList(innerHTML)', htmlSnippet));
  } catch (err) {
    console.error('Error in listTodos:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
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
    const htmlSnippet = renderTodoItem(todo);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderFragment(`#editForm-${id}(outerHTML)`, htmlSnippet));
  } catch (err) {
    console.error('Error in getTodoItem:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
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
    const htmlSnippet = renderEditForm(todo);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderFragment(`#todo-${id}(outerHTML)`, htmlSnippet));
  } catch (err) {
    console.error('Error in getEditTodoForm:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
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
    const newText = Array.isArray(req.body.todo) ? req.body.todo[0] : req.body.todo;
    if (!newText) {
      console.error('Missing updated todo text');
      if (!res.headersSent) return res.status(400).send('Missing updated todo text');
      return;
    }
    todos[index].text = newText;
    await writeTodos(todos);
    const updatedTodoItem = renderTodoItem(todos[index]);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderFragment(`#todo-${id}(outerHTML)`, updatedTodoItem));
  } catch (err) {
    console.error('Error in updateTodo:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
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
    const updatedList = renderTodoList(todos);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderFragment('#todoList(innerHTML)', updatedList));
  } catch (err) {
    console.error('Error in deleteTodo:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
}

