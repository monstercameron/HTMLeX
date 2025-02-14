# HTMLeX – HTML eXtensible Declarative HATEOAS UI Specification  
*Version 1.2.2 • Last Updated: 2025-02-12*

---

## Table of Contents

1. [Preamble](#preamble)  
2. [Design Principles and Requirements](#design-principles-and-requirements)  
3. [Attribute Definitions, Behavior, and Defaults](#attribute-definitions-behavior-and-defaults)  
    - [API Calls & Data Collection](#api-calls--data-collection)  
    - [DOM Updates](#dom-updates)  
    - [URL State Updates](#url-state-updates)  
    - [Publish/Subscribe Chaining](#publishsubscribe-chaining)  
    - [Rate Limiting](#rate-limiting)  
    - [Polling](#polling)  
    - [WebSocket Integration & Generic Retry/Timeout](#websocket-integration--generic-retrytimeout)  
    - [Auto‑Fire, Prefetch & Lazy Loading](#auto‑fire-prefetch--lazy-loading)  
    - [Caching](#caching)  
    - [Extras (Inline Parameters)](#extras-inline-parameters)  
    - [Timers](#timers)  
    - [Sequential Updates](#sequential-updates)  
    - [Lifecycle Hooks (Optional Extension)](#lifecycle-hooks-optional-extension)  
    - [Streaming & Progressive Rendering](#streaming--progressive-rendering)  
4. [Security Considerations](#security-considerations)  
5. [Example: Todo App](#example-todo-app)  
6. [Summary](#summary)  
7. [Contributing](#contributing)  
8. [License](#license)

---

<video width="640" height="360" controls>
  <source src="./media/v1.2.2-demo.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>
[![Watch the video](https://raw.githubusercontent.com/monstercameron/HTMLeX/main/media/thumbnail.jpg)](https://raw.githubusercontent.com/monstercameron/HTMLeX/main/media/v1.2.2-demo.mp4)




## 1. Preamble

_HATEOAS (Hypermedia as the Engine of Application State) is an architectural principle in which the server returns complete HTML responses—including hypermedia controls (links, forms, etc.)—that describe available state transitions. In this model, the UI is driven entirely by server‑rendered HTML, and there is no need for explicit client‑side JSON state. **HTMLeX** extends HTML with a rich set of declarative attributes to manage API calls, DOM updates, URL state, and inter‑component event communication via a publish/subscribe model. Complex interactions are implemented via Web Components that encapsulate advanced client‑side logic while interfacing with HTMLeX through these attributes._

---

## 2. Design Principles and Requirements

- **Server‑Rendered UI:**  
  All state transitions and UI updates are delivered as complete HTML responses from the server.

- **Declarative Markup:**  
  Every interactive behavior is defined solely via HTML attributes; no imperative JavaScript is required in the core framework.

- **HATEOAS‑Driven:**  
  The server supplies hypermedia controls in its HTML responses, driving the UI without explicit client‑side state (e.g., JSON).

- **URL State Management:**  
  URL updates (query parameters and path) are automatically recorded in browser history by default.  
  **History Defaults Improvement:**  
  - **User‑initiated actions (e.g., clicks):** Default to pushing a new history entry.  
  - **Non‑user‑initiated actions (e.g., polling, auto‑fire, lazy):** Default to replacing the current history entry to avoid history pollution.

- **Publish/Subscribe Model:**  
  A declarative publish/subscribe system enables event chaining; events are published by elements and subscribed to by others via a simple **Emit** header mechanism.

- **Robustness and Error Handling:**  
  Instead of separate feedback attributes (like onerror or loading), HTMLeX leverages streamed responses (with the **Emit** header) to communicate progress and errors.  
  - **Structured Error Markers:** Error fragments include a status attribute (e.g., `<fragment status="500">`) so that clients can distinguish success from failure even though the HTTP response always returns 200.

- **Performance Optimizations:**  
  The framework employs smart caching, request batching (internally), and a partial DOM update (diffing/morphing) algorithm to minimize reflows and preserve live state.

- **Extensibility:**  
  Optional lifecycle hooks and Web Component integration allow developers to extend functionality for advanced client‑side behaviors.

---

## 3. Attribute Definitions, Behavior, and Defaults

### API Calls & Data Collection

- **HTTP Verb Attributes (GET, POST, PUT, DELETE, etc.)**  
  - **Purpose:** Specifies the API endpoint.  
  - **Behavior:** When activated (via a user event or auto‑fire), the element gathers form inputs from its subtree and sends them as multipart FormData.  
  - **Default:** Must be explicitly provided by the developer.

- **source**  
  - **Purpose:** Collects additional form inputs from outside the element’s subtree.  
  - **Value:** A space‑separated list of CSS selectors.  
  - **Default:** Empty.  
  - **Note:** If the element is self‑contained, this attribute is optional.

### DOM Updates

- **target**  
  - **Purpose:** Defines where and how to apply the HTML returned by an API call.  
  - **Value:** A space‑separated list of update instructions in the format:  
    ```
    CSS_SELECTOR(REPLACEMENT_STRATEGY)
    ```  
  - **Replacement Strategies:**  
    - **innerHTML** (default): Replaces the inner content using a diffing (morphing) algorithm to update only changed portions while preserving live state (e.g., video/audio).  
    - **outerHTML:** Replaces the entire target element.  
    - **append:** Appends content to the target.  
    - **prepend:** Prepends content to the target.  
    - **before:** Inserts content immediately before the target element.  
    - **after:** Inserts content immediately after the target element.  
    - **remove:** Removes the target element from the DOM.  
  - **Default:** If omitted, updates the triggering element’s innerHTML.

### URL State Updates

- **push**, **pull**, **path**  
  - **Purpose:** Manage query parameters and path updates.  
  - **Behavior:** Updates automatically create history events as controlled by the **history** attribute.

- **history**  
  - **Purpose:** Controls how URL state changes affect browser history.  
  - **Value:** Accepts `push`, `replace`, or `none`.  
  - **Behavior:**  
    - **push:** Adds a new history entry (default for explicit, user‑initiated events such as clicks).  
    - **replace:** Replaces the current history entry (default for non‑user‑initiated actions such as polling or auto‑fire).  
    - **none:** Leaves the history unchanged.  
  - **Default:** Context‑sensitive, as noted above.

### Publish/Subscribe Chaining

- **publish**  
  - **Purpose:** Declares the event that the element will publish after its API call or event action completes.  
  - **Value:** A plain signal name (e.g., `todoCreated`).  
  - **Default:** Empty.

- **subscribe**  
  - **Purpose:** Specifies one or more events the element listens for before triggering its API call.  
  - **Value:** A space‑separated list of event names.  
  - **Default:** Empty.  
  - **Note:** Event priority is inferred by order (leftmost is highest).

- **trigger**  
  - **Purpose:** Overrides the default event that triggers an API call or event publication.  
  - **Value:** A DOM event name (e.g., `click`, `mouseover`, `scrollIntoView`).  
  - **Default:** Typically `click` for buttons, `submit` for forms.

- **Emit Header**  
  - **Purpose:** The server includes an HTTP **Emit** header in its response to instruct HTMLeX to automatically publish a specified event.  
  - **Example:**  
    ```
    Emit: todosUpdated; delay=1000
    ```  
    This instructs the framework to publish the `todosUpdated` event 1000 milliseconds after processing the response.

### Rate Limiting

- **debounce**  
  - **Purpose:** Delays the API call until a specified quiet period has elapsed.  
  - **Value:** Time in milliseconds.  
  - **Default:** `0` (disabled).

- **throttle**  
  - **Purpose:** Ensures a minimum interval between successive API calls.  
  - **Value:** Time in milliseconds.  
  - **Default:** `0` (disabled).

### Polling

- **poll**  
  - **Purpose:** Automatically triggers the API call at a fixed interval.  
  - **Value:** Time in milliseconds.  
  - **Default:** Disabled if omitted.

- **repeat**  
  - **Purpose:** Limits the number of polling iterations.  
  - **Value:** An integer (with `0` indicating unlimited).  
  - **Default:** `0` (unlimited).

### WebSocket Integration & Generic Retry/Timeout

- **socket**  
  - **Purpose:** Connects the element to a WebSocket endpoint for full‑duplex, real‑time updates.  
  - **Value:** A WebSocket URL.  
  - **Default:** None.

- **retry**  
  - **Purpose:** Specifies the number of times to retry a failed API call or WebSocket connection attempt.  
  - **Value:** Integer.  
  - **Default:** `0` (no retries) if not specified.

- **timeout**  
  - **Purpose:** Sets the maximum wait time (in milliseconds) for an API call or WebSocket connection before it is considered failed.  
  - **Value:** Time in milliseconds.  
  - **Default:** `0` (disabled) if not specified.

- **WebSocket Error Handling:**  
  - **Behavior:** If retries are exhausted for a WebSocket connection attempt, HTMLeX automatically publishes a standard event (e.g., `websocket:error`) so that the UI can display appropriate feedback.

### Auto‑Fire, Prefetch & Lazy Loading

- **auto**  
  - **Purpose:** Automatically fires the API call when the element is inserted into the DOM.  
  - **Value Options:**  
    - `auto` or `auto=true`: Fire immediately upon insertion.  
    - `auto=prefetch`: Fire immediately and cache the response but delay the UI update until explicitly triggered for improved perceived performance.  
    - `auto=lazy`: Defer the API call until the element is near the viewport.  
  - **Default:** Not auto‑fired unless specified.

- **cache**  
  - **Purpose:** Caches the API response locally to avoid duplicate calls.  
  - **Value:** A TTL in milliseconds or a flag.  
  - **Default:** No caching if omitted.

### Extras (Inline Parameters)

- **extras**  
  - **Purpose:** Injects additional inline key=value pairs into the API request payload.  
  - **Value:** A space‑separated list of key=value pairs (e.g., `locale=en_US theme=dark`).  
  - **Default:** Empty.

### Timers

- **timer**  
  - **Purpose:** Triggers the publication of the element’s event after a specified delay, enabling time‑based UI actions such as auto‑hiding notifications.  
  - **Value:** Time in milliseconds.  
  - **Default:** Not used unless specified.

### Sequential Updates

- **sequential**  
  - **Purpose:** Ensures that API responses are processed in FIFO order. By default, updates are applied per animation frame (using requestAnimationFrame).  
  - **Enhancement:**  
    - **Configurable Delay:** An optional delay (in milliseconds) may be provided (e.g., `sequential="150"`) to accommodate cases where the default animation frame timing is too fast relative to server-side timing.
  - **Default:** Disabled unless specified.

### Lifecycle Hooks (Optional Extension)

- **onbefore**, **onafter**, **onbeforeSwap**, **onafterSwap**  
  - **Purpose:** Provide hooks into various stages of the API call lifecycle (before request, after response, before DOM swap, after DOM swap) for custom behaviors such as animations or logging.  
  - **Implementation Clarity:**  
    - **Example Attribute Syntax:**  
      ```html
      <my-component onbefore="console.log('Before API call', event)" onafter="console.log('After API call', event)">
      </my-component>
      ```  
    - These hooks can be applied to any element enhanced by HTMLeX or custom Web Components.

### Streaming & Progressive Rendering

When using streamed responses with HTTP/2 (or HTTP/3), HTMLeX can progressively update the UI by processing multiple chunks of a single HTTP response. This strategy enhances the user experience by providing immediate feedback and seamless content updates. The behavior is as follows:

1. **Single HTTP Response, Multiple Chunks:**  
   - **Initial HTTP Response:**  
     The server immediately responds with a status code of 200 and sends HTTP headers. This status remains fixed for the entire response—even if later parts of the content indicate an error.
   - **Streaming Chunks:**  
     Instead of waiting to compile the entire response, the server breaks the response body into multiple parts (chunks or frames) that are sent sequentially over the same connection.

2. **Sending a Loading Fragment First:**  
   - **Early Feedback:**  
     The very first chunk sent by the server is a “loading” fragment. For example:
     ```xml
     <fragments>
       <fragment>
         <elem id="status">Loading...</elem>
       </fragment>
     </fragments>
     ```
     This fragment enables the client to display a loading indication immediately.

3. **Processing and Sending the Final Fragment:**  
   - **Asynchronous Processing:**  
     While the loading fragment is rendered, the server continues background processing (e.g., querying a database, calling other APIs, or performing long‑running computations).  
   - **Final Update:**  
     Once processing is complete, the server sends another chunk. This final fragment contains either:  
     - **The Payload:**  
       ```xml
       <fragments>
         <fragment>
           <elem id="content">Final Payload Loaded</elem>
         </fragment>
       </fragments>
       ```  
     - **Or an Error Message:**  
       If an error occurred, the server sends an error fragment with a structured status marker:
       ```xml
       <fragments>
         <fragment status="500">
           <elem id="error">An error occurred!</elem>
         </fragment>
       </fragments>
       ```
     The HTMLeX framework uses the **Emit** header (or its equivalent mechanism) to communicate such updates to all subscribing elements.

4. **Closing the Connection:**  
   - After sending the final fragment, the server closes the stream. The client now has the complete sequence of fragments required to fully update the UI.

5. **Implications of This Behavior:**  
   - **Progressive Rendering:**  
     Users receive an immediate loading indication, which improves perceived performance.  
   - **Fixed HTTP Status:**  
     The HTTP headers (including the 200 status) are sent immediately; error fragments include a structured status attribute (e.g., `status="500"`) so that clients can distinguish success from failure.  
   - **Protocol Advantages:**  
     HTTP/2 and HTTP/3 support multiple data frames over a single persistent connection, making this streaming mechanism efficient.

6. **Integration with HTMLeX:**  
   - HTMLeX expects responses in a fragment format (`<fragments><fragment><elem>…`), allowing the client to seamlessly transition from the loading state to the final content using the diffing (morphing) algorithm.

---

## 4. Security Considerations

- **CSRF Protection:**  
  - API calls initiated by HTMLeX should implement standard CSRF protection measures.  
  - Developers are encouraged to use CSRF tokens (for example, by embedding a token in a meta tag such as `<meta name="csrf-token" content="...">`) or to rely on server‑side protections (such as same‑site cookies) to mitigate CSRF attacks.  
  - HTMLeX does not automatically add CSRF tokens but may include them in API request payloads if configured.

- **Sanitization of Server Responses:**  
  - Server responses that update the DOM must be sanitized to prevent injection of malicious code (XSS).  
  - Since HTMLeX employs a diffing algorithm for partial DOM updates, it is critical that HTML fragments provided by the server are free of unsafe content.  
  - Developers should sanitize output on the server side using robust sanitization libraries and may optionally employ client‑side sanitization hooks via lifecycle events if needed.

- **Cross‑Origin Request Handling:**  
  - Cross‑origin requests are not directly managed by HTMLeX.  
  - Developers must ensure that API endpoints intended for cross‑origin use include appropriate CORS headers (such as `Access-Control-Allow-Origin`) to permit such requests.  
  - In the absence of proper CORS configuration, the browser’s same‑origin policy will apply.

- **Debugging and Excessive Logging:**  
  - When the **debug** attribute is set to `true` on an element (e.g., `<div GET="/api/data" debug="true">`), HTMLeX produces extensive logging around that element’s operations.  
  - This logging includes detailed API call information, DOM update events, and publish/subscribe interactions.  
  - Excessive logging should be used only in development environments, as it may expose sensitive information if enabled in production.

---

## 5. Example: Todo App

Below is an example Todo application built using semantic HTML and Tailwind CSS. This example demonstrates how HTMLeX attributes are used to construct a fully declarative, server‑driven Todo app.

> **Note:** In this example, the form is self‑contained; therefore, the redundant `source` attribute has been removed.

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
      <form POST="/todos/create" target="#todoList(innerHTML)"
            extras="locale=en_US" publish="todoCreated" auto="auto" cache="30000"
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
        <!-- Server‑rendered todo items will appear here.
             A DELETE call may remove an item using target="#todo-123(remove)".
             Streamed responses update this area with a loading fragment followed by the final payload or an error fragment (with a status marker) via the Emit header mechanism. -->
      </div>
    </section>

    <!-- Refresh Button with Polling -->
    <section class="mt-6">
      <button GET="/todos/list" target="#todoList(innerHTML)" poll="60000" repeat="0" debounce="500"
              publish="todosLoaded" history="push"
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
  - Uses a POST call to create a new todo item.  
  - **extras** injects additional inline parameters (e.g., locale).  
  - **target** specifies that the response updates the Todo List using `innerHTML` with a diffing algorithm.  
  - **auto="auto"** fires the API call immediately upon DOM insertion, and **cache="30000"** caches the response for 30 seconds.  
  - Upon success, the form publishes the event `todoCreated`.

- **Todo List:**  
  - Displays the server‑rendered list of todos.  
  - A DELETE call can remove a todo using `target="#todo-123(remove)"`.  
  - Streamed responses update this area by first delivering a loading fragment, then the final payload (or an error fragment with a status marker such as `<fragment status="500">`) via the **Emit** header mechanism.

- **Refresh Button:**  
  - Uses a GET call with **poll="60000"** to refresh the list every 60 seconds, **debounce="500"** to limit rapid calls, and **repeat="0"** for unlimited polling.  
  - The **history** attribute is set to `push` for explicit user interactions.  
  - Publishes the event `todosLoaded` on completion.

- **Debugging Example:**  
  - For example, `<div GET="/api/data" debug="true">` will enable extensive logging around that element’s operations in development environments.

---

## 6. Summary

- **API & Data Collection:**  
  HTTP verb attributes trigger API calls; **extras** gathers inline parameters.

- **DOM Updates:**  
  **target** specifies how to update the DOM using strategies such as innerHTML (with diffing), outerHTML, append, prepend, before, after, and remove.

- **URL State Management:**  
  **push**, **pull**, and **path** update the URL automatically, with the **history** attribute defaulting to context‑sensitive behavior (push for user actions; replace for non‑user actions).

- **Publish/Subscribe Chaining:**  
  **publish** and **subscribe** (with **trigger**) form a declarative event system. The **Emit** header (e.g., `Emit: todosUpdated; delay=1000`) replaces traditional feedback attributes by signaling updates to subscribed elements.

- **Rate Limiting & Polling:**  
  **debounce**, **throttle**, **poll**, and **repeat** control API call frequency and auto‑refresh behavior.

- **Auto‑Fire & Caching:**  
  **auto** triggers API calls on DOM insertion (immediate, prefetch, or lazy), and **cache** stores responses locally.

- **Extras:**  
  **extras** injects inline key=value pairs into API calls.

- **Timers:**  
  **timer** delays the publication of events for time‑based UI actions.

- **WebSocket Integration & Generic Retry/Timeout:**  
  **socket** enables real‑time updates; the generic **retry** and **timeout** attributes apply to both API and WebSocket connections. On WebSocket failure, a `websocket:error` event is published.

- **Sequential Updates (Optional):**  
  **sequential** queues responses for FIFO processing and may be configured with an optional delay (e.g., `sequential="150"`).

- **Lifecycle Hooks (Optional):**  
  Hooks such as **onbefore** and **onafter** allow custom behaviors and logging.  
  *Example:* `<my-component onbefore="console.log('Before API call', event)">`

- **Streaming & Progressive Rendering (Optional):**  
  HTMLeX supports streamed responses over HTTP/2 or HTTP/3. The server sends an immediate loading fragment, then delivers the final payload or error fragment (with a structured status attribute, e.g., `<fragment status="500">`) over a single connection. The **Emit** header instructs subscribed elements to update accordingly.

- **Performance Optimizations:**  
  A built‑in diffing algorithm enables smart, partial DOM updates that minimize reflows while preserving live element state.

---

## 7. Contributing

Contributions, feedback, and improvements are welcome. Please refer to [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 8. License

This project is licensed under the [MIT License](LICENSE).