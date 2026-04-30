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

async function dispatchClick(page, selector) {
  await page.locator(selector).evaluate((element) => element.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    cancelable: true
  })));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('intercepts all HTTP method attributes', async ({ page }) => {
  const seen = [];

  await page.route('**/test/method/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    seen.push({
      method: request.method(),
      path: url.pathname,
      body: request.postData() || ''
    });
    await route.fulfill({
      contentType: 'text/html',
      body: `${request.method()} ok`
    });
  });

  await mountHTMLeX(page, `
    <button id="getBtn" GET="/test/method/get" target="#getResult(innerHTML)">GET</button>
    <div id="getResult"></div>

    <form id="postForm" POST="/test/method/post" target="#postResult(innerHTML)">
      <input name="value" value="post-value">
      <button type="submit">POST</button>
    </form>
    <div id="postResult"></div>

    <form id="putForm" PUT="/test/method/put" target="#putResult(innerHTML)">
      <input name="value" value="put-value">
      <button type="submit">PUT</button>
    </form>
    <div id="putResult"></div>

    <form id="deleteForm" DELETE="/test/method/delete" target="#deleteResult(innerHTML)">
      <input name="value" value="delete-value">
      <button type="submit">DELETE</button>
    </form>
    <div id="deleteResult"></div>

    <form id="patchForm" PATCH="/test/method/patch" target="#patchResult(innerHTML)">
      <input name="value" value="patch-value">
      <button type="submit">PATCH</button>
    </form>
    <div id="patchResult"></div>
  `);

  await page.locator('#getBtn').click();
  await page.locator('#postForm button').click();
  await page.locator('#putForm button').click();
  await page.locator('#deleteForm button').click();
  await page.locator('#patchForm button').click();

  await expect(page.locator('#getResult')).toHaveText('GET ok');
  await expect(page.locator('#postResult')).toHaveText('POST ok');
  await expect(page.locator('#putResult')).toHaveText('PUT ok');
  await expect(page.locator('#deleteResult')).toHaveText('DELETE ok');
  await expect(page.locator('#patchResult')).toHaveText('PATCH ok');

  expect(seen.map(entry => entry.method)).toEqual(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
  expect(seen.find(entry => entry.method === 'POST').body).toContain('post-value');
  expect(seen.find(entry => entry.method === 'PUT').body).toContain('put-value');
  expect(seen.find(entry => entry.method === 'DELETE').body).toContain('delete-value');
  expect(seen.find(entry => entry.method === 'PATCH').body).toContain('patch-value');
});

test('collects nested form values, source selectors, and extras', async ({ page }) => {
  await page.route('**/test/query**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      contentType: 'text/html',
      body: [
        `inside=${url.searchParams.get('inside')}`,
        `sourced=${url.searchParams.get('sourced')}`,
        `extra=${url.searchParams.get('extra')}`
      ].join(';')
    });
  });

  await mountHTMLeX(page, `
    <input id="externalSource" name="sourced" value="from-source">
    <div id="queryAction" GET="/test/query" source="#externalSource" extras="extra=from-extra" target="#queryResult(innerHTML)">
      Run query
      <input type="hidden" name="inside" value="from-inside">
    </div>
    <div id="queryResult"></div>
  `);

  await dispatchClick(page, '#queryAction');

  await expect(page.locator('#queryResult')).toHaveText('inside=from-inside;sourced=from-source;extra=from-extra');
});

