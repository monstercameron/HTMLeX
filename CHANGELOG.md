# Changelog

## 2026-04-29

Reviewed prior repository history before this release. The earlier commits built the demo catalog, todo demo, arbitrary targeting and removal strategies, multi-fragment updates, click counter, signal chaining, loading states, websocket/live-update demos, sequential queuing fixes, debounce behavior, non-sequential cancellation, target removal handling, logger revisions, and README updates.

This update hardens that surface and packages it for repeatable testing:

- Reworked the playground shell with Bootstrap 5, a more polished catalog/workspace layout, and HTML snippets for every demo example.
- Simplified the dev server to HTTPS over Express with generated local certificates and removed committed certificate artifacts.
- Tightened HTMLeX registration, cleanup, timer, subscription, socket, cache, source, target, and fragment handling to avoid stale listeners, stale swaps, accidental global source matches, duplicate fragment timers, and unnecessary modifier-only registrations.
- Added extensive Playwright coverage for the demo pages, complex page scenarios, interceptors, edge cases, and browser-context property behavior.
- Added unit coverage for rendering, components, cache behavior, route registration, rate limiting, and streaming routes.
- Updated dependencies, test scripts, Playwright configuration, and package lock data.

Follow-up quality pass:

- Modernized remaining runtime loops and queues, tightened naming, and extracted clearer helpers around target resolution, timer handling, sockets, logging, and fragment responses.
- Added a dependency-free syntax check to the quality gate and direct unit coverage for shared fragment response helpers.
- Re-ran the complete quality suite: syntax check, unit tests, and full Playwright e2e coverage.

Diagnostics and error-boundary pass:

- Added structured server logging with timestamps, scopes, request IDs, route names, status codes, durations, and normalized error payloads.
- Added Express request context, route wrapping, 404 handling, and unhandled route error middleware so failures return debuggable request IDs.
- Replaced feature-route `console.error` calls with request-aware warnings and errors across todos, demos, streaming, chat, sockets, TLS setup, and shared response helpers.
- Added a browser runtime error boundary for uncaught errors and unhandled promise rejections through the HTMLeX logger.
- Added unit coverage for server logger normalization and request-ID diagnostics on missing routes.

Diagnostics follow-up:

- Added an in-browser HTMLeX diagnostics ring buffer and `htmlex:log` event stream so warnings, errors, and runtime-boundary failures can be inspected from DevTools or tests.
- Added optional JSON server-log formatting via `HTMLEX_LOG_FORMAT=json` and dynamic `HTMLEX_LOG_LEVEL` handling.
- Added browser e2e coverage for warning/error diagnostics and runtime-boundary logging, plus cleaner unit-test output for expected warning paths.

Diagnostics serialization hardening:

- Made server JSON/text logs safe for circular objects, `BigInt`, buffers, typed arrays, dates, functions, symbols, deep objects, and oversized payloads.
- Made browser diagnostics entries safe and bounded for circular payloads, `BigInt`, DOM elements, events, deep objects, and oversized arrays/objects.
- Added `Logger.diagnostics.snapshot()` and `Logger.diagnostics.last(level)` helpers for easier DevTools and test inspection.
- Hardened timer callbacks so stale timers skip work when their `timer` attribute has changed or been removed before the callback runs.

ESNext modernization pass:

- Replaced legacy ES module path shims with `import.meta.dirname` and `import.meta.filename`.
- Converted Node runtime imports to explicit `node:` specifiers and modernized parsing calls to `Number.parseInt`.
- Moved TLS certificate loading and generation off synchronous filesystem/process APIs.
- Updated server entry points and the syntax checker to use top-level `await` with explicit startup error handling.
- Added a Node engine floor for the ES module runtime APIs used by the app.

ESNext modernization follow-up:

- Expanded the syntax gate to include repository scripts.
- Flattened delayed streaming routes into direct `async`/`await` control flow with a shared response-delay helper.
