/**
 * @fileoverview Components for HTMLeX responses built entirely using the HTMLeX JavaScript API.
 * This file composes virtual nodes using functions imported from HTMLeX.js.
 */

import { tags, tag, render } from './HTMLeX.js';

const {
  html,
  head,
  meta,
  title,
  script,
  style,
  body,
  div,
  header,
  h1,
  h2,
  p,
  aside,
  ul,
  li,
  span,
  button,
  a,
  section,
  footer,
  input,
  label,
  form,
  br
} = tags;

/* ===========================
   Header Component
   =========================== */

/**
 * Renders the header component.
 *
 * @param {Object} params
 * @param {string} params.title - Main title text.
 * @param {string} [params.subtitle] - Optional subtitle text.
 * @param {string} [params.className] - Additional CSS classes.
 * @returns {Object} A virtual node representing the header.
 */
export function Header({ title, subtitle = '', className = '' } = {}) {
  return header(
    { class: `bg-blue-600 dark:bg-blue-800 shadow-md ${className}` },
    div(
      { class: 'container mx-auto px-4 py-4' },
      h1(
        { class: 'text-3xl font-bold text-white animate-fadeIn' },
        title
      ),
      ...(subtitle ? [p({ class: 'text-white' }, subtitle)] : [])
    )
  );
}

/* ===========================
   Demo Atomic Components
   =========================== */

/**
 * Renders the decorative background shapes for a demo item.
 *
 * @param {Object} params
 * @param {string} params.bgShape1 - CSS classes for the first background shape.
 * @param {string} params.bgShape2 - CSS classes for the second background shape.
 * @returns {Object[]} An array of virtual nodes.
 */
export function DemoBackground({ bgShape1, bgShape2 }) {
  return [
    div({
      class: `absolute -top-8 -left-8 w-32 h-32 ${bgShape1} rounded-full mix-blend-multiply filter blur-3xl opacity-50`,
    }),
    div({
      class: `absolute -bottom-8 -right-8 w-40 h-40 ${bgShape2} rounded-full mix-blend-multiply filter blur-3xl opacity-50`,
    }),
  ];
}

/**
 * Renders the header section of a demo item.
 *
 * @param {Object} params
 * @param {string} params.icon - Demo icon.
 * @param {string} params.title - Demo title.
 * @param {string} params.subtitle - Demo subtitle.
 * @returns {Object} A virtual node for the demo header.
 */
export function DemoHeader({ icon, title, subtitle }) {
  return div(
    { class: 'flex items-center' },
    div(
      { class: 'w-12 h-12 flex items-center justify-center bg-white dark:bg-gray-800 rounded-full shadow-lg mr-4' },
      span({ class: 'text-2xl' }, icon)
    ),
    div(
      {},
      h2({ class: 'text-2xl font-extrabold text-gray-800 dark:text-gray-100' }, title),
      span({ class: 'text-sm text-gray-600 dark:text-gray-400' }, subtitle)
    )
  );
}

/**
 * Renders the description of a demo item.
 *
 * @param {string} description - Demo description.
 * @returns {Object} A virtual node for the description.
 */
export function DemoDescription(description) {
  return p({ class: 'text-gray-700 dark:text-gray-300' }, description);
}

/**
 * Renders the highlights section of a demo item.
 *
 * @param {string} highlights - Demo highlights text.
 * @returns {Object} A virtual node for the highlights.
 */
export function DemoHighlights(highlights) {
  return div(
    { class: 'p-3 bg-white dark:bg-gray-800 rounded-xl shadow-md' },
    p(
      { class: 'text-sm text-gray-600 dark:text-gray-400' },
      span({}, 'Highlights:'), "<br />",
      ' ',
      highlights.join("<br />")
    )
  );
}

/**
 * Renders the action buttons for a demo item.
 *
 * @param {Object} params
 * @param {string} params.launchButtonText - Text for the launch button.
 * @param {string} params.learnMoreText - Text for the learn more link.
 * @param {string} params.learnMoreHref - URL for the learn more link.
 * @param {Object} gradients
 * @param {string} gradients.buttonGradient - CSS classes for the button.
 * @param {string} gradients.linkColor - CSS classes for the link.
 * @returns {Object} A virtual node for the actions.
 */