test('applies all target strategies and raw fallback updates exactly once', async ({ page }) => {
  await page.route('**/test/targets', route => route.fulfill({
    contentType: 'text/html',
    body: `
      <fragment target="#inner(innerHTML)"><span id="innerValue">Inner</span></fragment>
      <fragment target="#outer(outerHTML)"><section id="outer">Outer new</section></fragment>
      <fragment target="#append(append)"><span class="append-item">Append</span></fragment>
      <fragment target="#prepend(prepend)"><span class="prepend-item">Prepend</span></fragment>
      <fragment target="#before(before)"><span id="beforeInserted">Before</span></fragment>
      <fragment target="#after(after)"><span id="afterInserted">After</span></fragment>
      <fragment target="#remove(remove)">ignored</fragment>
    `
  }));
  await page.route('**/test/raw-append', route => route.fulfill({
    contentType: 'text/html',
    body: '<span class="raw-item">Raw</span>'
  }));
  await page.route('**/test/this-raw', route => route.fulfill({
    contentType: 'text/html',
    body: 'Self replaced'
  }));

  await mountHTMLeX(page, `
    <button id="targetBtn" GET="/test/targets">Targets</button>
    <div id="inner">Old inner</div>
    <div id="outer">Old outer</div>
    <div id="append"><span>Existing</span></div>
    <div id="prepend"><span>Existing</span></div>
    <span id="before">Before anchor</span>
    <span id="after">After anchor</span>
    <div id="remove">Remove me</div>

    <button id="rawAppendBtn" GET="/test/raw-append" target="#rawAppend(append)">Raw append</button>
    <div id="rawAppend"></div>

    <button id="thisRawBtn" GET="/test/this-raw" target="this(innerHTML)">Self</button>
  `);

  await page.locator('#targetBtn').click();
  await expect(page.locator('#innerValue')).toHaveText('Inner');
  await expect(page.locator('#outer')).toHaveText('Outer new');
  await expect(page.locator('#append .append-item')).toHaveCount(1);
  await expect(page.locator('#prepend .prepend-item')).toHaveCount(1);
  await expect(page.locator('#beforeInserted + #before')).toHaveCount(1);
  await expect(page.locator('#after + #afterInserted')).toHaveCount(1);
  await expect(page.locator('#remove')).toHaveCount(0);

  await page.locator('#rawAppendBtn').click();
  await expect(page.locator('#rawAppend .raw-item')).toHaveCount(1);

  await page.locator('#thisRawBtn').click();
  await expect(page.locator('#thisRawBtn')).toHaveText('Self replaced');
});

test('runs lifecycle hooks, loading state, error target, retries, and timeout handling', async ({ page }) => {
  let retryCount = 0;

  await page.route('**/test/lifecycle', route => route.fulfill({
    contentType: 'text/html',
    body: 'Lifecycle complete'
  }));
  await page.route('**/test/loading', async (route) => {
    await delay(100);
    await route.fulfill({ contentType: 'text/html', body: 'Loaded complete' });
  });
  await page.route('**/test/fails', route => route.fulfill({
    status: 500,
    contentType: 'text/html',
    body: 'failure'
  }));
  await page.route('**/test/retry', route => {
    retryCount += 1;
    return route.fulfill({
      status: retryCount < 3 ? 503 : 200,
      contentType: 'text/html',
      body: retryCount < 3 ? 'try again' : 'Retry success'
    });
  });
  await page.route('**/test/slow', async (route) => {
    await delay(200);
    await route.fulfill({ contentType: 'text/html', body: 'Too late' });
  });

  await mountHTMLeX(page, `
    <button id="lifecycleBtn"
      GET="/test/lifecycle"
      target="#lifecycleOut(innerHTML)"
      onbefore="test:before"
      onbeforeSwap="test:before-swap"
      onafterSwap="test:after-swap"
      onafter="test:after">Lifecycle</button>
    <div id="lifecycleOut"></div>

    <button id="loadingBtn" GET="/test/loading" target="#loadingOut(innerHTML)" loading="#loadingState(innerHTML)">Loading</button>
    <div id="loadingState"></div>
    <div id="loadingOut"></div>

    <button id="errorBtn" GET="/test/fails" onerror="#errorOut(innerHTML)">Error</button>
    <div id="errorOut"></div>

    <button id="retryBtn" GET="/test/retry" retry="2" target="#retryOut(innerHTML)">Retry</button>
    <div id="retryOut"></div>

    <button id="timeoutBtn" GET="/test/slow" timeout="50" onerror="#timeoutOut(innerHTML)">Timeout</button>
    <div id="timeoutOut"></div>
  `);

  await page.evaluate(() => {
    window.__hooks = [];
    window.HTMLeX.hooks.register('test:before', () => window.__hooks.push('before'));
    window.HTMLeX.hooks.register('test:before-swap', () => window.__hooks.push('beforeSwap'));
    window.HTMLeX.hooks.register('test:after-swap', () => window.__hooks.push('afterSwap'));
    window.HTMLeX.hooks.register('test:after', () => window.__hooks.push('after'));
  });

  await page.locator('#lifecycleBtn').click();
  await expect(page.locator('#lifecycleOut')).toHaveText('Lifecycle complete');
  await expect.poll(() => page.evaluate(() => window.__hooks)).toEqual(['before', 'beforeSwap', 'afterSwap', 'after']);

  await page.locator('#loadingBtn').click();
  await expect(page.locator('#loadingState .loading')).toHaveText('Loading...');
  await expect(page.locator('#loadingOut')).toHaveText('Loaded complete');

  await page.locator('#errorBtn').click();
  await expect(page.locator('#errorOut')).toContainText('HTTP 500');

  await page.locator('#retryBtn').click();
  await expect(page.locator('#retryOut')).toHaveText('Retry success');
  expect(retryCount).toBe(3);

  await page.locator('#timeoutBtn').click();
  await expect(page.locator('#timeoutOut')).toContainText('Request timed out');
});

