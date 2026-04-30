# Contributing

Thank you for improving HTMLeX. Keep changes focused, tested, and aligned with the declarative server-driven UI model documented in `README.md`.

## Development Setup

Use Node 20.19.0, Node 22.13.0 or newer within the Node 22 line, or Node 24 and newer. The repository includes `.node-version` and `.npmrc` so unsupported Node versions fail fast during install.

1. Install dependencies:

   ```powershell
   npm ci
   ```

2. Run the full quality gate before opening a pull request:

   ```powershell
   npm run quality
   ```

## Expectations

- Add focused unit or Playwright coverage for changed runtime behavior.
- Keep public package exports and TypeScript declarations in sync with implementation changes.
- Avoid inline script execution paths in lifecycle hooks or declarative attributes.
- Preserve existing security guarantees around escaping, request IDs, multipart limits, and cleanup of timers, listeners, sockets, and pending requests.
- Update `README.md`, `COVERAGE.md`, and `CHANGELOG.md` when behavior, packaging, or support policy changes.