export function DemoActions(
  { launchButtonText, learnMoreText, learnMoreHref, initDemoHref },
  { buttonGradient, linkColor }
) {
  return div(
    { class: 'flex items-center justify-between' },
    button(
      {
        class: `px-6 py-2 ${buttonGradient} text-white font-semibold rounded-full shadow-md hover:transition transform hover:scale-105`, "GET": initDemoHref
      },
      launchButtonText
    ),
    a(
      { href: learnMoreHref, class: `text-sm font-medium ${linkColor} hover:underline` },
      learnMoreText
    )
  );
}

/* ===========================
   Composite Demo Components
   =========================== */

/**
 * Composes a single demo item from atomic components.
 *
 * @param {Object} demo - Demo data.
 * @returns {Object} A virtual node representing the demo item.
 */
export function DemoItem(demo) {
  return li(
    {
      class: `relative p-4 ${demo.gradients.container} rounded-2xl shadow-2xl overflow-hidden transform transition duration-300 hover:scale-105 hover:shadow-3xl`,
    },
    ...DemoBackground({
      bgShape1: demo.gradients.bgShape1,
      bgShape2: demo.gradients.bgShape2,
    }),
    div(
      { class: 'relative z-10 flex flex-col space-y-4' },
      DemoHeader({
        icon: demo.icon,
        title: demo.title,
        subtitle: demo.subtitle,
      }),
      DemoDescription(demo.description),
      DemoHighlights(demo.highlights),
      DemoActions(
        {
          launchButtonText: demo.launchButtonText,
          learnMoreText: demo.learnMoreText,
          learnMoreHref: demo.learnMoreHref,
          initDemoHref: demo.initDemoHref,
        },
        {
          buttonGradient: demo.gradients.buttonGradient,
          linkColor: demo.gradients.linkColor,
        }
      )
    )
  );
}

/**
 * Renders a list of demo items.
 *
 * @param {Object[]} demos - Array of demo data objects.
 * @returns {Object} A virtual node for the demo list.
 */
export function DemoList(demos) {
  const items = demos.map((demo) => DemoItem(demo));
  return ul({ class: 'space-y-6 p-4' }, ...items);
}

/**
 * Renders the aside component containing demos.
 *
 * @param {Object} params
 * @param {Object[]} params.demos - Array of demo data objects.
 * @param {string} [params.asideClass] - Additional CSS classes.
 * @returns {Object} A virtual node representing the aside.
 */
export function Aside({ demos, asideClass = '' } = {}) {
  return aside(
    { class: `lg:w-1/3 bg-white dark:bg-gray-800 rounded-lg shadow-md h-[70vh] overflow-y-auto ${asideClass}` },
    div(
      { class: 'p-4 border-b border-gray-200 dark:border-gray-700' },
      h2({ class: 'text-xl font-semibold' }, 'Demos')
    ),
    DemoList(demos)
  );
}

/* ===========================
   Canvas Component
   =========================== */

/**
 * Renders the canvas component.
 *
 * @param {Object} params
 * @param {string} params.headerText - Header text for the canvas.
 * @param {number|string} [params.clickCount=0] - Initial click count.
 * @param {string} [params.sectionClass] - Additional CSS classes.
 * @returns {Object} A virtual node representing the canvas.
 */
export function Canvas({ headerText, clickCount = 0, sectionClass = '' } = {}) {
  return section(
    { class: `lg:w-2/3 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 h-[70vh] flex flex-col ${sectionClass}` },
    h2(
      { class: 'text-2xl font-semibold mb-4 flex-shrink-0' },
      headerText
    ),
    div(
      { class: 'flex-grow flex items-center justify-center' },
      div(
        { id: 'clicker', class: 'flex flex-col items-center justify-center' },
        p(
          { id: 'clickCount', class: 'text-3xl font-bold text-gray-800 dark:text-gray-100 mb-4' },
          String(clickCount)
        ),
        button(
          { id: 'clickButton', class: 'px-6 py-3 bg-blue-500 text-white rounded-full shadow-md hover:bg-blue-600 transition transform hover:scale-105' },
          'Click me!'
        )
      )
    )
  );
}

/* ===========================
   Footer Component
   =========================== */

/**
 * Renders the footer component.
 *
 * @param {Object} params
 * @param {number|string} params.year - Year to display.
 * @param {string} params.copyText - Copyright text.
 * @param {Object[]} params.projectLinks - Array of project link objects.
 * @param {string} [params.footerClass] - Additional CSS classes.
 * @returns {Object} A virtual node representing the footer.
 */