test('refuses script-like lifecycle hooks and routes oversized responses to onerror', async ({ page }) => {
  await page.route('**/test/oversized', route => route.fulfill({
    contentType: 'text/html',
    body: '0123456789'
  }));
  await page.route('**/test/unsafe-hook', route => route.fulfill({
    contentType: 'text/html',
    body: 'Unsafe hook response'
  }));

  await mountHTMLeX(page, `
    <button id="unsafeHookBtn"
      GET="/test/unsafe-hook"
      target="#unsafeHookOut(innerHTML)"
      onbefore="window.__unsafeLifecycleRan = true">Unsafe Hook</button>
    <div id="unsafeHookOut"></div>

    <button id="oversizedBtn"
      GET="/test/oversized"
      target="#oversizedOut(innerHTML)"
      onerror="#oversizedError(innerHTML)"
      maxresponsechars="8">Oversized</button>
    <div id="oversizedOut"></div>
    <div id="oversizedError"></div>
  `);

  await page.locator('#unsafeHookBtn').click();
  await expect(page.locator('#unsafeHookOut')).toHaveText('Unsafe hook response');
  await expect.poll(() => page.evaluate(() => window.__unsafeLifecycleRan)).toBe(undefined);

  await page.locator('#oversizedBtn').click();
  await expect(page.locator('#oversizedOut')).toHaveText('');
  await expect(page.locator('#oversizedError')).toContainText('8 character safety limit');
});

test('escapes onerror messages in the browser before swapping them into the DOM', async ({ page }) => {
  await mountHTMLeX(page, `
    <button id="unsafeErrorMessageBtn"
      GET="/test/unsafe-error-message"
      onerror="#unsafeErrorMessageOut(innerHTML)">Unsafe Error</button>
    <div id="unsafeErrorMessageOut"></div>
  `);

  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      if (String(input).includes('/test/unsafe-error-message')) {
        throw new Error('bad <img src=x onerror=alert(1)> & "quoted"');
      }
      return originalFetch(input, options);
    };
  });

  await page.locator('#unsafeErrorMessageBtn').click();

  await expect(page.locator('#unsafeErrorMessageOut')).toContainText('bad <img src=x onerror=alert(1)> & "quoted"');
  await expect(page.locator('#unsafeErrorMessageOut img')).toHaveCount(0);
  await expect(page.locator('#unsafeErrorMessageOut')).toContainText('Error:');
});

