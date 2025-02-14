/**
 * @fileoverview HTML Components for HTMLeX Server Responses.
 * Uses the HTMLeX.js API to generate HTML nodes and wrap them in fragment structures.
 */

import { tag, div, button, span, render } from './HTMLeX.js';

/**
 * Creates an HTMLeX fragment wrapping the given content.
 * @param {string} target - e.g. "#todoList(innerHTML)"
 * @param {string} content - The HTML content to include inside the fragment.
 * @param {Object} [options] - Additional options.
 * @param {boolean} [options.loading=false] - If true, adds a "loading" attribute to the fragment.
 * @returns {string} The complete fragment HTML.
 */
export function renderFragment(target, content, options = {}) {
  const attrs = { target };
  if (options.loading) {
    attrs.loading = true;
  }
  return render(tag("fragment", attrs, content));
}

/**
 * Renders a single todo item.
 * @param {Object} todo - A todo object with properties { id, text }.
 * @returns {string} The rendered HTML for the todo item.
 */
export function renderTodoItem(todo) {
  return render(
    div(
      {
        class: 'todo-item p-4 bg-gray-800 rounded-lg shadow-md fade-in',
        id: 'todo-' + todo.id
      },
      // Display the todo text.
      span({ class: 'todo-text text-lg text-gray-100' }, todo.text),
      " ",
      // Delete button triggers a DELETE API call to remove the todo.
      button(
        {
          delete: '/todos/' + todo.id,
          target: '#todo-' + todo.id + '(remove)',
          trigger: 'click',
          class: 'delete-btn btn bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md shake'
        },
        "Delete"
      ),
      " ",
      // Edit button triggers a GET API call to load an edit form or update the todo.
      button(
        {
          get: '/todos/edit/' + todo.id,
          target: '#todo-' + todo.id + '(innerHTML)',
          trigger: 'click',
          class: 'edit-btn btn bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md shake'
        },
        "Edit"
      )
    )
  );
}

/**
 * Renders the full todo list.
 * @param {Array<Object>} todos - An array of todo objects.
 * @returns {string} The rendered HTML for the todo list.
 */
export function renderTodoList(todos) {
  const items = todos.map(todo => renderTodoItem(todo)).join('');
  return render(div({ class: 'todo-list space-y-4 fade-in' }, items));
}

/**
 * Renders an edit form for a todo item.
 * @param {Object} todo - A todo object.
 * @returns {string} The rendered HTML for the edit form.
 */
export function renderEditForm(todo) {
  const inputField = tag('input', {
    type: 'text',
    name: 'todo',
    value: todo.text,
    class: 'fancy-input mt-2 block w-full bg-gray-700 border border-gray-600 rounded-md p-3 text-gray-100 placeholder-gray-400'
  });

  // Use a <form> element so that the input value is included in the request payload.
  const editForm = tag(
    'form',
    {
      id: 'editForm-' + todo.id,
      put: '/todos/' + todo.id, // Lowercase "put" to match registration detection.
      target: '#todo-' + todo.id + '(innerHTML)',
      sequential: '150',
      class: 'edit-form space-y-2 fade-in'
    },
    inputField,
    tag(
      'div',
      { class: 'flex space-x-2' },
      tag(
        'button',
        {
          type: 'submit',
          class: 'save-btn btn bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md'
        },
        "Save"
      ),
      tag(
        'button',
        {
          get: '/todos/item/' + todo.id,
          target: '#editform-' + todo.id + '(innerHTML)',
          trigger: 'click',
          type: 'button', // Prevent form submission.
          class: 'cancel-btn btn bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md'
        },
        "Cancel"
      )
    )
  );

  return render(editForm);
}

/**
 * Renders a counter component.
 * @param {number} count - The current count.
 * @returns {string} The rendered HTML for the counter.
 */
export function renderCounter(count) {
  return render(div({ class: 'counter-text text-xl font-bold text-center' }, "Counter: " + count));
}

/**
 * Renders a loading message.
 * @param {string} message - The loading message.
 * @returns {string} The rendered HTML for the loading message.
 */
export function renderLoadingMessage(message) {
  return render(div({ class: 'text-center text-gray-400' }, message));
}

/**
 * Renders a notification message.
 * @param {string} message - The notification text.
 * @returns {string} The rendered HTML for the notification.
 */
export function renderNotificationMessage(message) {
  return render(div({ class: 'p-4 bg-green-700 rounded-md text-green-100', timer: "5000", target: "this(remove)" }, message));
}

/**
 * Renders a sequential step message.
 * @param {string} message - The step message.
 * @returns {string} The rendered HTML for the sequential step.
 */
export function renderSequentialStep(message) {
  return render(div({ class: 'p-2 bg-red-700 rounded-md text-red-100' }, message));
}

/**
 * Renders a chat message.
 * @param {string} username - The sender's username.
 * @param {string} text - The chat message text.
 * @returns {string} The rendered HTML for the chat message.
 */
export function renderChatMessage(username, text) {
  return render(
    div(
      { class: 'p-2 bg-gray-700 rounded-md text-gray-100' },
      span({}, username + ": "),
      span({}, text)
    )
  );
}

/**
 * Renders a default index page in case no index.html is found.
 * @returns {string} The complete HTML for the default page.
 */
export function renderDefaultIndexPage() {
  return render(
    tag('html', { lang: 'en' },
      tag('head', {},
        tag('meta', { charset: 'UTF-8' }),
        tag('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }),
        tag('title', {}, "Todo App")
      ),
      tag('body', {},
        tag('h1', {}, "Welcome to the Todo App"),
        tag('p', {}, "No index.html found in the public folder. Please add one or customize this page.")
      )
    )
  );
}
