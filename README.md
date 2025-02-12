# HTMLeX – HTML eXtensible Declarative HATEOAS UI Specification

*Version 1.0 • Last Updated: 2025-02-10*

---

## Table of Contents

1. [Preamble](#preamble)
2. [Design Principles and Requirements](#design-principles-and-requirements)
3. [Attribute Definitions, Behavior, and Defaults](#attribute-definitions-behavior-and-defaults)
    - [API Calls & Data Collection](#api-calls--data-collection)
    - [DOM Updates](#dom-updates)
    - [URL State Updates](#url-state-updates)
    - [Signal‑Based Chaining](#signal‑based-chaining)
    - [Feedback (Loading & Error States)](#feedback-loading--error-states)
    - [Rate Limiting](#rate-limiting)
    - [Polling](#polling)
    - [WebSocket Integration](#websocket-integration)
    - [Retry & Timeout](#retry--timeout)
    - [Auto‑Fire, Prefetch & Lazy Loading](#auto‑fire-prefetch--lazy-loading)
    - [Timers](#timers)
    - [Sequential Updates](#sequential-updates)
4. [Example: Todo App](#example-todo-app)
5. [Summary](#summary)
6. [Contributing](#contributing)
7. [License](#license)

---

## 1. Preamble

_HATEOAS (Hypermedia as the Engine of Application State) is a REST architectural principle in which the server returns complete HTML responses—including hypermedia controls (links, forms, etc.)—that describe available state transitions. In this approach, the UI is driven entirely by server‑rendered HTML without explicit client‑side JSON state. HTMLeX leverages this paradigm by extending HTML with a set of declarative attributes that control API calls, DOM updates, URL state, and more, while delegating complex interactivity to Web Components when necessary._

---

## 2. Design Principles and Requirements

- **Server‑Rendered UI:**  
  All UI state and transitions originate from the server via complete HTML responses.

- **Declarative Markup:**  
  Interaction behaviors are defined solely by HTML attributes. No imperative JavaScript is required in the core framework.

- **No Explicit Client‑Side JSON:**  
  The UI is driven by hypermedia HTML responses; there is no separate client‑side state format like JSON.

- **Progressive Enhancement:**  
  The system is mostly HTML5‑compatible and can be augmented with Web Components for advanced client‑side behavior.

- **Error Handling:**  
  Error recovery is managed by the server; UI error states are reflected via declarative attributes.

- **Advanced Features:**  
  Built‑in support for lazy loading, caching, polling, timed actions, and sequential updates—all configurable via simple, single‑word attributes.

- **Flexible Update Ordering:**  
  Developers can opt for sequential, FIFO‑based updates or a “last-response wins” approach using the optional **sequential** flag.

---

## 3. Attribute Definitions, Behavior, and Defaults

### API Calls & Data Collection

- **HTTP Verb Attributes (GET, POST, PUT, DELETE, etc.)**  
  - **Purpose:** Define the API endpoint for a call.  
  - **Behavior:** When activated, the element collects form inputs from its subtree and sends them as multipart FormData.  
  - **Default:** _None (must be specified by the developer)._

- **source**  
  - **Purpose:** Gather additional form data from elsewhere in the DOM.  
  - **Value:** A space‑separated list of CSS selectors.  
  - **Default:** _Empty (optional)._

### DOM Updates

- **target**  
  - **Purpose:** Specify how and where returned HTML is applied.  
  - **Value:** A space‑separated list of update instructions formatted as:  
    ```
    CSS_SELECTOR(REPLACEMENT_STRATEGY)
    ```  
  - **Replacement Strategies:**  
    - **innerHTML** (default): Replace inner content, with partial update support to preserve state (e.g., for video/audio).  
    - **outerHTML:** Replace the entire element.  
    - **append:** Append the HTML.  
    - **prepend:** Prepend the HTML.  
    - **before:** Insert before the element.  
    - **after:** Insert after the element.  
    - **remove:** Remove the element from the DOM.
  - **Default:** If omitted, the triggering element’s content is updated using **innerHTML**.

### URL State Updates

- **push**  
  - **Purpose:** Add or update query parameters in the URL.  
  - **Value:** Space‑separated key=value pairs (e.g., `page=2 sort=asc`).  
  - **Default:** _Empty (optional)._

- **pull**  
  - **Purpose:** Remove query parameters from the URL.  
  - **Value:** A space‑separated list of keys.  
  - **Default:** _Empty (optional)._

- **path**  
  - **Purpose:** Set the URL path.  
  - **Value:** A literal string (no templating).  
  - **Default:** _Empty (optional)._

- **history**  
  - **Purpose:** Control browser history behavior for URL updates.  
  - **Value:** `push` or `replace`.  
  - **Default:** `replace` (to avoid cluttering history).

### Signal‑Based Chaining

- **signal**  
  - **Purpose:** Define the signal to be emitted when an action completes.  
  - **Value:** A plain signal name prefixed with “@” (e.g., `@todosLoaded`).  
  - **Default:** _Empty (optional)._

- **listen**  
  - **Purpose:** Specify one or more signals the element waits for before triggering its API call.  
  - **Value:** A space‑separated list of signals (each with “@”).  
  - **Default:** _Empty (optional)._  
  - **Note:** Signal priority is inferred by order (leftmost = highest).

- **trigger**  
  - **Purpose:** Override the default event that triggers signal emission.  
  - **Value:** A DOM event name (e.g., `click`, `mouseover`, `scrollIntoView`).  
  - **Default:** Depends on element type (e.g., `click` for buttons, `submit` for forms).

### Feedback (Loading & Error States)

- **loading**  
  - **Purpose:** Define the UI update to show while waiting for an API call.  
  - **Value:** Space‑separated update instructions (same syntax as **target**).  
  - **Default:** _Empty (optional)._

- **onerror**  
  - **Purpose:** Define the UI update to show if an API call fails.  
  - **Value:** Space‑separated update instructions (same syntax as **target**).  
  - **Default:** _Empty (optional)._

### Rate Limiting

- **debounce**  
  - **Purpose:** Prevent rapid, successive API calls by waiting for a quiet period.  
  - **Value:** Time in milliseconds.  
  - **Default:** `0` (disabled).

- **throttle**  
  - **Purpose:** Ensure a minimum interval between API calls.  
  - **Value:** Time in milliseconds.  
  - **Default:** `0` (disabled).

### Polling

- **poll**  
  - **Purpose:** Automatically trigger API calls at a fixed interval.  
  - **Value:** Interval in milliseconds.  
  - **Default:** _Not polled (if omitted)._

### WebSocket Integration

- **socket**  
  - **Purpose:** Connect an element to a WebSocket endpoint for real‑time updates.  
  - **Value:** A WebSocket URL.  
  - **Default:** _None (optional)._

### Retry & Timeout

- **retry**  
  - **Purpose:** Specify the number of retry attempts if an API call fails.  
  - **Value:** Integer.  
  - **Default:** `0` (no retries).

- **timeout**  
  - **Purpose:** Define the maximum wait time for an API call.  
  - **Value:** Time in milliseconds.  
  - **Default:** `0` (disabled).

### Auto‑Fire, Prefetch & Lazy Loading

- **auto**  
  - **Purpose:** Automatically fire an API call when the element is inserted into the DOM.  
  - **Value:** An optional flag or delay (in milliseconds).  
  - **Behavior:** If a delay is specified or if the element is offscreen, the API call is deferred (lazy loading). The response is cached until the DOM settles.  
  - **Default:** Not auto‑fired unless specified.

- **cache**  
  - **Purpose:** Cache the API response locally to avoid duplicate calls.  
  - **Value:** A TTL in milliseconds or a flag.  
  - **Default:** No caching if omitted.

### Timers

- **timer**  
  - **Purpose:** Trigger the emission of a signal after a specified delay, for time‑based actions.  
  - **Value:** Time in milliseconds.  
  - **Behavior:** Once the element’s primary action completes, the system waits the specified duration and then emits the element’s signal.  
  - **Default:** Not used unless specified.

### Sequential Updates

- **sequential**  
  - **Purpose:** Queue API responses and process UI updates one per animation frame using requestAnimationFrame (FIFO order).  
  - **Value:** A Boolean flag.  
  - **Default:** Disabled (first in, last out behavior).

---

## 4. Example: Todo App

The following Todo App example demonstrates how HTMLeX attributes are used to build a fully declarative, server‑driven Todo application. Semantic HTML and Tailwind CSS are used to provide a modern, responsive design.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Todo App Example</title>
  <!-- Tailwind CSS -->
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
</head>
<body class="bg-gray-100 text-gray-800">
  <!-- Header -->
  <header class="bg-blue-600 text-white p-4">
    <h1 class="text-3xl font-bold">Todo App</h1>
  </header>
  <main class="p-4">
    <!-- New Todo Form -->
    <section class="mb-6">
      <form POST="/todos/create" source="#newTodoForm" target="#todoList(innerHTML)"
            loading="#todoList(innerHTML)" onerror="#todoList(innerHTML)"
            signal="@todoCreated" auto="true" cache="30000"
            class="bg-white p-4 rounded shadow">
        <div class="mb-4">
          <label for="todo" class="block text-sm font-medium text-gray-700">New Todo</label>
          <input type="text" id="todo" name="todo"
                 class="mt-1 block w-full border-gray-300 rounded-md p-2"
                 placeholder="Enter your todo" required>
        </div>
        <button type="submit" class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded">
          Add Todo
        </button>
      </form>
    </section>

    <!-- Todo List -->
    <section id="todoListContainer" class="bg-white p-4 rounded shadow">
      <h2 class="text-2xl font-semibold mb-4">Todo List</h2>
      <div id="todoList" class="space-y-3">
        <!-- Server-rendered todo items will appear here.
             A DELETE call may remove an item using target="#todo-123(remove)".
             A flash message may auto-hide after 5 seconds using timer="5000". -->
      </div>
    </section>

    <!-- Refresh Button with Polling -->
    <section class="mt-6">
      <button GET="/todos/list" target="#todoList(innerHTML)" poll="60000" debounce="500"
              signal="@todosLoaded" history="push"
              class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded">
        Refresh Todos
      </button>
    </section>
  </main>
  <!-- Footer -->
  <footer class="bg-gray-200 text-center p-4 mt-6">
    <p class="text-sm text-gray-600">&copy; 2025 Todo App</p>
  </footer>
</body>
</html>
```

### Explanation

- **New Todo Form:**  
  Uses a POST API call to create a new todo. The **source** attribute collects inputs from within the form, and **target** updates the todo list using `innerHTML`.  
  The **auto** attribute fires the API call on DOM insertion (immediately or lazily as needed), and **cache** stores the response for 30 seconds. Tailwind CSS classes style the form.

- **Todo List Section:**  
  Contains server‑rendered todo items. A DELETE API call can remove an item with a target like `#todo-123(remove)`. A **timer** can be applied to auto‑hide flash messages after a delay.

- **Refresh Button:**  
  Uses a GET API call with polling (every 60 seconds) and debounce (500 ms) to refresh the list. The **history** attribute set to `push` creates a new history entry.

- **Signals:**  
  Signals such as `@todoCreated` and `@todosLoaded` are used to trigger subsequent updates.

---

## 5. Summary

- **API & Data Collection:**  
  Defined by HTTP verb attributes and **source** to send FormData.

- **DOM Updates:**  
  Managed via **target** with replacement strategies: `innerHTML` (partial updates), `outerHTML`, `append`, `prepend`, `before`, `after`, and `remove`.

- **URL State Management:**  
  Achieved through **push**, **pull**, **path**, and **history**.

- **Signal-Based Chaining:**  
  Implemented using **signal**, **listen**, and **trigger**; order in **listen** infers priority.

- **Feedback:**  
  **loading** and **onerror** display visual cues during API calls.

- **Rate Limiting & Polling:**  
  **debounce**, **throttle**, and **poll** manage API call frequency and auto-refresh behavior.

- **Auto‑Fire & Caching:**  
  **auto** triggers API calls on DOM insertion (with lazy loading if needed), and **cache** stores responses.

- **Timers:**  
  **timer** delays signal emission for time‑based actions (e.g., auto‑hiding elements).

- **WebSocket Integration:**  
  **socket** enables real‑time updates via WebSocket.

- **Robustness:**  
  **retry** and **timeout** control retries and maximum wait times.

- **Sequential Updates (Optional):**  
  The **sequential** flag (if enabled) processes updates in FIFO order using requestAnimationFrame.

---

## 7. License

This project is licensed under the [MIT License](LICENSE).
