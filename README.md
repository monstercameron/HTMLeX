# HTMLeX – HTML eXtensible Declarative HATEOAS UI Specification  
*Version 1.2.3 • Last Updated: 2025-02-17*

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
5. [Contributing](#contributing)  
6. [License](#license)

---

## 1. Preamble

_HATEOAS (Hypermedia as the Engine of Application State) is an architectural principle in which the server returns complete HTML responses—including hypermedia controls (links, forms, etc.)—that describe available state transitions. In this model, the UI is driven entirely by server‑rendered HTML, and there is no need for explicit client‑side JSON state. **HTMLeX** extends HTML with a rich set of declarative attributes to manage API calls, DOM updates, URL state, and inter‑component event communication via a publish/subscribe model._

> **Notes:**  
> - The framework uses modern JavaScript features (such as streaming, Web Workers, and dynamic function execution) to implement declarative interactions.  
> - Server responses include complete HTML fragments and may be streamed progressively, reducing the need for client‑side state management.

---

## 2. Design Principles and Requirements

- **Server‑Rendered UI:**  
  All UI updates and state transitions are delivered as complete HTML responses from the server.  
  > **Notes:**  
  > - Endpoints (e.g., in `features/streaming.js` and `features/todos.js`) use functions like `renderFragment()` to target specific DOM elements for update.  
  > - This design minimizes client‑side complexity by letting the server drive state transitions.

- **Declarative Markup:**  
  Every interactive behavior is defined using HTML attributes rather than imperative JavaScript.  
  > **Notes:**  
  > - Developers use attributes such as `GET`, `POST`, `target`, and `extras` to define behavior without additional code.  
  > - The implementation in `registration.js` shows how event listeners are dynamically attached based on these attributes.

- **HATEOAS‑Driven:**  
  Hypermedia controls in HTML responses guide the UI without explicit client‑side state management.

- **URL State Management:**  
  URL updates (query parameters and path changes) are synchronized with API calls.  
  > **Notes:**  
  > - The attribute **history** controls whether updates push new history entries (for user‑initiated actions) or replace the current entry (for non‑user‑initiated actions).  
  > - The function `handleURLState(element)` ensures URL updates are applied after API responses.

- **Publish/Subscribe Model:**  
  A declarative publish/subscribe system allows events to be chained together via HTML attributes and HTTP headers.  
  > **Notes:**  
  > - The **publish** and **subscribe** attributes let elements communicate without direct references.  
  > - The server can instruct the client to emit a signal using an HTTP **Emit** header, which is processed by checking for delay parameters and calling `emitSignal()`.

- **Robustness and Error Handling:**  
  Instead of separate error or loading attributes, streaming responses and structured error markers are used.  
  > **Notes:**  
  > - In `processResponse` (in `actions.js`), errors are indicated with a status attribute (e.g., `<fragment status="500">`).  
  > - Fallback updates occur if no complete fragments are detected.

- **Performance Optimizations:**  
  A built‑in diffing (morphing) algorithm minimizes reflows and preserves live element state.  
  > **Notes:**  
> - The patched update mechanism (see `patchedUpdateTarget` in `registration.js`) handles both initial and subsequent fragments efficiently.
> - For streaming responses, if multiple chunks are received the updates are applied immediately outside the sequential queue to avoid delays.

- **Extensibility:**  
  Lifecycle hooks and Web Component integration allow developers to extend or customize behavior.  
  > **Notes:**  
  > - Hooks such as **onbefore** and **onafter** are executed via dynamic function creation, with errors caught and logged to avoid interrupting the main flow.

---

## 3. Attribute Definitions, Behavior, and Defaults

### API Calls & Data Collection

- **HTTP Verb Attributes (GET, POST, PUT, DELETE, etc.)**  
  - **Purpose:** Specifies the API endpoint to call.  
  - **Behavior:**  
    - Gathers form inputs from the element's subtree.
    - For GET requests, FormData is converted into URL query parameters.
    - For non‑GET methods, FormData is sent as the request body.
  - **Default:** Must be provided explicitly.
  > **Notes:**  
  > - Implemented in `handleAction` (actions.js), where FormData is constructed from the form or child inputs.
  > - Additional inputs from elements specified by the **source** attribute are appended.

- **source**  
  - **Purpose:** Collects additional inputs from outside the element’s subtree.
  - **Value:** Space‑separated list of CSS selectors.
  - **Default:** Empty.
  > **Notes:**  
  > - The code iterates over selectors provided in **source** and appends matching input values to the FormData.
  > - Useful when form inputs are distributed in different parts of the DOM.

### DOM Updates

- **target**  
  - **Purpose:** Defines where and how to apply the returned HTML.
  - **Value:** A space‑separated list of update instructions in the format:  
    ```
    CSS_SELECTOR(REPLACEMENT_STRATEGY)
    ```
    with strategies including:
    - **innerHTML:** Replaces inner content (default).
    - **outerHTML:** Replaces the entire element.
    - **append:** Appends content.
    - **prepend:** Prepends content.
    - **before/after:** Inserts content adjacent to the element.
    - **remove:** Removes the element.
  > **Notes:**  
  > - In `patchedUpdateTarget` (registration.js), if the target selector is `"this"` or empty, the first fragment replaces content and subsequent fragments are appended.
  > - For elements with the **sequential** attribute, DOM updates are queued in a FIFO order.
  > - Non‑sequential updates are scheduled immediately (using setTimeout with 0ms) and can cancel pending calls via AbortController.

### URL State Updates

- **push**, **pull**, **path**  
  - **Purpose:** Manage query parameters and path updates.
  - **Behavior:** Automatically updates the URL state based on API calls.
  > **Notes:**  
  > - The state updates are controlled by the **history** attribute.
  > - Implemented by calling `handleURLState(element)` after API responses.

- **history**  
  - **Purpose:** Controls the effect of URL state changes on browser history.
  - **Value:** Accepts `push`, `replace`, or `none`.
  - **Default:** Context‑sensitive.
  > **Notes:**  
  > - User‑initiated actions (e.g., clicks) default to `push` (new history entry).
  > - Non‑user‑initiated actions (e.g., auto‑fire or polling) default to `replace` to avoid cluttering the history.

### Publish/Subscribe Chaining

- **publish**  
  - **Purpose:** Declares an event to be published after the API call.
  - **Value:** A signal name (e.g., `dataUpdated`).
  - **Default:** Empty.
  > **Notes:**  
  > - When an API call succeeds, the code emits the signal via `emitSignal()`.
  > - Additional timing may be applied if the element has a **timer** attribute.

- **subscribe**  
  - **Purpose:** Specifies one or more events to listen for before triggering the API call.
  - **Value:** Space‑separated list of signal names.
  - **Default:** Empty.
  > **Notes:**  
  > - The registration code attaches listeners for each signal using `registerSignalListener()`.
  > - Signals are processed in the order they appear (leftmost has highest priority).

- **trigger**  
  - **Purpose:** Overrides the default event that initiates an API call or event.
  - **Value:** A DOM event name (e.g., `click`, `submit`).
  - **Default:** `click` for buttons, `submit` for forms.
  > **Notes:**  
  > - The normalized event name is determined by stripping any “on” prefix.
  > - Used in attaching the appropriate event listener in `registerElement`.

- **Emit Header**  
  - **Purpose:** Instructs HTMLeX to publish a specified signal via the HTTP header.
  - **Example:**  
    ```http
    Emit: dataUpdated; delay=1000
    ```
  > **Notes:**  
  > - Processed in `handleAction` where the header is parsed.
  > - If a delay is specified, the signal is emitted after the delay; otherwise, it is emitted immediately.

### Rate Limiting

- **debounce**  
  - **Purpose:** Delays the API call until no events occur for a specified period.
  - **Value:** Time in milliseconds.
  - **Default:** `0` (disabled).
  > **Notes:**  
  > - If set (e.g., `debounce="500"`), the event handler is wrapped to delay execution by 500ms.
  > - Helps prevent rapid, repeated API calls.

- **throttle**  
  - **Purpose:** Enforces a minimum interval between successive API calls.
  - **Value:** Time in milliseconds.
  - **Default:** `0` (disabled).
  > **Notes:**  
  > - When applied, ensures that once an API call is made, further calls are ignored until the throttle interval expires.

### Polling

- **poll**  
  - **Purpose:** Automatically triggers API calls at a fixed interval.
  - **Value:** Time in milliseconds.
  - **Default:** Disabled if omitted.
  > **Notes:**  
  > - Polling can be implemented using a Web Worker (as seen in `actions.js`) or using `setInterval` (in `registration.js`).
  > - The **repeat** attribute can further restrict the number of polling iterations.

- **repeat**  
  - **Purpose:** Limits the number of polling iterations.
  - **Value:** An integer (`0` indicates unlimited).
  - **Default:** `0` (unlimited).
  > **Notes:**  
  > - When used with **poll**, the polling loop terminates after the specified count.
  > - The Web Worker or interval code monitors the iteration count.

### WebSocket Integration & Generic Retry/Timeout

- **socket**  
  - **Purpose:** Connects the element to a WebSocket endpoint for real‑time updates.
  - **Value:** A WebSocket URL.
  - **Default:** None.
  > **Notes:**  
  > - When present, the registration module calls `handleWebSocket()` to establish a connection.
  > - Supports automatic reconnection attempts if retries are configured.

- **retry**  
  - **Purpose:** Specifies how many times to retry a failed API call or WebSocket connection.
  - **Value:** Integer.
  - **Default:** `0` (no retries).
  > **Notes:**  
  > - In `handleAction`, the API call is retried up to the specified count before handling errors.
  > - Useful for transient network issues.

- **timeout**  
  - **Purpose:** Sets a maximum wait time (in milliseconds) for an API call or WebSocket connection.
  - **Value:** Time in milliseconds.
  - **Default:** `0` (disabled).
  > **Notes:**  
  > - Implemented via `fetchWithTimeout` which aborts the API call if the specified duration is exceeded.

### Auto‑Fire, Prefetch & Lazy Loading

- **auto**  
  - **Purpose:** Automatically fires the API call when the element is inserted into the DOM.
  - **Value Options:**  
    - `auto` or `auto=true`: Fire immediately.
    - `auto=prefetch`: Fire immediately, cache the response, but delay UI update.
    - `auto=lazy`: Delay the API call until the element is near the viewport.
  - **Default:** Not auto‑fired unless specified.
  > **Notes:**  
  > - For `auto=lazy`, an IntersectionObserver is used to detect when the element enters the viewport.
  > - In `auto=prefetch`, the response is cached so that the UI update can be triggered later.
  > - The implementation in `registration.js` handles the different modes using conditional logic.

- **cache**  
  - **Purpose:** Caches the API response locally to avoid duplicate calls.
  - **Value:** TTL in milliseconds or a flag.
  - **Default:** Not cached if omitted.
  > **Notes:**  
  > - The functions `getCache` and `setCache` are used in `handleAction` to store and retrieve responses.
  > - For example, `cache="30000"` caches the response for 30 seconds.

### Extras (Inline Parameters)

- **extras**  
  - **Purpose:** Injects additional key=value pairs into the API request payload.
  - **Value:** Space‑separated list (e.g., `locale=en_US theme=dark`).
  - **Default:** Empty.
  > **Notes:**  
  > - The code splits the string and appends each key-value pair to the FormData.
  > - This mechanism allows developers to pass extra contextual parameters with every request.

### Timers

- **timer**  
  - **Purpose:** Delays the publication of events, triggers an API call, or clears content after a specified time.
  - **Value:** Time in milliseconds.
  - **Default:** Not used unless specified.
  > **Notes:**  
  > - In `registration.js`, the timer can trigger a subsequent API call, emit a signal, or remove/clear the target element based on the configuration.
  > - For instance, a `timer="5000"` attribute may remove an element or update its content after 5 seconds.

### Sequential Updates

- **sequential**  
  - **Purpose:** Ensures that API responses and corresponding DOM updates are processed in a FIFO order.
  - **Value:** Optional delay (in milliseconds) between processing updates (e.g., `sequential="150"`).
  - **Default:** Disabled unless specified.
  > **Notes:**  
  > - **Two types of queues are employed:**  
  >   - **Sequential (FIFO):** When an element has the **sequential** attribute, API calls are enqueued and processed one by one in the order they were initiated. The configured delay (if provided) controls the gap between updates.  
  >   - **Non‑Sequential:** For elements without the **sequential** attribute, updates are processed immediately. Pending non‑sequential API calls are cancelled via AbortController and rescheduled (using a 0ms timeout).  
  > - HTTP streaming responses are detected in `processResponse` (actions.js); if multiple chunks are received, the element is marked as streaming and updates are applied immediately outside the sequential queue.
  > - This design prevents rapid, overlapping updates and maintains consistency in the UI.

### Lifecycle Hooks (Optional Extension)

- **onbefore**, **onafter**, **onbeforeSwap**, **onafterSwap**  
  - **Purpose:** Provide custom code execution at different stages of the API call lifecycle.
  - **Value:** JavaScript code to be executed.
  > **Notes:**  
  > - These hooks are dynamically executed using `new Function(...)` within try/catch blocks to ensure errors are logged but do not halt the processing.
  > - For example, **onbefore** is executed just before initiating the API call, while **onafterSwap** is executed after the DOM has been updated.

### Streaming & Progressive Rendering

- **Streaming & Progressive Rendering**  
  - **Purpose:** Processes a single HTTP response that delivers multiple chunks (fragments) to progressively update the UI.
  - **Behavior:**  
    1. The server sends an initial loading fragment immediately.
    2. As chunks arrive, each complete `<fragment>` block is extracted and processed.
    3. If multiple chunks are received, the element is flagged as streaming.
    4. If no complete fragment is found in the remaining buffer, a fallback update is applied.
  > **Notes:**  
  > - Implemented in the `processResponse` function (actions.js), which uses a `ReadableStream` to read chunks.
  > - Streaming responses bypass the sequential queue if more than one chunk is detected, ensuring immediate updates.
  > - The fallback mechanism guarantees that any residual data (if fragments aren’t complete) is applied to the target element.
  > - This approach minimizes latency, providing immediate user feedback while the server processes long-running tasks.

---

## 4. Security Considerations

- **CSRF Protection:**  
  - Standard CSRF tokens or server‑side measures should be implemented.
  > **Notes:**  
  > - HTMLeX does not automatically inject CSRF tokens. Developers should add them manually if needed.

- **Sanitization of Server Responses:**  
  - Server responses must be sanitized to prevent XSS.
  > **Notes:**  
  > - Since HTMLeX performs partial DOM updates using a diffing algorithm, it assumes that incoming HTML is safe. Server‑side sanitization is critical.

- **Cross‑Origin Request Handling:**  
  - Appropriate CORS headers must be set on API endpoints.
  > **Notes:**  
  > - HTMLeX relies on standard browser policies for cross‑origin requests.

- **Debugging and Excessive Logging:**  
  - The **debug** attribute can enable verbose logging for development.
  > **Notes:**  
  > - Extensive logging should be avoided in production as it may expose sensitive details.

---

## 5. Contributing

Contributions, feedback, and improvements are welcome. Please refer to [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

> **Notes:**  
> - When contributing, please consider enhancing lifecycle hooks, sequential update handling, and streaming support based on practical use cases observed in the implementation.

---

## 6. License

This project is licensed under the [MIT License](LICENSE).