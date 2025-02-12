Below is the revised, professional specification document for **HTMLeX – HTML eXtensible Declarative HATEOAS UI**. This document has been updated to incorporate the following enhancements:

- **URL State Updates:** Instead of using a separate history attribute, every URL state update automatically pushes a new history event by default. (We also critique this idea and propose a solution below.)  
- **Signal‑Based Chaining:** We now use standard publish/subscribe terminology by renaming the “signal” attribute to **publish** and the “listen” attribute to **subscribe**, while retaining **trigger** for event overrides.  
- **Polling:** A new **repeat** attribute has been added to limit the number of polling cycles.  
- **Server-Sent Events (SSE) & Emit Header:** A note is included to indicate that API calls can return an “emit” header. The framework will read this header and automatically publish that event, integrating it into the publish/subscribe model.

The following sections detail definitions, behavior, defaults, and code examples.

---

# HTMLeX – HTML eXtensible Declarative HATEOAS UI Specification  
*Version 1.1 • Last Updated: 2025-02-10*

---

## Table of Contents

1. [Preamble](#preamble)
2. [Design Principles and Requirements](#design-principles-and-requirements)
3. [Attribute Definitions, Behavior, and Defaults](#attribute-definitions-behavior-and-defaults)
    - [API Calls & Data Collection](#api-calls--data-collection)
    - [DOM Updates](#dom-updates)
    - [URL State Updates](#url-state-updates)
    - [Publish/Subscribe Chaining](#publishsubscribe-chaining)
    - [Feedback: Loading & Error States](#feedback-loading--error-states)
    - [Rate Limiting](#rate-limiting)
    - [Polling](#polling)
    - [WebSocket Integration](#websocket-integration)
    - [Retry & Timeout](#retry--timeout)
    - [Auto‑Fire, Prefetch & Lazy Loading](#auto-fire-prefetch--lazy-loading)
    - [Caching](#caching)
    - [Extras (Inline Parameters)](#extras-inline-parameters)
    - [Timers](#timers)
    - [Sequential Updates](#sequential-updates)
    - [Lifecycle Hooks (Optional Extension)](#lifecycle-hooks-optional-extension)
4. [Example: Todo App](#example-todo-app)
5. [Summary](#summary)
6. [Contributing](#contributing)
7. [License](#license)

---

## 1. Preamble

_HATEOAS (Hypermedia as the Engine of Application State) is an architectural principle where the server provides complete HTML responses that include hypermedia controls—links, forms, and actions—that describe available state transitions. In this approach, no explicit client‑side JSON state is required. **HTMLeX** adheres strictly to SSR and HATEOAS principles by driving the UI solely via server‑rendered HTML and declarative attributes. Complex UIs should be built as Web Components that encapsulate rich client‑side logic while inter-operating with HTMLeX via attributes such as **target**, **publish**, and **subscribe**._

---

## 2. Design Principles and Requirements

- **Server‑Rendered UI:**  
  All state transitions and UI updates are delivered as complete HTML responses from the server.

- **Declarative Markup:**  
  Interaction behaviors are defined entirely via HTML attributes; no imperative JavaScript is required in the core framework.

- **Hypermedia‑Driven:**  
  The server returns hypermedia controls that describe available actions, ensuring that state transitions are self‑descriptive.

- **URL State Management:**  
  URL updates are integrated into the workflow; by default, every URL state change creates a new history entry.

- **Advanced Features:**  
  Features such as lazy loading, caching, polling, rate limiting, and timed actions are supported via simple attributes.

- **Publish/Subscribe Model:**  
  Signals (events) are handled using a publish/subscribe paradigm to chain updates and coordinate actions.

- **Extensibility:**  
  Lifecycle hooks and Web Components are supported for advanced client‑side behaviors when needed.

---

## 3. Attribute Definitions, Behavior, and Defaults

### API Calls & Data Collection

- **HTTP Verb Attributes (GET, POST, PUT, DELETE, etc.)**  
  - **Purpose:** Specifies the API endpoint for the call.  
  - **Behavior:** When activated, the element gathers form inputs from its subtree and sends them as multipart FormData.  
  - **Default:** Must be explicitly set.

- **source**  
  - **Purpose:** Collect additional form inputs from elsewhere in the DOM.  
  - **Value:** Space‑separated list of CSS selectors.  
  - **Default:** Empty (optional).

### DOM Updates

- **target**  
  - **Purpose:** Specifies where and how to apply returned HTML.  
  - **Value:** Space‑separated update instructions in the form:  
    ```
    CSS_SELECTOR(REPLACEMENT_STRATEGY)
    ```  
  - **Replacement Strategies:**  
    - **innerHTML** (default): Replaces inner content, using partial updates when possible to preserve live state (e.g., video/audio).  
    - **outerHTML:** Replaces the entire element.  
    - **append:** Appends content to the target.  
    - **prepend:** Prepends content to the target.  
    - **before:** Inserts content immediately before the target element.  
    - **after:** Inserts content immediately after the target element.  
    - **remove:** Removes the target element from the DOM (e.g., used when a DELETE call returns an empty string).
  - **Default:** If omitted, updates the triggering element’s innerHTML.

### URL State Updates

- **push**  
  - **Purpose:** Adds or updates query parameters in the URL.  
  - **Value:** Space‑separated key=value pairs (e.g., `page=2 sort=asc`).  
  - **Default:** Empty.
  - **Note:** _Every URL state update automatically pushes a new history event (i.e., a new browser history entry is created) so that a separate history attribute is not necessary. This ensures that every state transition is recorded, following the HATEOAS principle. (Developers may override this behavior in future revisions if needed.)_

- **pull**  
  - **Purpose:** Removes specified query parameters from the URL.  
  - **Value:** Space‑separated list of keys.  
  - **Default:** Empty.

- **path**  
  - **Purpose:** Sets the URL path.  
  - **Value:** A literal string (no templating).  
  - **Default:** Empty.

### Publish/Subscribe Chaining

- **publish**  
  - **Purpose:** Declares the event that the element will publish upon completion of its API call or event action.  
  - **Value:** A plain signal name prefixed with “@” (e.g., `@todosLoaded`).  
  - **Default:** Empty.

- **subscribe**  
  - **Purpose:** Specifies one or more signals the element subscribes to before triggering its API call.  
  - **Value:** Space‑separated list of signal names (each with “@”).  
  - **Default:** Empty.  
  - **Note:** Signal priority is determined by order (leftmost is highest).

- **trigger**  
  - **Purpose:** Overrides the default event that causes the element to publish its event.  
  - **Value:** A DOM event name (e.g., `click`, `mouseover`, `scrollIntoView`).  
  - **Default:** Depends on element type (commonly `click`).

- **Emit Header & Server-Sent Events:**  
  - **Note:** API calls may return an HTTP header (e.g., `Emit`) that specifies a signal to be published by the framework immediately upon response. This allows the server to drive additional client‑side actions.

### Feedback (Loading & Error States)

- **loading**  
  - **Purpose:** Specifies the UI update to display while an API call is in progress.  
  - **Value:** Space‑separated update instructions (same syntax as **target**).  
  - **Default:** Empty.

- **onerror**  
  - **Purpose:** Specifies the UI update to display if an API call fails.  
  - **Value:** Space‑separated update instructions (same syntax as **target**).  
  - **Default:** Empty.

### Rate Limiting

- **debounce**  
  - **Purpose:** Prevents rapid, successive API calls by delaying execution until events settle.  
  - **Value:** Time in milliseconds.  
  - **Default:** `0` (disabled).

- **throttle**  
  - **Purpose:** Enforces a minimum interval between API calls.  
  - **Value:** Time in milliseconds.  
  - **Default:** `0` (disabled).

### Polling

- **poll**  
  - **Purpose:** Automatically triggers the API call at a fixed interval.  
  - **Value:** Time in milliseconds.  
  - **Default:** Not enabled if omitted.

- **repeat**  
  - **Purpose:** Limits the number of polling iterations.  
  - **Value:** An integer representing the maximum number of repeats.  
  - **Default:** Unlimited (if omitted).

### WebSocket Integration

- **socket**  
  - **Purpose:** Connects the element to a WebSocket endpoint for real‑time updates.  
  - **Value:** A WebSocket URL.  
  - **Default:** None.

### Retry & Timeout

- **retry**  
  - **Purpose:** Specifies the number of retry attempts if an API call fails.  
  - **Value:** Integer.  
  - **Default:** `0` (no retries).

- **timeout**  
  - **Purpose:** Sets the maximum wait time for an API call before it is deemed failed.  
  - **Value:** Time in milliseconds.  
  - **Default:** `0` (disabled).

### Auto‑Fire, Prefetch & Lazy Loading

- **auto**  
  - **Purpose:** Automatically fires an API call when the element is inserted into the DOM.  
  - **Value Options:**  
    - `auto` or `auto=true`: Fire immediately upon insertion.  
    - `auto=prefetch`: Fire immediately and cache the response, but do not update the UI until explicitly triggered for a faster UX.  
    - `auto=lazy`: Defer the API call until the element is near the viewport.  
  - **Default:** Not auto‑fired unless specified.

- **cache**  
  - **Purpose:** Caches the API response locally to avoid duplicate calls.  
  - **Value:** A TTL in milliseconds or a flag.  
  - **Default:** No caching if omitted.

### Extras (Inline Parameters)

- **extras**  
  - **Purpose:** Injects additional inline key=value pairs into the API request payload (similar to htmx’s `hx-vals`).  
  - **Value:** Space‑separated list of key=value pairs (e.g., `locale=en_US theme=dark`).  
  - **Default:** Empty.

### Timers

- **timer**  
  - **Purpose:** Triggers the publication of the element’s event after a specified delay, enabling time‑based actions (e.g., auto‑hiding notifications).  
  - **Value:** Time in milliseconds.  
  - **Default:** Not used unless specified.

### Sequential Updates

- **sequential**  
  - **Purpose:** Ensures that successive API responses are processed in FIFO order by queuing each update and applying it one per animation frame via requestAnimationFrame.  
  - **Value:** Boolean flag.  
  - **Default:** Disabled (by default, the last response may overwrite previous updates).

### Lifecycle Hooks (Optional Extension)

- **onbefore**, **onafter**, **onbeforeSwap**, **onafterSwap**  
  - **Purpose:** Allow developers to hook into the lifecycle of an API call (before request, after response, before swap, after swap) for custom behaviors like animations or logging.  
  - **Value:** Expressions or update instructions.  
  - **Default:** Not implemented by default.

---

## 4. Example: Todo App

Below is an example Todo application that demonstrates HTMLeX in action. This app uses semantic HTML and Tailwind CSS for styling.

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
            extras="locale=en_US" publish="@todoCreated" auto="auto" cache="30000"
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
      <button GET="/todos/list" target="#todoList(innerHTML)" poll="60000" repeat="0" debounce="500"
              publish="@todosLoaded"
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
  - Uses a POST API call to create a new Todo item.  
  - **source** collects form inputs from within the form, and **extras** injects additional inline parameters (e.g., locale).  
  - **target** specifies that the server response should update the Todo List using `innerHTML`.  
  - **auto="auto"** fires the API call immediately upon insertion, and **cache="30000"** caches the response for 30 seconds.  
  - Upon completion, the form publishes the event `@todoCreated` (using our publish/subscribe model).

- **Todo List:**  
  - Displays server‑rendered Todo items.  
  - A DELETE API call could remove an item using `target="#todo-123(remove)"`.  
  - **timer** (not shown here) can auto‑hide flash messages after a specified delay.

- **Refresh Button:**  
  - Uses a GET API call with **poll="60000"** to refresh the Todo List every 60 seconds and **debounce="500"** to limit rapid re‑calls.  
  - **repeat="0"** indicates unlimited polling (if a non‑zero value is set, it limits the polling iterations).  
  - When the call completes, the button publishes the event `@todosLoaded`.

- **URL State Updates:**  
  While not explicitly demonstrated here, every API call that updates the URL via **push**, **pull**, or **path** automatically creates a new history event (i.e., no separate history attribute is required).

---

## 5. Summary

- **API & Data Collection:**  
  Use HTTP verb attributes with **source** and **extras** to send FormData.

- **DOM Updates:**  
  **target** defines where and how to apply HTML using replacement strategies (e.g., innerHTML, outerHTML, remove).

- **URL State Management:**  
  **push**, **pull**, and **path** update the URL automatically, creating a new history entry for each state change.

- **Publish/Subscribe Chaining:**  
  **publish** (formerly signal) and **subscribe** (formerly listen) enable declarative chaining of actions, with **trigger** to override default events. (Signal priority is inferred by the order in **subscribe**.)

- **Feedback:**  
  **loading** and **onerror** display visual updates during API calls.

- **Rate Limiting & Polling:**  
  **debounce**, **throttle**, **poll**, and the new **repeat** attribute manage API call frequency and auto‑refresh behavior.

- **Auto‑Fire & Caching:**  
  **auto** triggers API calls on DOM insertion (with options for immediate, prefetch, or lazy loading), and **cache** stores responses.

- **Extras:**  
  **extras** injects inline key=value pairs into API calls.

- **Timers:**  
  **timer** delays the emission of an event after the primary action, enabling time‑based UI updates.

- **WebSockets:**  
  **socket** integrates real‑time, server‑pushed updates.

- **Robustness:**  
  **retry** and **timeout** handle retries and maximum wait times.

- **Sequential Updates (Optional):**  
  **sequential** queues API responses for FIFO processing using requestAnimationFrame.

- **Server-Sent Events (SSE):**  
  API responses may include an `Emit` header. When detected, HTMLeX automatically publishes the specified event, integrating server‑sent signals into the publish/subscribe model.

---

## 6. Contributing

Contributions, feedback, and improvements are welcome. Please refer to [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 7. License

This project is licensed under the [MIT License](LICENSE).

---

This specification for **HTMLeX – HTML eXtensible Declarative HATEOAS UI** provides a comprehensive framework for building server‑rendered, hypermedia‑driven web applications using only HTML attributes. It extends traditional HTML with a rich set of declarative features for API calls, DOM updates, URL state management, and event chaining, all while remaining mostly HTML5‑compatible and extensible through Web Components. Feedback and contributions are encouraged to further refine HTMLeX.