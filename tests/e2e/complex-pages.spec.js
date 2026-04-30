import { expect, test } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';

async function mountHTMLeX(page, html) {
  await page.evaluate(async (fixtureHtml) => {
    window.scrollTo(0, 0);
    document.body.innerHTML = `<main id="fixture">${fixtureHtml}</main>`;
    window.scrollTo(0, 0);
    const { initHTMLeX } = await import('/src/htmlex.js');
    initHTMLeX();
  }, html);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('commerce search page combines source, extras, fragments, lifecycle hooks, publish/subscribe, and URL state', async ({ page }) => {
  const events = [];
  let auditCalls = 0;

  await page.goto('/?old=1&keep=1');
  await page.route('**/scenario/products**', async (route) => {
    const url = new URL(route.request().url());
    events.push({
      q: url.searchParams.get('q'),
      token: url.searchParams.get('token'),
      scope: url.searchParams.get('scope')
    });
    await route.fulfill({
      contentType: 'text/html',
      body: `
        <fragment target="#resultsStatus(innerHTML)"><strong>Found laptop inventory</strong></fragment>
        <fragment target="#productRows(innerHTML)">
          <tr><td>Latitude 14</td><td>alpha</td><td>active</td></tr>
          <tr><td>Docking station</td><td>alpha</td><td>active</td></tr>
        </fragment>
        <fragment target="#summaryPanel(innerHTML)">Scoped by alpha / active</fragment>
      `
    });
  });
  await page.route('**/scenario/audit', route => {
    auditCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `Audit refreshed:${auditCalls}` });
  });

  await mountHTMLeX(page, `
    <section id="commercePage">
      <input id="globalToken" name="token" value="alpha">
      <form id="productSearch"
        GET="/scenario/products"
        source="#globalToken"
        extras="scope=active"
        target="#resultsStatus(innerHTML)"
        loading="#resultsStatus(innerHTML)"
        publish="products-loaded"
        push="view=products"
        pull="old"
        path="/workspace/products"
        history="push"
        onbefore="complex:before"
        onbeforeSwap="complex:before-swap"
        onafterSwap="complex:after-swap"
        onafter="complex:after">
        <input id="productQuery" name="q" value="laptop">
        <button type="submit">Search</button>
      </form>
      <div id="resultsStatus"></div>
      <table><tbody id="productRows"></tbody></table>
      <aside id="summaryPanel"></aside>
      <div id="auditPanel" subscribe="products-loaded" GET="/scenario/audit" target="#auditPanel(innerHTML)"></div>
    </section>
  `);
  await page.evaluate(() => {
    window.__complexHooks = [];
    window.HTMLeX.hooks.register('complex:before', () => window.__complexHooks.push('before'));
    window.HTMLeX.hooks.register('complex:before-swap', () => window.__complexHooks.push('beforeSwap'));
    window.HTMLeX.hooks.register('complex:after-swap', () => window.__complexHooks.push('afterSwap'));
    window.HTMLeX.hooks.register('complex:after', () => window.__complexHooks.push('after'));
  });

  await page.locator('#productSearch button').click();

  await expect(page.locator('#resultsStatus')).toContainText('Found laptop inventory');
  await expect(page.locator('#productRows tr')).toHaveCount(2);
  await expect(page.locator('#summaryPanel')).toHaveText('Scoped by alpha / active');
  await expect(page.locator('#auditPanel')).toHaveText('Audit refreshed:1');
  await expect(page).toHaveURL(/\/workspace\/products\?keep=1&view=products$/);
  await expect.poll(() => page.evaluate(() => window.__complexHooks)).toEqual([
    'before',
    'beforeSwap',
    'afterSwap',
    'after'
  ]);
  expect(events).toEqual([{ q: 'laptop', token: 'alpha', scope: 'active' }]);
  expect(auditCalls).toBe(1);
});

test('operations board handles mutation-registered controls, sequential responses, loading, retry, errors, and timers', async ({ page }) => {
  let taskCalls = 0;
  let retryCalls = 0;

  await page.route('**/scenario/board', route => route.fulfill({
    contentType: 'text/html',
    body: `
      <fragment target="#board(innerHTML)">
        <section id="boardPanel">
          <button id="queueTask" GET="/scenario/task" sequential="20" target="#taskQueue(append)">Queue Task</button>
          <button id="retryTask" GET="/scenario/retry" retry="2" loading="#retryLoading(innerHTML)" target="#retryOut(innerHTML)">Retry Task</button>
          <button id="failTask" GET="/scenario/fail" onerror="#errorOut(innerHTML)">Fail Task</button>
          <span id="temporaryBadge" timer="90" target="this(remove)">Temporary</span>
        </section>
      </fragment>
    `
  }));
  await page.route('**/scenario/task', async (route) => {
    taskCalls += 1;
    const id = taskCalls;
    await delay(id === 1 ? 120 : 15);
    await route.fulfill({
      contentType: 'text/html',
      body: `<fragment target="#taskQueue(append)"><span class="task-event">Task ${id}</span></fragment>`
    });
  });
  await page.route('**/scenario/retry', async (route) => {
    retryCalls += 1;
    if (retryCalls === 1) {
      await delay(150);
    }
    return route.fulfill({
      status: retryCalls < 3 ? 503 : 200,
      contentType: 'text/html',
      body: retryCalls < 3 ? 'retry later' : 'Recovered after retry'
    });
  });
  await page.route('**/scenario/fail', route => route.fulfill({
    status: 500,
    contentType: 'text/html',
    body: 'failure'
  }));

  await mountHTMLeX(page, `
    <button id="loadBoard" GET="/scenario/board">Load Board</button>
    <div id="board"></div>
    <div id="taskQueue"></div>
    <div id="retryLoading"></div>
    <div id="retryOut"></div>
    <div id="errorOut"></div>
  `);

  await page.locator('#loadBoard').click();
  await expect(page.locator('#boardPanel')).toBeVisible();
  await expect(page.locator('#queueTask')).toHaveAttribute('data-htmlex-registered', 'true');
  await expect(page.locator('#retryTask')).toHaveAttribute('data-htmlex-registered', 'true');

  await page.locator('#queueTask').click();
  await page.locator('#queueTask').click();
  await expect(page.locator('#taskQueue .task-event')).toHaveText(['Task 1', 'Task 2']);
  expect(taskCalls).toBe(2);

  await page.locator('#retryTask').click();
  await expect(page.locator('#retryLoading .loading')).toHaveText('Loading...');
  await expect(page.locator('#retryOut')).toHaveText('Recovered after retry');
  expect(retryCalls).toBe(3);

  await page.locator('#failTask').click();
  await expect(page.locator('#errorOut')).toContainText('HTTP 500');
  await expect(page.locator('#temporaryBadge')).toHaveCount(0);
});

