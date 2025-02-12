// server/components.js
/**
 * @fileoverview HTML Components for HTMLeX Server Responses.
 * This module exports functions to render various HTML components.
 * Each component includes explicit event triggers (e.g. trigger="click")
 * so that the client‑side HTMLeX handler picks up and fires the API call or signal.
 */

import { tag, div, button, span, render } from './HTMLeX.js'; // Ensure this helper library is available

/**
 * Renders a single todo item.
 * @param {Object} todo - A todo object with properties { id, text }.
 * @returns {string} The rendered HTML string for the todo item.
 */
export function renderTodoItem(todo) {
  return render(
    div(
      {
        class: 'todo-item p-4 bg-gray-800 rounded-lg shadow-md fade-in',
        id: `todo-${todo.id}`
      },
      span({ class: 'todo-text text-lg text-gray-100' }, todo.text),
      ' ',
      // Delete button with explicit trigger event.
      button(
        {
          DELETE: `/todos/${todo.id}`,
          target: `#todo-${todo.id}(remove)`,
          trigger: 'click',
          class: 'delete-btn btn bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md shake'
        },
        'Delete'
      ),
      ' ',
      // Edit button with explicit trigger event.
      button(
        {
          GET: `/todos/edit/${todo.id}`,
          target: `#todo-${todo.id}(innerHTML)`,
          trigger: 'click',
          class: 'edit-btn btn bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md shake'
        },
        'Edit'
      )
    )
  );
}

/**
 * Renders the full todo list.
 * @param {Array<Object>} todos - An array of todo objects.
 * @returns {string} The rendered HTML string for the todo list.
 */
export function renderTodoList(todos) {
  const items = todos.map(todo => renderTodoItem(todo)).join('');
  return render(div({ class: 'todo-list space-y-4 fade-in' }, items));
}

/**
 * Renders an edit form for a given todo item.
 * @param {Object} todo - A todo object.
 * @returns {string} The rendered HTML string for the edit form.
 */
export function renderEditForm(todo) {
  const inputField = tag('input', {
    type: 'text',
    name: 'todo',
    value: todo.text,
    class: 'fancy-input mt-2 block w-full bg-gray-700 border border-gray-600 rounded-md p-3 text-gray-100 placeholder-gray-400'
  });
  const editForm = div(
    { id: `editForm-${todo.id}`, class: 'edit-form space-y-2 fade-in' },
    inputField,
    div(
      { class: 'flex space-x-2' },
      button(
        {
          PUT: `/todos/${todo.id}`,
          source: `#editForm-${todo.id} input[name='todo']`,
          target: `#todo-${todo.id}(innerHTML)`,
          trigger: 'click',
          class: 'save-btn btn bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md'
        },
        'Save'
      ),
      button(
        {
          GET: `/todos/item/${todo.id}`,
          target: `#todo-${todo.id}(innerHTML)`,
          trigger: 'click',
          class: 'cancel-btn btn bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md'
        },
        'Cancel'
      )
    )
  );
  return render(editForm);
}

/**
 * Renders a counter component.
 * @param {number} count - The current count value.
 * @returns {string} The rendered HTML string for the counter.
 */
export function renderCounter(count) {
  return render(
    div(
      { class: 'counter-text text-xl font-bold text-center' },
      `Counter: ${count}`
    )
  );
}