export function Footer({ year, copyText, projectLinks, footerClass = '' } = {}) {
  const links = projectLinks.map((link) =>
    a(
      { href: link.href, class: 'flex items-center text-blue-600 dark:text-blue-400 hover:underline' },
      span({ class: 'mr-1' }, link.icon),
      ' ',
      link.text
    )
  );
  return footer(
    { class: `bg-gray-200 dark:bg-gray-800 border-t border-gray-300 dark:border-gray-700 ${footerClass}` },
    div(
      { class: 'container mx-auto px-4 py-4 flex flex-col lg:flex-row justify-between items-center' },
      p({ class: 'text-sm' }, `© ${year} ${copyText}`),
      div({ class: 'flex space-x-4 mt-2 lg:mt-0' }, ...links)
    )
  );
}

/* ===========================
   Full HTML Document Composition
   =========================== */

/**
 * Composes the full HTML document using HTMLeX components.
 *
 * @param {Object} params
 * @param {Object} params.headerProps - Properties for the header.
 * @param {Object[]} params.demos - Array of demo data objects.
 * @param {Object} params.canvasProps - Properties for the canvas.
 * @param {Object} params.footerProps - Properties for the footer.
 * @returns {Object} A virtual node representing the full HTML document.
 */
export function FullHTML({ headerProps, demos, canvasProps, footerProps }) {
  return html(
    { lang: 'en', class: 'dark' },
    head(
      {},
      meta({ charset: 'UTF-8' }),
      meta({ name: 'viewport', content: 'width=device-width, initial-scale=1.0' }),
      title({}, 'HTMLeX playgrounds'),
      script({ src: 'https://cdn.tailwindcss.com' }),
      style(
        {},
        `
        /* Hide scrollbar for Chrome, Safari and Opera */
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        /* Hide scrollbar for IE, Edge and Firefox */
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        `
      )
    ),
    body(
      { class: 'bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans antialiased min-h-screen flex flex-col' },
      Header(headerProps),
      div(
        { class: 'container mx-auto px-4 py-6 flex-1 flex flex-col lg:flex-row gap-6' },
        Aside({ demos }),
        Canvas(canvasProps)
      ),
      Footer(footerProps)
    )
  );
}


/**
 * Creates a virtual DOM node representing an individual todo item using HTMLeX virtual nodes.
 * The node includes action buttons for editing and deleting, styled for dark mode.
 *
 * @param {Object} todo - A todo object.
 * @param {number} todo.id - The unique identifier of the todo.
 * @param {string} todo.text - The text description of the todo.
 * @returns {VNode} A virtual DOM node representing the todo item.
 *
 * @example
 * const todoNode = renderTodoItem({ id: 123, text: 'Buy milk' });
 */
export function renderTodoItem(todo) {
  // Create an edit button that performs a GET request to the edit endpoint.
  const editButton = button(
    {
      GET: `/todos/edit/${todo.id}`,
      class: 'edit-button bg-blue-600 hover:bg-blue-500 text-gray-100 py-1 px-3 rounded'
    },
    'Edit'
  );

  // Create a delete button that performs a DELETE request to the todo endpoint.
  const deleteButton = button(
    {
      DELETE: `/todos/${todo.id}`,
      class: 'delete-button bg-red-600 hover:bg-red-500 text-gray-100 py-1 px-3 rounded'
    },
    'Delete'
  );

  // Wrap the buttons in a container with spacing.
  const actionsDiv = div(
    { class: 'todo-actions flex space-x-2 mt-2' },
    editButton,
    deleteButton
  );

  // Create a span for the todo text with dark mode–friendly styling.
  const todoText = span(
    { class: 'todo-text text-lg font-medium text-gray-200' },
    todo.text
  );

  // Return the virtual DOM node for the todo item.
  return div(
    {
      id: `todo-${todo.id}`,
      class: 'todo-item p-4 border rounded-lg shadow my-2 bg-gray-800 border-gray-700'
    },
    todoText,
    actionsDiv
  );
}

/**
 * Creates a virtual DOM structure representing a list of todo items with dark mode styling.
 * Instead of rendering to HTML immediately, it returns a virtual DOM node with the individual
 * todo nodes spread as children.
 *
 * @param {Array<Object>} todos - An array of todo objects.
 * @returns {VNode} A virtual DOM node representing the todo list.
 *
 * @example
 * const todoListNode = renderTodoList([{ id: 123, text: 'Buy milk' }]);
 * // Later, todoListNode can be rendered to HTML.
 */
