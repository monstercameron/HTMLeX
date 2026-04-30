import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  use: {
    baseURL: 'https://localhost:5600',
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'node src/server.js',
    url: 'https://localhost:5600',
    ignoreHTTPSErrors: true,
    env: {
      PORT: '5600',
      HTMLEX_TEST_FAST: '1',
      HTMLEX_TODO_DATA_FILE: 'tmp/playwright-todos.json'
    },
    reuseExistingServer: false,
    timeout: 20000
  }
});