test('supports auto, lazy auto, cache, debounce, throttle, and polling controls', async ({ page }) => {
  const counts = {
    auto: 0,
    prefetch: 0,
    lazy: 0,
    cache: 0,
    debounce: 0,
    throttle: 0,
    poll: 0
  };

  for (const key of Object.keys(counts)) {
    await page.route(`**/test/${key}`, route => {
      counts[key] += 1;
      return route.fulfill({
        contentType: 'text/html',
        body: `${key}:${counts[key]}`
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
    <div id="autoAction" GET="/test/auto" auto="true" target="#autoOut(innerHTML)">Auto</div>
    <div id="autoOut"></div>

    <div id="prefetchAction" GET="/test/prefetch" auto="prefetch" target="#prefetchOut(innerHTML)">Prefetch</div>
    <div id="prefetchOut"></div>

    <button id="cacheBtn" GET="/test/cache" cache="10000" target="#cacheOut(innerHTML)">Cache</button>
    <div id="cacheOut"></div>

    <button id="debounceBtn" GET="/test/debounce" debounce="200" target="#debounceOut(innerHTML)">Debounce</button>
    <div id="debounceOut"></div>

    <button id="throttleBtn" GET="/test/throttle" throttle="200" target="#throttleOut(innerHTML)">Throttle</button>
    <div id="throttleOut"></div>

    <div id="pollAction" GET="/test/poll" poll="100" repeat="2" target="#pollOut(innerHTML)">Poll</div>
    <div id="pollOut"></div>

    <div style="height: 1800px"></div>
    <div id="lazyAction" GET="/test/lazy" auto="lazy" target="#lazyOut(innerHTML)">Lazy</div>
    <div id="lazyOut"></div>
  `);

  await expect(page.locator('#autoOut')).toHaveText('auto:1');
  await expect(page.locator('#prefetchOut')).toHaveText('prefetch:1');

  await page.locator('#cacheBtn').click();
  await expect(page.locator('#cacheOut')).toHaveText('cache:1');
  await page.locator('#cacheBtn').click();
  await expect(page.locator('#cacheOut')).toHaveText('cache:1');
  expect(counts.cache).toBe(1);

  await page.locator('#debounceBtn').click();
  await page.locator('#debounceBtn').click();
  await expect(page.locator('#debounceOut')).toHaveText('debounce:1');
  expect(counts.debounce).toBe(1);
  await page.waitForTimeout(220);
  await page.locator('#debounceBtn').click();
  await expect(page.locator('#debounceOut')).toHaveText('debounce:2');

  await page.locator('#throttleBtn').click();
  await page.locator('#throttleBtn').click();
  await expect(page.locator('#throttleOut')).toHaveText('throttle:1');
  expect(counts.throttle).toBe(1);
  await page.waitForTimeout(220);
  await page.locator('#throttleBtn').click();
  await expect(page.locator('#throttleOut')).toHaveText('throttle:2');

  await expect(page.locator('#pollOut')).toHaveText('poll:2');
  await page.waitForTimeout(250);
  expect(counts.poll).toBe(2);

  expect(counts.lazy).toBe(0);
  await page.evaluate(() => window.__lazyObservers[0].trigger());
  await expect(page.locator('#lazyOut')).toHaveText('lazy:1');
});

test('handles publish, subscribe, timer, URL state, and mutation-observer registration', async ({ page }) => {
  let signalCalls = 0;
  let mutationCalls = 0;

  await page.goto('/?keep=1&remove=1');
  await page.route('**/test/signal', route => {
    signalCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `signal:${signalCalls}` });
  });
  await page.route('**/test/url', route => route.fulfill({
    contentType: 'text/html',
    body: 'url updated'
  }));
  await page.route('**/test/mutation', route => {
    mutationCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `mutation:${mutationCalls}` });
  });

  await mountHTMLeX(page, `
    <button id="publishBtn" publish="go">Publish</button>
    <div id="subscriber" subscribe="go" GET="/test/signal" target="#signalOut(innerHTML)"></div>
    <div id="signalOut"></div>

    <div id="timerRemove" timer="50" target="this(remove)">Remove by timer</div>

    <button id="urlBtn" GET="/test/url" target="#urlOut(innerHTML)" push="added=1" pull="remove" path="/client-state" history="push">URL</button>
    <div id="urlOut"></div>

    <div id="mutationHost"></div>
    <div id="mutationOut"></div>
  `);

  await page.locator('#publishBtn').click();
  await expect(page.locator('#signalOut')).toHaveText('signal:1');
  expect(signalCalls).toBe(1);

  await expect(page.locator('#timerRemove')).toHaveCount(0);

  await page.locator('#urlBtn').click();
  await expect(page.locator('#urlOut')).toHaveText('url updated');
  await expect(page).toHaveURL(/\/client-state\?keep=1&added=1$/);

  await page.locator('#mutationHost').evaluate((host) => {
    host.innerHTML = '<button id="mutationBtn" GET="/test/mutation" target="#mutationOut(innerHTML)">Mutation</button>';
  });
  await expect(page.locator('#mutationBtn')).toHaveAttribute('data-htmlex-registered', 'true');
  await page.locator('#mutationBtn').click();
  await expect(page.locator('#mutationOut')).toHaveText('mutation:1');
  expect(mutationCalls).toBe(1);
});

test('handles custom triggers, delayed auto actions, API publish signals, timer publish signals, and history replace', async ({ page }) => {
  const counts = {
    trigger: 0,
    autoDelay: 0,
    publishAction: 0,
    publishSubscriber: 0,
    timerSubscriber: 0,
    replaceUrl: 0
  };

  await page.goto('/?base=1&drop=1');
  await page.route('**/test/change-trigger', route => {
    counts.trigger += 1;
    return route.fulfill({ contentType: 'text/html', body: `trigger:${counts.trigger}` });
  });
  await page.route('**/test/auto-delay', route => {
    counts.autoDelay += 1;
    return route.fulfill({ contentType: 'text/html', body: `auto-delay:${counts.autoDelay}` });
  });
  await page.route('**/test/publish-action', route => {
    counts.publishAction += 1;
    return route.fulfill({ contentType: 'text/html', body: `publish-action:${counts.publishAction}` });
  });
  await page.route('**/test/publish-subscriber', route => {
    counts.publishSubscriber += 1;
    return route.fulfill({ contentType: 'text/html', body: `publish-subscriber:${counts.publishSubscriber}` });
  });
  await page.route('**/test/timer-subscriber', route => {
    counts.timerSubscriber += 1;
    return route.fulfill({ contentType: 'text/html', body: `timer-subscriber:${counts.timerSubscriber}` });
  });
  await page.route('**/test/replace-url', route => {
    counts.replaceUrl += 1;
    return route.fulfill({ contentType: 'text/html', body: `replace-url:${counts.replaceUrl}` });
  });

  await mountHTMLeX(page, `
    <input id="changeTrigger" GET="/test/change-trigger" trigger="change" target="#triggerOut(innerHTML)" value="initial">
    <div id="triggerOut"></div>

    <div id="autoDelayAction" GET="/test/auto-delay" auto="150" target="#autoDelayOut(innerHTML)">Auto delay</div>
    <div id="autoDelayOut"></div>

    <button id="publishAction" GET="/test/publish-action" target="#publishActionOut(innerHTML)" publish="api-complete">Publish API</button>
    <div id="publishActionOut"></div>
    <div id="publishSubscriber" subscribe="api-complete" GET="/test/publish-subscriber" target="#publishSignalOut(innerHTML)"></div>
    <div id="publishSignalOut"></div>

    <div id="timerPublisher" publish="timer-complete" timer="75"></div>
    <div id="timerSubscriber" subscribe="timer-complete" GET="/test/timer-subscriber" target="#timerSignalOut(innerHTML)"></div>
    <div id="timerSignalOut"></div>

    <button id="replaceUrlBtn" GET="/test/replace-url" target="#replaceUrlOut(innerHTML)" push="kept=2" pull="drop" path="/replace-state" history="replace">Replace URL</button>
    <div id="replaceUrlOut"></div>
  `);

  expect(counts.autoDelay).toBe(0);

  await page.locator('#changeTrigger').fill('changed');
  await page.locator('#changeTrigger').dispatchEvent('input');
  expect(counts.trigger).toBe(0);
  await page.locator('#changeTrigger').dispatchEvent('change');
  await expect(page.locator('#triggerOut')).toHaveText('trigger:1');
  expect(counts.trigger).toBe(1);

  await expect(page.locator('#autoDelayOut')).toHaveText('auto-delay:1');
  expect(counts.autoDelay).toBe(1);

  await page.locator('#publishAction').click();
  await expect(page.locator('#publishActionOut')).toHaveText('publish-action:1');
  await expect(page.locator('#publishSignalOut')).toHaveText('publish-subscriber:1');
  expect(counts.publishAction).toBe(1);
  expect(counts.publishSubscriber).toBe(1);

  await expect(page.locator('#timerSignalOut')).toHaveText('timer-subscriber:1');
  expect(counts.timerSubscriber).toBe(1);

  const historyLengthBeforeReplace = await page.evaluate(() => history.length);
  await page.locator('#replaceUrlBtn').click();
  await expect(page.locator('#replaceUrlOut')).toHaveText('replace-url:1');
  await expect(page).toHaveURL(/\/replace-state\?base=1&kept=2$/);
  await expect.poll(() => page.evaluate(() => history.length)).toBe(historyLengthBeforeReplace);
  expect(counts.replaceUrl).toBe(1);
});

test('queues sequential fragment responses in trigger order', async ({ page }) => {
  let sequentialCalls = 0;

  await page.route('**/test/sequential', async (route) => {
    sequentialCalls += 1;
    const id = sequentialCalls;
    await delay(id === 1 ? 120 : 20);
    await route.fulfill({
      contentType: 'text/html',
      body: `<fragment target="#sequentialOut(append)"><span class="seq-item">seq:${id}</span></fragment>`
    });
  });

  await mountHTMLeX(page, `
    <button id="sequentialBtn" GET="/test/sequential" sequential="25" target="#sequentialOut(append)">Sequential</button>
    <div id="sequentialOut"></div>
  `);

  await page.locator('#sequentialBtn').click();
  await page.locator('#sequentialBtn').click();

  await expect(page.locator('#sequentialOut .seq-item')).toHaveText(['seq:1', 'seq:2']);
  expect(sequentialCalls).toBe(2);
});

test('updates targets from same-origin socket messages in mounted page context', async ({ page }) => {
  await mountHTMLeX(page, `
    <div id="socketFeed" socket="/updates" target="#socketFeed(innerHTML)">Waiting</div>
  `);

  await expect(page.locator('#socketFeed')).toContainText(/Live update at/);
});

test('processes fragment defaults, caller target overrides, and timer elements inserted by fragments', async ({ page }) => {
  await page.route('**/test/fragment-default', route => route.fulfill({
    contentType: 'text/html',
    body: '<fragment><span>Default fragment target</span></fragment>'
  }));
  await page.route('**/test/fragment-override', route => route.fulfill({
    contentType: 'text/html',
    body: '<fragment target="this(innerHTML)"><span>Overridden target</span></fragment>'
  }));
  await page.route('**/test/fragment-timer', route => route.fulfill({
    contentType: 'text/html',
    body: '<fragment target="#timerHost(innerHTML)"><span id="fragmentTimer" timer="300" target="this(remove)">Temporary</span></fragment>'
  }));

  await mountHTMLeX(page, `
    <button id="defaultFragmentBtn" GET="/test/fragment-default">Default</button>
    <button id="overrideFragmentBtn" GET="/test/fragment-override" target="#overrideOut(innerHTML)">Override</button>
    <div id="overrideOut"></div>
    <button id="fragmentTimerBtn" GET="/test/fragment-timer">Timer</button>
    <div id="timerHost"></div>
  `);

  await page.locator('#defaultFragmentBtn').click();
  await expect(page.locator('#defaultFragmentBtn')).toHaveText('Default fragment target');

  await page.locator('#overrideFragmentBtn').click();
  await expect(page.locator('#overrideOut')).toHaveText('Overridden target');

  await page.locator('#fragmentTimerBtn').click();
  await expect(page.locator('#fragmentTimer')).toHaveText('Temporary');
  await expect(page.locator('#fragmentTimer')).toHaveCount(0);
});