export function renderTodoList(todos) {
  if (!todos.length) {
    return div(
      { class: 'no-todos text-gray-400 p-4 bg-gray-800 rounded-lg' },
      'No todos available.'
    );
  }

  // Create an array of virtual DOM nodes for each todo.
  const todoNodes = todos.map(todo => renderTodoItem(todo));

  // Return the container virtual DOM node with the todo nodes spread as children.
  return div(
    { id: 'todoList', class: 'todo-list space-y-4 bg-gray-900 p-4 rounded-lg shadow' },
    ...todoNodes
  );
}

/**
 * Renders an edit form for a given todo item using custom HTMLeX attributes.
 *
 * The form submits a PUT request to update the todo at the endpoint `/todos/{id}`
 * and targets the DOM element with id `todo-{id}` to update its inner HTML.
 * The cancel button uses a GET request to reload the original todo item.
 *
 * @param {Object} todo - A todo object.
 * @param {number} todo.id - The unique identifier of the todo.
 * @param {string} todo.text - The current text of the todo.
 * @returns {string} HTML string representing the edit form.
 *
 * @example
 * const formHtml = renderEditForm({ id: 123, text: 'Buy milk' });
 */
export function renderEditForm(todo) {
  // Input field for editing the todo text.
  const inputField = input({
    type: 'text',
    name: 'todo',
    value: todo.text,
    required: 'true',
    class: 'edit-input bg-gray-700 text-gray-200 border border-gray-600 rounded px-3 py-2'
  });

  // Save button: form submission will trigger the PUT request.
  const saveButton = button(
    { type: 'submit', class: 'mr-2 save-button bg-green-600 hover:bg-green-500 text-gray-100 py-1 px-3 rounded' },
    'Save'
  );

  // Cancel button: triggers a GET request to reload the original todo item.
  const cancelButton = button(
    { GET: `/todos/item/${todo.id}`, class: 'cancel-button bg-red-600 hover:bg-red-500 text-gray-100 py-1 px-3 rounded', target: `#editForm-${todo.id}(outerHTML)`, type: "button" },
    'Cancel'
  );

  // The edit form:
  // - PUT attribute sends the update to `/todos/{id}`
  // - target attribute specifies where the updated HTML should be injected.
  const editForm = form(
    {
      id: `editForm-${todo.id}`,
      class: 'edit-form bg-gray-800 p-4 rounded-lg shadow border border-gray-700',
      PUT: `/todos/${todo.id}`,
      target: `#todo-${todo.id}(innerHTML)`
    },
    inputField,
    br(),
    saveButton,
    cancelButton
  );

  return render(editForm);
}

/**
 * Renders a complete Todo Widget.
 *
 * This function component takes an array of todo objects and returns a virtual node
 * representing the entire todo widget, including a header and a list of todos.
 *
 * Each todo object should have the following properties:
 * @typedef {Object} Todo
 * @property {number|string} id - A unique identifier for the todo.
 * @property {string} text - The todo text.
 * @property {boolean} completed - Flag indicating whether the todo is completed.
 *
 * @param {Object} params - The parameters for the TodoWidget.
 * @param {Todo[]} params.todos - Array of todo objects.
 * @returns {Object} A virtual node representing the todo widget.
 *
 * @example
 * const todos = [
 *   { id: 1, text: 'Buy milk', completed: false },
 *   { id: 2, text: 'Walk the dog', completed: true }
 * ];
 * const todoWidget = TodoWidget({ todos });
 * // Use render(todoWidget) to produce an HTML string.
 */
/**
 * Renders the complete Todo App widget using the HTMLeX API.
 *
 * This function returns the rendered HTML string for a Todo App, which includes
 * a form for adding new todos and a container for displaying the todo list.
 *
 * @param {Object} params
 * @param {Object[]} [params.todos=[]] - Array of todo objects.
 *        Each todo object should have:
 *          - {number|string} id - Unique identifier.
 *          - {string} text - The todo text.
 *          - {boolean} completed - Completion status.
 * @returns {string} The HTML string representing the Todo App widget.
 *
 * @example
 * const todos = [
 *   { id: 1, text: 'Buy milk', completed: false },
 *   { id: 2, text: 'Walk the dog', completed: true }
 * ];
 * const htmlString = TodoWidget({ todos });
 */
