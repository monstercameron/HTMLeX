import js from '@eslint/js';

const sharedGlobals = {
  AbortController: 'readonly',
  Buffer: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  CustomEvent: 'readonly',
  Event: 'readonly',
  DOMException: 'readonly',
  FormData: 'readonly',
  Headers: 'readonly',
  history: 'readonly',
  performance: 'readonly',
  process: 'readonly',
  queueMicrotask: 'readonly',
  ReadableStream: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly'
};

const browserGlobals = {
  customElements: 'readonly',
  document: 'readonly',
  Element: 'readonly',
  ErrorEvent: 'readonly',
  fetch: 'readonly',
  File: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLElement: 'readonly',
  HTMLSelectElement: 'readonly',
  IntersectionObserver: 'readonly',
  io: 'readonly',
  localStorage: 'readonly',
  MouseEvent: 'readonly',
  MutationObserver: 'readonly',
  Node: 'readonly',
  requestAnimationFrame: 'readonly',
  sessionStorage: 'readonly',
  window: 'readonly'
};

export default [
  {
    ignores: [
      '.playwright/**',
      'coverage/**',
      'media/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'tmp/**'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: sharedGlobals
    },
    rules: {
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }]
    }
  },
  {
    files: ['src/public/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      globals: browserGlobals
    }
  }
];
