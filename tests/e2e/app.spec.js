import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const dataPath = path.resolve(import.meta.dirname, '../../src/persistence/data.json');
const demosPath = path.resolve(import.meta.dirname, '../../src/persistence/demos.json');
const appPort = 5600;
const responseFailures = new WeakMap();

let originalTodos;
let demos;

const expectedCanvasText = {
  todoApp: 'Todo App with Lifecycle Hooks',
  infiniteScroll: 'Infinite Scrolling List',
  notifications: 'Notifications',
  clickCounter: 'Clicker Counter',
  chatInterface: 'Chat Interface',
  multiFragment: 'Multi',
  signalChaining: 'Signal Chaining',
  sseDemo: 'SSE Subscriber',
  websocketUpdates: 'Live WebSocket Feed',
  sequentialDemo: 'Sequential API Calls',
  loadingDemo: 'Loading State Demo',
  pollingDemo: 'Polling Demo',
  hoverTriggerDemo: 'Hover Trigger Demo'
};

test.beforeAll(async () => {
  originalTodos = await fs.readFile(dataPath, 'utf8');
  demos = JSON.parse(await fs.readFile(demosPath, 'utf8'));
});

test.afterAll(async () => {
  await fs.writeFile(dataPath, originalTodos);
});

test.beforeEach(async ({ page }) => {
  await fs.writeFile(dataPath, originalTodos);
  const failures = [];
  responseFailures.set(page, failures);
  page.on('response', response => {
    const url = new URL(response.url());
    if (
      url.hostname === 'localhost' &&
      Number(url.port) === appPort &&
      url.pathname !== '/favicon.ico' &&
      response.status() >= 400
    ) {
      failures.push(`${response.status()} ${url.pathname}`);
    }
  });

  await page.goto('/');
  await expect(page.locator('[get="/todos/init"]')).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(responseFailures.get(page) ?? []).toEqual([]);
});

async function loadDemo(page, initHref, rootSelector) {
  await page.locator(`[get="${initHref}"]`).click();
  await expect(page.locator(rootSelector)).toBeVisible();
  await expect(page.locator('#demoCanvas .snippet-panel')).toBeVisible();
}

test('shell loads Bootstrap 5 and no Tailwind runtime', async ({ page }) => {
  await expect(page.locator('link[href*="bootstrap@5.3.8"]')).toHaveCount(1);
  await expect(page.locator('script[src*="cdn.tailwindcss.com"]')).toHaveCount(0);
  await expect(page.locator('link[href="./styles.css"]')).toHaveCount(1);
});

test('every demo card initializes a working canvas view', async ({ page }) => {
  for (const demo of demos) {
    await page.locator(`[get="${demo.initDemoHref}"]`).click();
    await expect(page.locator('#demoCanvas')).toContainText(expectedCanvasText[demo.id]);
    await expect(page.locator('#demoCanvas .snippet-panel')).toBeVisible();
    await expect(page.locator('#demoCanvas .snippet-panel code')).toContainText('<');
    await expect(page.locator('#demoCanvas')).not.toContainText('Cannot GET');
    await expect(page.locator('#demoCanvas')).not.toContainText('undefined');
  }
});

test('todo flow escapes malicious text and does not nest duplicate todo lists', async ({ page }) => {
  const payload = '<img src=x onerror="window.__todoXss=1">';

  await loadDemo(page, '/todos/init', '#todoApp');
  await expect(page.locator('#todoApp form[data-htmlex-registered="true"]')).toBeVisible();
  await page.locator('#todoInput').fill(payload);
  await page.locator('#todoApp button[type="submit"]').click();

  await expect(page.locator('#todoList')).toContainText(payload);
  await expect(page.locator('#todoList img')).toHaveCount(0);
  await expect(page.locator('#todoList #todoList')).toHaveCount(0);
  await expect(page.evaluate(() => window.__todoXss)).resolves.toBeUndefined();
});

test('todo demo supports create, edit, and delete', async ({ page }) => {
  const todoText = `Playwright todo ${Date.now()}`;
  const updatedText = `Edited item ${Date.now()}`;

  await loadDemo(page, '/todos/init', '#todoApp');
  await page.locator('#todoInput').fill(todoText);
  await page.locator('#todoApp button[type="submit"]').click();
  await expect(page.locator('#todoList')).toContainText(todoText);

  await page.locator('.todo-item', { hasText: todoText }).getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('.edit-form input[name="todo"]')).toHaveValue(todoText);
  await page.locator('.edit-form input[name="todo"]').fill(updatedText);
  await page.locator('.edit-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#todoList')).toContainText(updatedText);
  await expect(page.locator('#todoList')).not.toContainText(todoText);

  await page.locator('.todo-item', { hasText: updatedText }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#todoList')).not.toContainText(updatedText);
});

