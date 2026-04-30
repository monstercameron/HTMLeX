# HTMLeX Implementation Coverage Analysis

## Fully Implemented And Tested Features

### Core Functionality

1. **API Calls & Data Collection**
   - HTTP verb attributes: `GET`, `POST`, `PUT`, `DELETE`, and `PATCH`.
   - Form data collection from action elements and source selectors.
   - `extras` inline parameters, including values containing equals signs.

2. **DOM Updates**
   - Target strategies: `innerHTML`, `outerHTML`, `append`, `prepend`, `before`, `after`, and `remove`.
   - Fragment processing for normal, streamed, default, and caller-overridden targets.
   - Fragment selector targets update each resolved element once and fall back to the triggering element when no selector match exists.
   - Keyed children are reconciled by `id`, `data-key`, `key`, or `data-htmlex-key` so reordered lists preserve matching nodes.
   - Focused form controls and media elements preserve live state through compatible diffs.
   - Mutation-based re-registration for inserted or changed HTMLeX controls.

3. **URL State Updates**
   - `push`, `pull`, `path`, and `history` modes.
   - `history="none"` is tested to skip URL mutation while still applying responses.

4. **Signals And Chaining**
   - `publish` and `subscribe` signal flow.
   - `Emit` response header handling, including delayed emits and cleanup when source elements are removed.

5. **Feedback States**
   - `loading` and `onerror` targets, including `this(...)` targets.
   - Error messages are escaped before being rendered into `onerror` targets.
   - Error-status fragments render their content while skipping success-only side effects.
   - Browser diagnostics capture warnings, runtime errors, and unhandled promise rejections.
   - Timer actions cover target removal, publish signals, API calls, invalid delays, fragment-inserted timers, and cancellation when the `timer` attribute changes or is removed.

6. **Rate Limiting**
   - `debounce` and `throttle`, including cleanup of pending delayed work.

7. **Polling**
   - Managed polling intervals with `repeat` support.
   - Poll intervals are clamped to reduce request pressure.
   - Polling is cleaned up when elements are removed or re-registered.

8. **WebSocket Integration**
   - Socket.IO chat and live-update demos.
   - Direct socket chat messages share the same normalized chat history as HTTP-submitted messages.
   - Client sockets disconnect when owning elements are removed.
   - Server shutdown closes the shared Socket.IO runtime before exiting.

9. **Auto-Fire And Lazy Loading**
   - Immediate auto, delayed auto, `auto="prefetch"`, and `auto="lazy"`.
   - Lazy loading uses `IntersectionObserver` when available and has a tested fallback.

10. **Caching**
    - Cache storage, TTL support, GET and non-GET cache keys, and cache-hit side effects.

11. **Sequential Updates**
    - FIFO request/update queueing; queued API calls start one at a time.
    - Stale sequential work is canceled when elements are removed or action attributes change.

12. **Lifecycle Hooks**
    - Named `onbefore`, `onafter`, `onbeforeSwap`, and `onafterSwap` hooks through `HTMLeX.hooks`.
    - Script-like attribute values are ignored and logged instead of executed.
    - Runtime hook clearing is kept out of the public browser entry point.

13. **Packaging And Integration**
    - Package exports point to the browser runtime by default, with explicit app and render helper subpaths.
    - Export entries include explicit ESM `import` conditions and TypeScript declaration paths.
    - CommonJS `require` resolution is explicitly blocked for the ESM-only package instead of falling through to ESM files.
    - `typesVersions` mappings cover documented subpaths for legacy TypeScript resolution.
    - TypeScript declarations cover the public runtime, app helpers, and render helper APIs.
    - The npm package uses a `files` allowlist so published artifacts include runtime source and docs without test suites, CI config, or large demo media.
    - README links resolve to committed `LICENSE` and `CONTRIBUTING.md` files, and package/readme licensing agree on ISC.
    - A custom-element adapter exposes `defineHTMLeXElement()` and `createHTMLeXElementClass()`.
    - Demo catalog Learn More links resolve to generated detail pages instead of unhandled routes.
    - Seed fixtures are checked to avoid placeholder todo data and stale demo-catalog fields.

14. **Retry Policy**
    - Retry count, timeout aborts, retry delays, exponential backoff, and maximum retry delay are implemented.

## Verified Quality Gates

- Text hygiene checks enforce LF endings, final newlines, no trailing whitespace, and no UTF-8 BOM in repository text files.
- Lockfile reproducibility checks validate that `npm ci` can install from the committed package metadata without running lifecycle scripts.
- Dependency tree checks reject missing or invalid non-optional dependency resolutions.
- License policy checks allow reviewed permissive dependency licenses and reject missing, unknown, or copyleft license expressions.
- Engine checks align `package.json`, `.node-version`, `.npmrc`, and CI with the supported Node toolchain.
- Syntax checks cover project JavaScript.
- Modern JavaScript checks enforce ES module and ESNext-oriented style.
- Safety checks reject `eval` and dynamic function constructors across repository JavaScript, including root tooling config.
- Package metadata checks enforce required docs, package allowlist entries, public export targets, TypeScript subpath mappings, ESM-only require blocking, author/keyword metadata, license alignment, absence of generated tarballs, and absence of oversized tracked artifacts.
- ESLint runs over source, scripts, and tests.
- Unit coverage uses per-file thresholds of 76% lines, 59% branches, and 80% functions, with unit test files run serially to avoid shared fixture contention.
- Playwright covers real browser behavior across the demo app, interceptor attributes, complex page scenarios, and edge cases.
- Production dependency audit runs with `npm audit --omit=dev --audit-level=moderate`.
- Full dependency audit and `npm outdated` checks are clean after the Express 5 upgrade.
- `npm run check:pack` runs `npm pack --dry-run` and verifies the package contents stay scoped to source and docs.
- `npm run check:publint` and `npm run check:types` validate package metadata and TypeScript entrypoint resolution for the ESM-only package.
- GitHub Actions runs the same quality gate on pushes to `main` and pull requests across Node 20.19.0, Node 22, and Node 24, with read-only repository permissions and a bounded job timeout.
- Strict baseline security headers, CSP, request ID validation, and multipart payload limits are covered by unit and browser tests.

## Current Quality Status

There are no documented implementation gaps in the declared runtime surface. Future work should be treated as new feature design, not missing coverage for the current project contract.