test('live dashboard combines auto, prefetch, cache, poll, custom triggers, debounce, throttle, lazy loading, and sockets', async ({ page }) => {
  const counts = {
    stats: 0,
    prefetch: 0,
    poll: 0,
    suggest: 0,
    refresh: 0,
    lazy: 0
  };

  for (const key of ['stats', 'prefetch', 'poll', 'suggest', 'refresh', 'lazy']) {
    await page.route(`**/scenario/${key}**`, async (route) => {
      counts[key] += 1;
      const url = new URL(route.request().url());
      const query = url.searchParams.get('q');
      await route.fulfill({
        contentType: 'text/html',
        body: query ? `${key}:${counts[key]}:${query}` : `${key}:${counts[key]}`
      });
    });
  }
  await page.evaluate(() => {
    window.__lazyObservers = [];
    window.IntersectionObserver = class TestIntersectionObserver {
      constructor(callback) {
        this.callback = callback;
        window.__lazyObservers.push(this);
      }

      observe(element) {
        this.element = element;
      }

      disconnect() {
        this.disconnected = true;
      }

      trigger() {
        this.callback([{ isIntersecting: true, target: this.element }], this);
      }
    };
  });

  await mountHTMLeX(page, `
    <section id="dashboardPage">
      <div id="statsWidget" GET="/scenario/stats" auto="true" cache="10000" target="#statsOut(innerHTML)">Stats</div>
      <div id="statsOut"></div>

      <div id="prefetchWidget" GET="/scenario/prefetch" auto="prefetch" target="#prefetchOut(innerHTML)">Prefetch</div>
      <div id="prefetchOut"></div>

      <div id="typeaheadAction" GET="/scenario/suggest" trigger="input" debounce="200" target="#suggestions(innerHTML)">
        <input id="typeahead" name="q" value="">
      </div>
      <div id="suggestions"></div>

      <button id="refreshWidget" GET="/scenario/refresh" throttle="200" target="#refreshOut(innerHTML)">Refresh</button>
      <div id="refreshOut"></div>

      <div id="pollWidget" GET="/scenario/poll" poll="100" repeat="2" target="#pollOut(innerHTML)">Poll</div>
      <div id="pollOut"></div>

      <div id="socketFeed" socket="/updates" target="#socketFeed(innerHTML)">Waiting</div>

      <div style="height: 1800px"></div>
      <div id="lazyWidget" GET="/scenario/lazy" auto="lazy" target="#lazyOut(innerHTML)">Lazy</div>
      <div id="lazyOut"></div>
    </section>
  `);

  await expect(page.locator('#statsOut')).toHaveText('stats:1');
  await expect(page.locator('#prefetchOut')).toHaveText('prefetch:1');
  await page.locator('#statsWidget').click();
  await expect(page.locator('#statsOut')).toHaveText('stats:1');
  expect(counts.stats).toBe(1);

  await page.locator('#typeahead').evaluate((input) => {
    input.value = 'router';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.value = 'router pro';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#suggestions')).toHaveText('suggest:1:router pro');
  expect(counts.suggest).toBe(1);

  await page.locator('#refreshWidget').click();
  await page.locator('#refreshWidget').click();
  await expect(page.locator('#refreshOut')).toHaveText('refresh:1');
  expect(counts.refresh).toBe(1);
  await page.waitForTimeout(220);
  await page.locator('#refreshWidget').click();
  await expect(page.locator('#refreshOut')).toHaveText('refresh:2');

  await expect(page.locator('#pollOut')).toHaveText('poll:2');
  await page.waitForTimeout(250);
  expect(counts.poll).toBe(2);

  await expect(page.locator('#socketFeed')).toContainText(/Live update at/);

  expect(counts.lazy).toBe(0);
  await page.evaluate(() => window.__lazyObservers[0].trigger());
  await expect(page.locator('#lazyOut')).toHaveText('lazy:1');
});