test('infinite scroll demo appends streamed items', async ({ page }) => {
  await loadDemo(page, '/items/init', '#infiniteScrollDemo');
  await page.locator('#demoCanvas').getByRole('button', { name: 'Load More' }).click();

  await expect(page.locator('#infiniteList')).toContainText('Loading more items');
  await expect(page.locator('#infiniteList')).toContainText(/Item \d+/);
  await expect(page.locator('#infiniteList .surface-muted')).toHaveCount(6);
});

test('notifications demo renders the delayed notification', async ({ page }) => {
  await loadDemo(page, '/notifications/init', '#notifications');
  await page.locator('#demoCanvas').getByRole('button', { name: 'Get Notification' }).click();

  await expect(page.locator('#notificationArea')).toContainText('You have a new notification');
});

test('click counter demo increments the counter', async ({ page }) => {
  await loadDemo(page, '/counter/init', '#clickCounter');
  await expect(page.locator('#counterDisplay')).toContainText('0');

  await page.locator('#demoCanvas').getByRole('button', { name: 'Click Me!' }).click();
  await expect(page.locator('#counterDisplay')).toContainText('Counter: 1');
});

test('multi-fragment demo updates both targets from one response', async ({ page }) => {
  await loadDemo(page, '/multi/init', '#multiFragment');
  await page.locator('#demoCanvas').getByRole('button', { name: 'Load Multi-Fragment Update' }).click();

  await expect(page.locator('#multiUpdate1')).toContainText('Primary Content Loaded');
  await expect(page.locator('#multiUpdate2')).toContainText('Additional Content Appended');
});

test('signal chaining demo runs all chained process steps', async ({ page }) => {
  await loadDemo(page, '/process/init', '#signalChaining');
  await page.locator('#demoCanvas').getByRole('button', { name: 'Start Process' }).click();

  for (const step of [1, 2, 3, 4, 5]) {
    await expect(page.locator('#chainOutput')).toContainText(`Step ${step}:`);
  }
});

test('SSE subscriber demo reacts to the emitted signal', async ({ page }) => {
  await loadDemo(page, '/sse/init', '#sseDemo');
  await page.locator('#demoCanvas').getByRole('button', { name: 'Get SSE Signal' }).click();

  await expect(page.locator('#sseDemo')).toContainText('SSE action performed');
});

test('sequential demo appends queued responses', async ({ page }) => {
  await loadDemo(page, '/sequential/init', '#sequentialDemo');
  await page.locator('#demoCanvas').getByRole('button', { name: 'Sequential, First In First Out' }).click();

  await expect(page.locator('#sequentialOutput')).toContainText(/\d{4}-\d{2}-\d{2}T/);
});

test('loading demo streams loading and final payload states', async ({ page }) => {
  await loadDemo(page, '/demo/init', '#loadingDemo');
  await page.locator('#demoCanvas').getByRole('button', { name: 'Load Payload' }).click();

  await expect(page.locator('#loadingDemoOutput')).toContainText('Payload received after 5000ms');
});

test('polling demo automatically receives scheduled updates', async ({ page }) => {
  await loadDemo(page, '/polling/init', '#pollingDemo');

  await expect(page.locator('#pollingOutput')).toContainText(/Polling update at \d{4}-\d{2}-\d{2}T/);
});

test('hover trigger demo debounces hover-triggered updates', async ({ page }) => {
  await loadDemo(page, '/hover/init', '#hoverTriggerDemo');
  await page.locator('#demoCanvas').getByRole('button', { name: 'Hover Action' }).hover();

  await expect(page.locator('#hoverOutput')).toContainText('Hover action loaded');
});

test('streaming endpoints return complete progressive responses', async ({ request }) => {
  const loadMore = await request.get('/items/loadMore', { timeout: 5000 });
  expect(loadMore.ok()).toBeTruthy();
  const loadMoreBody = await loadMore.text();
  expect(loadMoreBody).toContain('Loading more items');
  expect(loadMoreBody).toMatch(/Item \d+/);

  const loading = await request.get('/demo/loading', { timeout: 5000 });
  expect(loading.ok()).toBeTruthy();
  const loadingBody = await loading.text();
  expect(loadingBody).toContain('Loading, wait 5000ms');
  expect(loadingBody).toContain('Payload received after 5000ms');
});

test('chat messages are escaped when delivered over Socket.IO', async ({ page }) => {
  const payload = '<img src=x onerror="window.__chatXss=1">';

  await loadDemo(page, '/chat/init', '#chatInterface');
  await page.locator('#chatInterface input[name="message"]').fill(payload);
  await page.locator('#chatInterface button[type="submit"]').click();

  await expect(page.locator('#chatMessages')).toContainText(payload);
  await expect(page.locator('#chatMessages img')).toHaveCount(0);
  await expect(page.evaluate(() => window.__chatXss)).resolves.toBeUndefined();
});

test('live updates connect through the same-origin Socket.IO namespace', async ({ page }) => {
  await loadDemo(page, '/updates/init', '#websocketUpdates');

  await expect(page.locator('#liveFeed')).toContainText(/Live update at/);
});
