# HTMLeX

Version 1.2.3 - Last updated: 2026-04-30

HTMLeX is a server-driven UI playground and browser runtime for declarative, HATEOAS-style HTML interactions. The current project ships a runnable HTTPS demo app, an ESM browser runtime, server render helpers for fragments, Express app helpers, TypeScript declarations, and a strict quality gate for package and runtime safety.

## Contents

- [Current Status](#current-status)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Package Entry Points](#package-entry-points)
- [Runtime Model](#runtime-model)
- [Response Fragments](#response-fragments)
- [Attribute Reference](#attribute-reference)
- [Lifecycle Hooks](#lifecycle-hooks)
- [Demo App](#demo-app)
- [Quality Gate](#quality-gate)
- [Versioned Releases](#versioned-releases)
- [Security Notes](#security-notes)
- [Project Layout](#project-layout)
- [Contributing](#contributing)
- [License](#license)

## Current Status

- ESM-only npm package named `htmlex`.
- Browser runtime entry point: `htmlex`.
- Express app helper entry point: `htmlex/app`.
- Server render helper entry point: `htmlex/render`.
- Type declarations are published for all documented entry points.
- Demo server runs on Express 5, HTTPS, and Socket.IO.
- Local HTTPS certificates are generated into `tmp/cert` when needed.
- CI runs the full quality gate on Node `20.19.0`, `22`, and `24`.
- CI uploads a packed npm artifact after the build and test gate passes on Node `20.19.0`.
- GitHub Releases are created from version tags only after the full quality gate passes.
- Published package contents are limited to `src/` and project documentation.

## Requirements

- Node `^20.19.0 || ^22.13.0 || >=24`.
- npm with lockfile installs.
- OpenSSL available on `PATH` for generated localhost HTTPS certificates, unless `TLS_KEY_PATH` and `TLS_CERT_PATH` are supplied.

The repository includes `.node-version` and `.npmrc` with `engine-strict=true`, so unsupported Node versions fail fast during install.

## Quick Start

```bash
npm ci
npm start
```

Open `https://localhost:5500`. The browser may ask you to accept the generated localhost certificate on first run.

The server reads `PORT`, `TLS_KEY_PATH`, `TLS_CERT_PATH`, `HTMLEX_CERT_DIR`, `HTMLEX_LOG_LEVEL`, and `HTMLEX_LOG_FORMAT`. Playwright uses port `5600` through `playwright.config.js`.

For development with automatic restart:

```bash
npm run dev
```

## Package Entry Points

HTMLeX is ESM-only. Use `import` or dynamic `import()` from CommonJS code.

```js
import {
  createHTMLeXElementClass,
  defineHTMLeXElement,
  hooks,
  initHTMLeX,
  registerLifecycleHook
} from 'htmlex';
```

```js
import {
  app,
  createApp,
  createHttpsServer,
  installProcessHandlers,
  startServer,
  stopServer
} from 'htmlex/app';
```

```js
import {
  div,
  rawHtml,
  render,
  renderFragment,
  tag
} from 'htmlex/render';
```

The default browser entry installs the runtime error boundary and exposes lifecycle hooks on `window.HTMLeX.hooks` when a browser `window` exists.

## Runtime Model

HTMLeX scans the DOM for elements with declarative action attributes, registers event handlers, and keeps observing inserted or changed nodes. Server responses are HTML fragments or fallback HTML strings. The client applies those responses to declared targets without client-side JSON state.

Minimal browser setup:

```html
<script type="module">
  import { hooks, initHTMLeX } from '/src/htmlex.js';

  hooks.register('todo:create:after', ({ element }) => {
    element.reset?.();
  });

  document.addEventListener('DOMContentLoaded', () => {
    initHTMLeX();
  });
</script>
```

Minimal action markup:

```html
<form
  post="/todos/create"
  target="#todo-list(append)"
  loading="#todo-status(innerHTML)"
  onerror="#todo-status(innerHTML)"
  onafter="todo:create:after"
>
  <input name="text" required>
  <button type="submit">Add</button>
</form>

<div id="todo-status"></div>
<div id="todo-list"></div>
```

On submit, HTMLeX gathers form data, sends the `POST`, processes the HTML response, updates `#todo-list`, and runs named lifecycle hooks if they are registered.

## Response Fragments

Server endpoints can return one or more `<fragment>` blocks. Each fragment declares where its inner HTML should be applied.

```html
<fragment target="#todo-list(append)">
  <div class="todo-item" data-key="42">Ship the docs</div>
</fragment>
```

Supported target strategies are:

- `innerHTML`
- `outerHTML`
- `append`
- `prepend`
- `before`
- `after`
- `remove`

Fragments can be streamed. Complete fragment blocks are applied as they arrive, and trailing non-fragment HTML falls back to the caller's `target` attribute.

Server render helper example:

```js
import { div, render, renderFragment } from 'htmlex/render';

const itemHtml = render(
  div({ class: 'todo-item', 'data-key': todo.id }, todo.text)
);

res.type('html').send(renderFragment('#todo-list(append)', itemHtml));
```

Error-status fragments render their content but skip success-only side effects such as `publish`, `Emit` headers, URL updates, caching, and `onafter` hooks:

```html
<fragment target="#todo-status(innerHTML)" status="422">
  <div class="error">Please enter a todo.</div>
</fragment>
```

## Attribute Reference

HTML attribute names are case-insensitive. Examples use lowercase because browsers normalize HTML markup that way.

| Attribute | Purpose |
| --- | --- |
| `get`, `post`, `put`, `delete`, `patch` | Sends an HTTP request to the attribute value. `GET` serializes form data into the query string; other methods send `FormData`. |
| `source` | Adds form controls from extra selector matches. Comma-separated selectors are preferred; whitespace-separated selectors are supported as a fallback. |
| `extras` | Adds inline `key=value` pairs to the request data. Values may contain `=` after the first separator. |
| `target` | Applies response HTML to one or more `selector(strategy)` targets. `this` targets the triggering element. |
| `loading` | Applies a loading placeholder to the declared target while the current request is pending. |
| `onerror` | Applies an escaped error message to the declared target after the final failed fetch attempt. |
| `trigger` | Overrides the default event. Forms default to `submit`; other action elements default to `click`. A leading `on` prefix is ignored. |
| `debounce` | Delays action execution until events stop for the given milliseconds. |
| `throttle` | Allows at most one action in the given millisecond window. |
| `auto` | Fires on registration. Use a millisecond delay, `prefetch`, `lazy`, or `false`. Lazy mode uses `IntersectionObserver` when available. |
| `poll` | Repeats the action at an interval. Values below the runtime floor are clamped. |
| `repeat` | Limits the number of poll iterations. `0` or omission means unlimited. |
| `publish` | Emits a named client signal after a successful action, or on the trigger event for publish-only elements. |
| `subscribe` | Runs the element's action when any listed client signal is emitted. |
| `timer` | Runs a delayed action. With an HTTP method it calls the endpoint, with `publish` it emits the signal, otherwise it clears or removes the target. |
| `sequential` | Queues requests and DOM updates FIFO. A numeric value adds a delay between queue flushes. `false` disables it. |
| `retry` | Number of retry attempts after failed requests. |
| `timeout` | Fetch timeout in milliseconds. `0` disables timeout. |
| `retrydelay`, `retry-delay` | Base delay before retry attempts. |
| `retrybackoff`, `retry-backoff` | Retry delay multiplier. Minimum valid value is `1`. |
| `retrymaxdelay`, `retry-max-delay` | Maximum retry delay in milliseconds. |
| `cache` | Caches successful response text for the given TTL in milliseconds. Non-positive or empty values cache without expiry until evicted. |
| `push` | Adds or replaces URL query parameters from `key=value` pairs. |
| `pull` | Removes URL query parameters by key. |
| `path` | Replaces the URL path. |
| `history` | Controls URL mutation: `push`, `replace`, or `none`. Defaults to `replace`. |
| `socket` | Opens a Socket.IO connection and applies incoming payloads to `target`. The socket closes when the element leaves the DOM. |
| `onbefore` | Runs named lifecycle hooks before the request starts. |
| `onbeforeswap` | Runs named lifecycle hooks before response HTML is applied. |
| `onafterswap` | Runs named lifecycle hooks after scheduled DOM swaps complete. |
| `onafter` | Runs named lifecycle hooks after a successful action and successful swaps. |
| `max-response-chars`, `maxresponsechars`, `max-response-buffer`, `maxresponsebuffer` | Overrides the default 1 MiB response text safety limit for an action. |

The client also processes the response header `Emit`. The first header segment is the signal name, and `delay=<ms>` can delay emission:

```http
Emit: todos:changed; delay=250
```

## Lifecycle Hooks

Lifecycle attributes contain hook names, not JavaScript. Script-like values are ignored and logged. Register callbacks through the public hook API:

```js
import { hooks } from 'htmlex';

const unregister = hooks.register('todo:create:before', ({ element, event }) => {
  event?.preventDefault?.();
  element.classList.add('is-submitting');
});

hooks.unregister('todo:create:before');
unregister();
```

Hook scopes are available with `hooks.scope('name')` and through the `hookscope` or `data-htmlex-hook-scope` attributes. Scoped elements fall back to the global scope when a scoped hook is not registered.

Lifecycle events are also dispatched as DOM events:

- `htmlex:hook`
- `htmlex:onbefore`
- `htmlex:onbeforeswap`
- `htmlex:onafterswap`
- `htmlex:onafter`

## Demo App

The included demo app is both a playground and an integration target for tests. It includes:

- Demo catalog and generated demo detail pages.
- Todo CRUD with atomic local persistence.
- Click counter, multi-fragment updates, loading/error states, and signal chaining.
- Infinite scroll and streamed fragments.
- Polling, sequential queues, retry behavior, and delayed timers.
- Socket.IO chat and live update namespaces.
- Browser diagnostics and runtime error logging.

The app applies baseline security headers, request IDs, route error boundaries, multipart limits, structured server logging, and graceful shutdown handling.

## Quality Gate

Run the full project gate before publishing or merging:

```bash
npm run quality
```

That command runs:

- Text hygiene checks for LF endings, final newline, no trailing whitespace, and no UTF-8 BOM.
- Lockfile reproducibility with `npm ci --ignore-scripts --dry-run`.
- Dependency tree and reviewed license-policy checks.
- Syntax, ES module, modern JavaScript, and safety checks.
- Package metadata, package file allowlist, `npm pack --dry-run`, `publint`, and Are The Types Wrong checks.
- ESLint.
- Production dependency audit at moderate-or-higher severity.
- Unit tests with per-file coverage thresholds.
- Playwright browser tests against the HTTPS demo app.
- Release-version checks that keep `package.json`, `package-lock.json`, README version text, and version tags aligned.

Useful focused commands:

```bash
npm run lint
npm run test:unit
npm run test:e2e
npm run check:pack
npm run check:types
```

Current implementation coverage is tracked in [COVERAGE.md](COVERAGE.md), and release notes are tracked in [CHANGELOG.md](CHANGELOG.md).

## Versioned Releases

Releases are driven by Git tags that match the package version. The release workflow refuses to publish unless the tag is exactly `v${package.json.version}` and the full quality gate passes, including unit coverage and Playwright e2e tests.

Before tagging a release, update the version in `package.json`, `package-lock.json`, and the README version line, then run:

```bash
npm run quality
npm run check:release-version -- v1.2.3
```

Create and push the matching tag:

```bash
git tag v1.2.3
git push origin v1.2.3
```

The `Release` workflow then:

- Checks out the tag and validates it against package metadata.
- Runs `npm run quality`.
- Builds the release tarball with `npm pack`.
- Creates or updates the GitHub Release titled `HTMLeX <version>`.
- Uploads the `.tgz` package artifact to the release.

The same workflow can be re-run manually from GitHub Actions with an existing version tag.

## Security Notes

- HTMLeX expects server-owned HTML. Escape user data before rendering it into fragments.
- `htmlex/render` escapes text and attributes by default. Use `rawHtml()` only for trusted, server-owned markup.
- Lifecycle hooks are named callbacks. Attribute values are never evaluated as JavaScript.
- Error messages rendered through `onerror` are escaped.
- Browser diagnostics keep a bounded in-memory log at `window.__HTMLEX_DIAGNOSTICS__` and emit `htmlex:log` events.
- The demo app is same-origin and does not include a full application auth or CSRF model. Add those controls in real deployments.
- The package intentionally blocks CommonJS `require` resolution because the runtime is ESM-only.
- Generated media, local certs, coverage output, Playwright reports, package tarballs, and other build artifacts should stay out of git.

## Project Layout

```text
src/app.js                     Express app factory and HTTPS runtime helpers
src/server.js                  CLI server entry point
src/components/HTMLeX.js       Server-side render and fragment helpers
src/components/Components.js   Demo UI rendering helpers
src/features/                  Demo route handlers and Socket.IO namespaces
src/persistence/               Demo seed data and catalog metadata
src/public/src/                Browser runtime modules
tests/unit/                    Node test runner unit tests
tests/e2e/                     Playwright browser tests
scripts/                       Quality, package, syntax, safety, and policy checks
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening changes. Keep edits scoped, run the focused checks relevant to your change, and run `npm run quality` for release or package-facing work.

## License

HTMLeX is released under the [ISC License](LICENSE).