export function TodoWidget(todos) {
  return render(
    section(
      { id: 'todoApp', class: 'bg-gray-800 p-6 rounded-lg shadow-lg fade-in' },
      h2(
        { class: 'text-2xl font-semibold mb-4 text-white' },
        'Todo App with Lifecycle Hooks'
      ),
      form(
        {
          POST: '/todos/create',
          target: '#todoList(innerHTML)',
          extras: 'locale=en_US',
          publish: 'todoCreated',
          sequential: '150',
          onbefore: "console.log('Before Todo Create', event)",
          onafter: "console.log('After Todo Create', event)",
          onbeforeSwap: "console.log('Before DOM Swap', event)",
          onafterSwap: "console.log('After DOM Swap', event)",
          class: 'space-y-4',
        },
        div(
          {},
          label(
            { for: 'todoInput', class: 'block text-sm font-medium text-gray-300' },
            'New Todo'
          ),
          input({
            type: 'text',
            id: 'todoInput',
            name: 'todo',
            required: 'true',
            class:
              'mt-2 block w-full bg-gray-700 border border-gray-600 rounded-md p-3 text-gray-100 placeholder-gray-400',
            placeholder: 'Enter your task',
          })
        ),
        button(
          {
            type: 'submit',
            class:
              'w-full btn bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-md',
          },
          'Add Todo'
        )
      ), renderTodoList(todos)
    )
  );
}

/**
 * Wraps HTML content into an HTMLeX fragment for progressive updates.
 *
 * @param {string} target - A CSS selector that identifies the target element.
 * @param {string} htmlContent - The HTML content to be injected.
 * @param {string} [status] - Optional status code to include in the fragment.
 * @returns {string} HTML string representing the fragment.
 *
 * @example
 * const fragHtml = renderFragment('#todoList(innerHTML)', '<div>Updated Content</div>');
 */
export function renderFragment(target, htmlContent, status) {
  // Create attributes for the fragment. Include the target and optional status.
  const attrs = { target };
  if (status) {
    attrs.status = status;
  }
  // Create a virtual fragment node using the HTMLeX tag function.
  const fragmentNode = tag('fragment', attrs, htmlContent);
  // Render the virtual node to an HTML string.
  return render(fragmentNode);
}

/**
 * Renders a counter display.
 *
 * @param {number} counter - The current counter value.
 * @returns {string} HTML string representing the counter display.
 *
 * @example
 * const counterHtml = renderCounter(5);
 */
export function renderCounter(counter) {
  return render(
    div(
      { id: 'counterDisplay', class: 'counter-display' },
      `Counter: ${counter}`
    )
  );
}

/**
 * Renders a loading message with an optional spinner.
 *
 * @param {string} message - The loading message to display.
 * @returns {string} HTML string representing the loading message.
 *
 * @example
 * const loadingHtml = renderLoadingMessage("Loading, please wait...");
 */
export function renderLoadingMessage(message) {
  return render(
    div(
      { class: 'loading-message' },
      span({ class: 'spinner' }, ''), // You can style this span as a spinner in CSS.
      ' ',
      message
    )
  );
}

/**
 * Renders a notification message.
 *
 * @param {string} message - The notification message to display.
 * @returns {string} HTML string representing the notification message.
 *
 * @example
 * const notificationHtml = renderNotificationMessage("You have a new notification!");
 */
export function renderNotificationMessage(message) {
  return render(
    div({ class: 'notification-message', timer:"5000", target:"#notifications(remove)"}, message)
  );
}

/**
 * Renders a default index page.
 *
 * This page is returned when no custom index.html is found.
 *
 * @returns {string} HTML string representing the default index page.
 *
 * @example
 * const indexHtml = renderDefaultIndexPage();
 */
export function renderDefaultIndexPage() {
  // Destructure additional tags from HTMLeX if needed
  const { div, h1, p } = tags;
  return render(
    div(
      { class: 'default-index-page' },
      h1({}, 'Welcome to the Default Index Page'),
      p({}, 'No custom index.html was found. This default page has been generated automatically.')
    )
  );
}

/**
 * Returns a virtual node representing the Notifications Demo widget.
 * This node uses custom HTMLeX attributes for API calls and timer removal.
 *
 * @returns {Object} A virtual node for the notifications demo.
 *
 * @example
 * const notificationsNode = NotificationsDemo();
 */
export function NotificationsDemo(message = "Waitiing...") {
  return section(
    { id: 'notifications', class: 'bg-gray-800 p-6 rounded-lg shadow-lg fade-in' },
    h2({ class: 'text-2xl font-semibold mb-4' }, 'Notifications'),
    button(
      {
        GET: '/notifications',
        target: '#notificationArea(innerHTML)',
        class: 'btn bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white font-bold py-3 px-8 rounded-md shadow-lg'
      }, "Get Notification"
    ),
    div(
      { id: 'notificationArea', class: 'mt-4 p-4 bg-gray-700 rounded-md shadow animate-pulse' },
      message
    )
  );
}