import { expect, test } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';

async function mountHTMLeX(page, html) {
  await page.evaluate(async (fixtureHtml) => {
    document.body.innerHTML = `<main id="fixture">${fixtureHtml}</main>`;
    const { initHTMLeX } = await import('/src/htmlex.js');
    initHTMLeX();
  }, html);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('browser diagnostics record warnings, errors, and runtime boundary events', async ({ page }) => {
  const diagnostics = await page.evaluate(async () => {
    await import('/src/htmlex.js');
    const { Logger, LogLevel } = await import('/src/logger.js');
    Logger.logLevel = LogLevel.WARN;
    Logger.diagnostics.clear();

    const events = [];
    window.addEventListener(Logger.diagnostics.eventName, event => events.push(event.detail));

    Logger.system.warn('Inspectable warning', { feature: 'diagnostics' });
    Logger.system.error('Inspectable error', new Error('diagnostic failure'));
    window.dispatchEvent(new ErrorEvent('error', {
      message: 'Runtime boundary failure',
      filename: 'diagnostics-fixture.js',
      lineno: 7,
      colno: 13,
      error: new Error('Runtime boundary failure')
    }));
    const circularPayload = {
      name: 'root',
      count: 2n,
    };
    circularPayload.self = circularPayload;
    Logger.system.warn('Complex diagnostic payload', circularPayload, document.body);

    return {
      entries: Logger.diagnostics.entries,
      events,
      globalEntries: window[Logger.diagnostics.globalName].entries,
      snapshot: Logger.diagnostics.snapshot(),
      lastWarning: Logger.diagnostics.last('warn'),
    };
  });

  expect(diagnostics.entries).toHaveLength(4);
  expect(diagnostics.events).toHaveLength(4);
  expect(diagnostics.globalEntries).toHaveLength(4);
  expect(diagnostics.snapshot).toHaveLength(4);
  expect(diagnostics.entries.map(entry => entry.level)).toEqual(['warn', 'error', 'error', 'warn']);
  expect(diagnostics.entries[0]).toMatchObject({
    scope: '[HTMLeX SYSTEM WARN]',
    message: 'Inspectable warning',
  });
  expect(diagnostics.entries[1].args[0]).toMatchObject({
    name: 'Error',
    message: 'diagnostic failure',
  });
  expect(diagnostics.entries[2].message).toBe('[Runtime] Unhandled browser error:');
  expect(diagnostics.entries[2].args[0]).toMatchObject({
    message: 'Runtime boundary failure',
    source: 'diagnostics-fixture.js',
    line: 7,
    column: 13,
  });
  expect(diagnostics.lastWarning).toMatchObject({
    message: 'Complex diagnostic payload',
    args: [
      {
        name: 'root',
        count: '2n',
        self: '[Circular]',
      },
      {
        element: 'body',
      },
    ],
  });
});

test('handles descendant target selectors and multiple target instructions', async ({ page }) => {
  await page.route('**/edge/targets', route => route.fulfill({
    contentType: 'text/html',
    body: '<span class="updated">Nested target updated</span>'
  }));

  await mountHTMLeX(page, `
    <section id="card">
      <div class="status">Waiting</div>
    </section>
    <div id="activityLog"></div>
    <button id="targetBtn" GET="/edge/targets" target="#card .status(innerHTML) #activityLog(append)">Update</button>
  `);

  await page.locator('#targetBtn').click();

  await expect(page.locator('#card .status .updated')).toHaveText('Nested target updated');
  await expect(page.locator('#activityLog .updated')).toHaveText('Nested target updated');
});

test('replaces context-sensitive table rows with outerHTML targets', async ({ page }) => {
  await page.route('**/edge/row', route => route.fulfill({
    contentType: 'text/html',
    body: '<tr id="inventoryRow"><td>Updated row</td><td>42</td></tr>'
  }));

  await mountHTMLeX(page, `
    <table>
      <tbody>
        <tr id="inventoryRow"><td>Old row</td><td>1</td></tr>
      </tbody>
    </table>
    <button id="rowBtn" GET="/edge/row" target="#inventoryRow(outerHTML)">Replace row</button>
  `);

  await page.locator('#rowBtn').click();

  await expect(page.locator('#inventoryRow td')).toHaveText(['Updated row', '42']);
});

test('collects source form roots, preserves extras values, and supports bare cache attributes', async ({ page }) => {
  let queryCalls = 0;
  const seen = [];

  await page.route('**/edge/query**', route => {
    queryCalls += 1;
    const url = new URL(route.request().url());
    seen.push({
      filter: url.searchParams.get('filter'),
      nested: url.searchParams.get('nested'),
      disabled: url.searchParams.get('disabled'),
      signature: url.searchParams.get('signature'),
      empty: url.searchParams.get('empty')
    });
    return route.fulfill({
      contentType: 'text/html',
      body: `query:${queryCalls}:${url.searchParams.get('filter')}:${url.searchParams.get('signature')}:${url.searchParams.get('empty')}`
    });
  });

  await mountHTMLeX(page, `
    <form id="filters">
      <input name="filter" value="open">
      <input name="disabled" value="skip-me" disabled>
      <div class="advanced">
        <input name="nested" value="priority">
      </div>
    </form>
    <button id="queryBtn"
      GET="/edge/query"
      source="#filters"
      extras="signature=a=b=c empty="
      cache
      target="#queryOut(innerHTML)">Run query</button>
    <div id="queryOut"></div>
  `);

  await page.locator('#queryBtn').click();
  await expect(page.locator('#queryOut')).toHaveText('query:1:open:a=b=c:');
  await page.locator('#queryBtn').click();
  await expect(page.locator('#queryOut')).toHaveText('query:1:open:a=b=c:');

  expect(queryCalls).toBe(1);
  expect(seen).toEqual([{
    filter: 'open',
    nested: 'priority',
    disabled: null,
    signature: 'a=b=c',
    empty: ''
  }]);
});

test('empty compound source selectors do not fall back to global token matches', async ({ page }) => {
  const seen = [];

  await page.route('**/edge/empty-compound-source**', route => {
    const url = new URL(route.request().url());
    seen.push({
      local: url.searchParams.get('local'),
      global: url.searchParams.get('global')
    });
    return route.fulfill({
      contentType: 'text/html',
      body: `compound:${url.searchParams.get('local')}:${url.searchParams.get('global')}`
    });
  });

  await mountHTMLeX(page, `
    <input class="globalSource" name="global" value="should-not-leak">
    <button
      id="compoundSourceBtn"
      GET="/edge/empty-compound-source"
      source="#missingSourceRoot .globalSource"
      extras="local=kept"
      target="#compoundSourceOut(innerHTML)">Run compound source</button>
    <div id="compoundSourceOut"></div>
  `);

  await page.locator('#compoundSourceBtn').click();

  await expect(page.locator('#compoundSourceOut')).toHaveText('compound:kept:null');
  expect(seen).toEqual([{ local: 'kept', global: null }]);
});

test('serializes non-form controls with multiple values correctly', async ({ page }) => {
  const seen = [];

  await page.route('**/edge/non-form-controls**', route => {
    const url = new URL(route.request().url());
    seen.push({
      tags: url.searchParams.getAll('tag'),
      enabled: url.searchParams.get('enabled'),
      disabled: url.searchParams.get('disabled'),
      unchecked: url.searchParams.get('unchecked'),
      mode: url.searchParams.get('mode')
    });
    return route.fulfill({ contentType: 'text/html', body: 'controls ok' });
  });

  await mountHTMLeX(page, `
    <div id="controlAction" GET="/edge/non-form-controls" target="#controlOut(innerHTML)">
      <select name="tag" multiple>
        <option value="alpha" selected>Alpha</option>
        <option value="beta" selected>Beta</option>
        <option value="gamma">Gamma</option>
      </select>
      <input type="checkbox" name="enabled" value="yes" checked>
      <input type="checkbox" name="unchecked" value="no">
      <input type="radio" name="mode" value="draft">
      <input type="radio" name="mode" value="live" checked>
      <input name="disabled" value="skip" disabled>
    </div>
    <div id="controlOut"></div>
  `);

  await page.locator('#controlAction').click();

  await expect(page.locator('#controlOut')).toHaveText('controls ok');
  expect(seen).toEqual([{
    tags: ['alpha', 'beta'],
    enabled: 'yes',
    disabled: null,
    unchecked: null,
    mode: 'live'
  }]);
});

test('preserves equals signs in URL push values and ignores invalid source selectors', async ({ page }) => {
  await page.goto('/?keep=1&remove=1');
  await page.route('**/edge/url', route => route.fulfill({
    contentType: 'text/html',
    body: 'URL changed'
  }));

  await mountHTMLeX(page, `
    <button id="urlEdgeBtn"
      GET="/edge/url"
      source="##invalid"
      target="#urlOut(innerHTML)"
      push="token=a=b blank="
      pull="remove"
      history="replace">URL edge</button>
    <div id="urlOut"></div>
  `);

  await page.locator('#urlEdgeBtn').click();

  await expect(page.locator('#urlOut')).toHaveText('URL changed');
  await expect(page).toHaveURL(/\/\?keep=1&token=a%3Db&blank=$/);
});

test('history none skips URL mutation while still applying the response', async ({ page }) => {
  await page.goto('/?keep=1');
  await page.route('**/edge/history-none', route => route.fulfill({
    contentType: 'text/html',
    body: 'history none ok'
  }));

  await mountHTMLeX(page, `
    <button
      id="historyNoneBtn"
      GET="/edge/history-none"
      target="#historyNoneOut(innerHTML)"
      push="added=1"
      path="/should-not-apply"
      history="none"
    >No history</button>
    <div id="historyNoneOut"></div>
  `);

  await page.locator('#historyNoneBtn').click();

  await expect(page.locator('#historyNoneOut')).toHaveText('history none ok');
  await expect(page).toHaveURL(/\/\?keep=1$/);
});

test('does not invoke removed subscribers after later publish events', async ({ page }) => {
  let staleCalls = 0;

  await page.route('**/edge/stale-subscriber', route => {
    staleCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `stale:${staleCalls}` });
  });

  await mountHTMLeX(page, `
    <button id="publisher" publish="stale-event">Publish</button>
    <div id="staleSubscriber" subscribe="stale-event" GET="/edge/stale-subscriber" target="#staleOut(innerHTML)"></div>
    <div id="staleOut"></div>
  `);

  await page.locator('#staleSubscriber').evaluate(element => element.remove());
  await page.locator('#publisher').click();
  await page.waitForTimeout(150);

  expect(staleCalls).toBe(0);
  await expect(page.locator('#staleOut')).toHaveText('');
});

test('removed subscribers unregister without waiting for the next signal', async ({ page }) => {
  await mountHTMLeX(page, `
    <div id="cleanupSubscriber" subscribe="cleanup-signal" GET="/edge/sub-cleanup" target="#cleanupOut(innerHTML)"></div>
    <div id="cleanupOut"></div>
  `);

  await expect.poll(() => page.evaluate(async () => {
    const { __getSignalListenerCount } = await import('/src/signals.js');
    return __getSignalListenerCount('cleanup-signal');
  })).toBe(1);

  await page.locator('#cleanupSubscriber').evaluate(element => element.remove());

  await expect.poll(() => page.evaluate(async () => {
    const { __getSignalListenerCount } = await import('/src/signals.js');
    return __getSignalListenerCount('cleanup-signal');
  })).toBe(0);
});

test('aborts timed-out fetches instead of leaving them running', async ({ page }) => {
  await mountHTMLeX(page, `
    <button id="timeoutAbortBtn" GET="/edge/never" timeout="50" onerror="#timeoutAbortOut(innerHTML)">Timeout</button>
    <div id="timeoutAbortOut"></div>
  `);
  await page.evaluate(() => {
    window.__timeoutAbortSeen = false;
    window.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        window.__timeoutAbortSeen = true;
        reject(options.signal.reason || new Error('aborted'));
      });
    });
  });

  await page.locator('#timeoutAbortBtn').click();

  await expect(page.locator('#timeoutAbortOut')).toContainText('Request timed out');
  await expect.poll(() => page.evaluate(() => window.__timeoutAbortSeen)).toBe(true);
});

test('failed response streams clear streaming state', async ({ page }) => {
  await mountHTMLeX(page, `
    <button id="brokenStreamBtn" GET="/edge/broken-stream" target="#brokenStreamOut(innerHTML)" onerror="#brokenStreamError(innerHTML)">Broken stream</button>
    <div id="brokenStreamOut"></div>
    <div id="brokenStreamError"></div>
  `);
  await page.evaluate(() => {
    window.fetch = () => {
      const encoder = new TextEncoder();
      return Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('<fragment target="#brokenStreamOut(innerHTML)">partial stream</fragment>'));
          setTimeout(() => controller.error(new Error('stream exploded')), 0);
        }
      })));
    };
  });

  await page.locator('#brokenStreamBtn').click();

  await expect(page.locator('#brokenStreamOut')).toHaveText('partial stream');
  await expect(page.locator('#brokenStreamError')).toContainText('stream exploded');
  await expect.poll(() => page.locator('#brokenStreamBtn').evaluate(element => ({
    active: element._htmlexStreamingActive,
    streaming: element._htmlexStreaming
  }))).toEqual({ active: false, streaming: false });
});

test('stops polling after the polling element is removed', async ({ page }) => {
  let pollCalls = 0;

  await page.route('**/edge/poll-cleanup', route => {
    pollCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `poll:${pollCalls}` });
  });

  await mountHTMLeX(page, `
    <div id="pollCleanup" GET="/edge/poll-cleanup" poll="100" target="#pollCleanupOut(innerHTML)">Poll</div>
    <div id="pollCleanupOut"></div>
  `);

  await expect(page.locator('#pollCleanupOut')).toHaveText(/poll:\d+/);
  const callsAfterFirstPoll = pollCalls;
  await page.locator('#pollCleanup').evaluate(element => element.remove());
  await page.waitForTimeout(220);

  expect(pollCalls).toBe(callsAfterFirstPoll);
});

test('replays cached fragment responses without another network request', async ({ page }) => {
  let fragmentCalls = 0;

  await page.route('**/edge/fragment-cache', route => {
    fragmentCalls += 1;
    return route.fulfill({
      contentType: 'text/html',
      body: `<fragment target="#fragmentCacheOut(innerHTML)"><span>fragment:${fragmentCalls}</span></fragment>`
    });
  });

  await mountHTMLeX(page, `
    <button id="fragmentCacheBtn" GET="/edge/fragment-cache" cache>Load cached fragment</button>
    <div id="fragmentCacheOut"></div>
  `);

  await page.locator('#fragmentCacheBtn').click();
  await expect(page.locator('#fragmentCacheOut')).toHaveText('fragment:1');
  await page.locator('#fragmentCacheOut').evaluate(element => { element.innerHTML = ''; });
  await page.locator('#fragmentCacheBtn').click();

  await expect(page.locator('#fragmentCacheOut')).toHaveText('fragment:1');
  expect(fragmentCalls).toBe(1);
});

test('does not render errors for requests canceled by a newer action', async ({ page }) => {
  let cancelCalls = 0;

  await page.route('**/edge/cancel', async (route) => {
    cancelCalls += 1;
    const id = cancelCalls;
    if (id === 1) {
      await delay(200);
    }
    await route.fulfill({ contentType: 'text/html', body: `done:${id}` });
  });

  await mountHTMLeX(page, `
    <button id="cancelBtn" GET="/edge/cancel" target="#cancelOut(innerHTML)" onerror="#cancelError(innerHTML)">Cancel</button>
    <div id="cancelOut"></div>
    <div id="cancelError"></div>
  `);

  const firstRequest = page.waitForRequest('**/edge/cancel');
  await page.locator('#cancelBtn').click();
  await firstRequest;
  await page.locator('#cancelBtn').click();

  await expect(page.locator('#cancelOut')).toHaveText('done:2');
  await expect(page.locator('#cancelError')).toHaveText('');
  expect(cancelCalls).toBe(2);
});

test('stale scheduled success swaps are skipped after a newer action starts', async ({ page }) => {
  let staleSuccessCalls = 0;

  await page.route('**/edge/stale-success', route => {
    staleSuccessCalls += 1;
    return route.fulfill({
      contentType: 'text/html',
      body: `<span class="stale-success-item">success:${staleSuccessCalls}</span>`
    });
  });

  await mountHTMLeX(page, `
    <button id="staleSuccessBtn" GET="/edge/stale-success" target="#staleSuccessOut(append)">Load</button>
    <div id="staleSuccessOut"></div>
  `);

  await page.evaluate(() => {
    window.__staleSuccessRafs = [];
    window.requestAnimationFrame = (callback) => {
      window.__staleSuccessRafs.push(callback);
      return window.__staleSuccessRafs.length;
    };
    window.__flushStaleSuccessRafs = () => {
      while (window.__staleSuccessRafs.length) {
        window.__staleSuccessRafs.shift()(performance.now());
      }
    };
  });

  await page.locator('#staleSuccessBtn').dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => window.__staleSuccessRafs.length)).toBe(1);

  await page.locator('#staleSuccessBtn').dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => window.__staleSuccessRafs.length)).toBe(2);
  await page.evaluate(() => window.__flushStaleSuccessRafs());

  await expect(page.locator('#staleSuccessOut .stale-success-item')).toHaveText(['success:2']);
  expect(staleSuccessCalls).toBe(2);
});

test('stale scheduled success swaps are skipped after action attributes are removed', async ({ page }) => {
  let staleRemovalCalls = 0;

  await page.route('**/edge/stale-removal-success', route => {
    staleRemovalCalls += 1;
    return route.fulfill({
      contentType: 'text/html',
      body: `<span class="stale-removal-item">remove:${staleRemovalCalls}</span>`
    });
  });

  await mountHTMLeX(page, `
    <button id="staleRemovalBtn" GET="/edge/stale-removal-success" target="#staleRemovalOut(append)">Load</button>
    <div id="staleRemovalOut"></div>
  `);

  await page.evaluate(() => {
    window.__staleRemovalRafs = [];
    window.requestAnimationFrame = (callback) => {
      window.__staleRemovalRafs.push(callback);
      return window.__staleRemovalRafs.length;
    };
    window.__flushStaleRemovalRafs = () => {
      while (window.__staleRemovalRafs.length) {
        window.__staleRemovalRafs.shift()(performance.now());
      }
    };
  });

  await page.locator('#staleRemovalBtn').dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => window.__staleRemovalRafs.length)).toBe(1);

  await page.locator('#staleRemovalBtn').evaluate(element => element.removeAttribute('GET'));
  await expect(page.locator('#staleRemovalBtn')).not.toHaveAttribute('data-htmlex-registered', 'true');
  await page.evaluate(() => window.__flushStaleRemovalRafs());

  await expect(page.locator('#staleRemovalOut .stale-removal-item')).toHaveCount(0);
  expect(staleRemovalCalls).toBe(1);
});

test('pending sequential requests are aborted when action attributes are removed', async ({ page }) => {
  await mountHTMLeX(page, `
    <button id="sequentialRemovalBtn" GET="/edge/sequential-removal" sequential="10" target="#sequentialRemovalOut(innerHTML)">Load</button>
    <div id="sequentialRemovalOut"></div>
  `);
  await page.evaluate(() => {
    window.__sequentialRemovalAbortSeen = false;
    window.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        window.__sequentialRemovalAbortSeen = true;
        reject(options.signal.reason || new DOMException('Aborted', 'AbortError'));
      });
    });
  });

  await page.locator('#sequentialRemovalBtn').click();
  await page.locator('#sequentialRemovalBtn').evaluate(element => element.removeAttribute('GET'));
  await expect(page.locator('#sequentialRemovalBtn')).not.toHaveAttribute('data-htmlex-registered', 'true');

  await expect.poll(() => page.evaluate(() => window.__sequentialRemovalAbortSeen)).toBe(true);
  await expect(page.locator('#sequentialRemovalOut')).toHaveText('');
});

test('clicking child content inside an HTMLeX button still triggers the button action', async ({ page }) => {
  let childClickCalls = 0;

  await page.route('**/edge/child-click', route => {
    childClickCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `child-click:${childClickCalls}` });
  });

  await mountHTMLeX(page, `
    <button id="childClickBtn" GET="/edge/child-click" target="#childClickOut(innerHTML)">
      <span id="childClickIcon">Icon</span>
    </button>
    <div id="childClickOut"></div>
  `);

  await page.locator('#childClickIcon').click();

  await expect(page.locator('#childClickOut')).toHaveText('child-click:1');
  expect(childClickCalls).toBe(1);
});

test('removed delayed auto and timer elements do not fire later work', async ({ page }) => {
  let autoCalls = 0;
  let timerCalls = 0;

  await page.route('**/edge/removed-auto', route => {
    autoCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `auto:${autoCalls}` });
  });
  await page.route('**/edge/removed-timer', route => {
    timerCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `timer:${timerCalls}` });
  });

  await mountHTMLeX(page, `
    <div id="removedAuto" GET="/edge/removed-auto" auto="120" target="#removedAutoOut(innerHTML)">Auto</div>
    <div id="removedTimer" GET="/edge/removed-timer" timer="120" target="#removedTimerOut(innerHTML)">Timer</div>
    <div id="removedAutoOut"></div>
    <div id="removedTimerOut"></div>
  `);

  await page.locator('#removedAuto').evaluate(element => element.remove());
  await page.locator('#removedTimer').evaluate(element => element.remove());
  await page.waitForTimeout(220);

  expect(autoCalls).toBe(0);
  expect(timerCalls).toBe(0);
  await expect(page.locator('#removedAutoOut')).toHaveText('');
  await expect(page.locator('#removedTimerOut')).toHaveText('');
});

test('removed debounced action elements do not fire pending work', async ({ page }) => {
  let debounceCalls = 0;

  await page.route('**/edge/removed-debounce', route => {
    debounceCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `debounce:${debounceCalls}` });
  });

  await mountHTMLeX(page, `
    <button id="removedDebounce" GET="/edge/removed-debounce" debounce="120" target="#removedDebounceOut(innerHTML)">Debounced</button>
    <div id="removedDebounceOut"></div>
  `);

  await page.locator('#removedDebounce').click();
  await page.locator('#removedDebounce').evaluate(element => element.remove());
  await page.waitForTimeout(180);

  expect(debounceCalls).toBe(0);
  await expect(page.locator('#removedDebounceOut')).toHaveText('');
});

test('publish-only auto elements emit once', async ({ page }) => {
  let autoPublishCalls = 0;

  await page.route('**/edge/auto-publish-once', route => {
    autoPublishCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `auto-publish:${autoPublishCalls}` });
  });

  await mountHTMLeX(page, `
    <div id="autoPublisher" publish="auto-once" auto="50"></div>
    <div id="autoSubscriber" subscribe="auto-once" GET="/edge/auto-publish-once" target="#autoPublishOut(innerHTML)"></div>
    <div id="autoPublishOut"></div>
  `);

  await expect(page.locator('#autoPublishOut')).toHaveText('auto-publish:1');
  await page.waitForTimeout(160);

  expect(autoPublishCalls).toBe(1);
});

test('debounced prefetch auto does not throw and still performs the request', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.route('**/edge/prefetch-debounce', route => {
    return route.fulfill({ contentType: 'text/html', body: 'prefetch ok' });
  });

  await mountHTMLeX(page, `
    <div id="prefetchDebounced" GET="/edge/prefetch-debounce" auto="prefetch" debounce="50" target="#prefetchDebounceOut(innerHTML)"></div>
    <div id="prefetchDebounceOut"></div>
  `);

  await expect(page.locator('#prefetchDebounceOut')).toHaveText('prefetch ok');
  expect(pageErrors).toEqual([]);
});

test('invalid timer delays are ignored instead of firing immediately', async ({ page }) => {
  let rootTimerCalls = 0;
  let fragmentTimerCalls = 0;

  await page.route('**/edge/invalid-root-timer', route => {
    rootTimerCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `root:${rootTimerCalls}` });
  });
  await page.route('**/edge/invalid-fragment-timer-source', route => {
    return route.fulfill({
      contentType: 'text/html',
      body: '<fragment target="#invalidFragmentHost(innerHTML)"><div id="invalidFragmentTimer" GET="/edge/invalid-fragment-timer" timer="soon" target="#invalidFragmentOut(innerHTML)">Fragment timer</div></fragment>'
    });
  });
  await page.route('**/edge/invalid-fragment-timer', route => {
    fragmentTimerCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `fragment:${fragmentTimerCalls}` });
  });

  await mountHTMLeX(page, `
    <div id="invalidRootTimer" GET="/edge/invalid-root-timer" timer="soon" target="#invalidRootOut(innerHTML)">Root timer</div>
    <button id="invalidFragmentLoader" GET="/edge/invalid-fragment-timer-source">Load fragment timer</button>
    <div id="invalidFragmentHost"></div>
    <div id="invalidRootOut"></div>
    <div id="invalidFragmentOut"></div>
  `);

  await page.locator('#invalidFragmentLoader').click();
  await expect(page.locator('#invalidFragmentTimer')).toHaveText('Fragment timer');
  await page.waitForTimeout(160);

  expect(rootTimerCalls).toBe(0);
  expect(fragmentTimerCalls).toBe(0);
  await expect(page.locator('#invalidRootOut')).toHaveText('');
  await expect(page.locator('#invalidFragmentOut')).toHaveText('');
});

test('debounced form submit prevents native navigation and performs the action', async ({ page }) => {
  const pageErrors = [];
  let submitCalls = 0;
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.route('**/edge/debounced-submit', route => {
    submitCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `submit:${submitCalls}` });
  });

  await mountHTMLeX(page, `
    <form id="debouncedSubmitForm" POST="/edge/debounced-submit" debounce="50" target="#debouncedSubmitOut(innerHTML)">
      <input name="query" value="alpha">
      <button id="debouncedSubmitBtn" type="submit">Submit</button>
    </form>
    <div id="debouncedSubmitOut"></div>
  `);

  await page.locator('#debouncedSubmitBtn').click();

  await expect(page.locator('#debouncedSubmitOut')).toHaveText('submit:1');
  await expect(page.locator('#fixture')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(submitCalls).toBe(1);
  expect(pageErrors).toEqual([]);
});

test('removed first subscriber does not skip later active subscribers', async ({ page }) => {
  let staleCalls = 0;
  let activeCalls = 0;

  await page.route('**/edge/signal-stale-first', route => {
    staleCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `stale-first:${staleCalls}` });
  });
  await page.route('**/edge/signal-active-second', route => {
    activeCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `active-second:${activeCalls}` });
  });

  await mountHTMLeX(page, `
    <button id="snapshotPublisher" publish="snapshot-event">Publish</button>
    <div id="staleFirstSubscriber" subscribe="snapshot-event" GET="/edge/signal-stale-first" target="#staleFirstOut(innerHTML)"></div>
    <div id="activeSecondSubscriber" subscribe="snapshot-event" GET="/edge/signal-active-second" target="#activeSecondOut(innerHTML)"></div>
    <div id="staleFirstOut"></div>
    <div id="activeSecondOut"></div>
  `);

  await page.locator('#staleFirstSubscriber').evaluate(element => element.remove());
  await page.locator('#snapshotPublisher').click();

  await expect(page.locator('#activeSecondOut')).toHaveText('active-second:1');
  await expect(page.locator('#staleFirstOut')).toHaveText('');
  expect(staleCalls).toBe(0);
  expect(activeCalls).toBe(1);
});

test('invalid delayed publish timers do not emit a second signal', async ({ page }) => {
  let actionCalls = 0;
  let subscriberCalls = 0;

  await page.route('**/edge/invalid-publish-timer-action', route => {
    actionCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `action:${actionCalls}` });
  });
  await page.route('**/edge/invalid-publish-timer-subscriber', route => {
    subscriberCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `subscriber:${subscriberCalls}` });
  });

  await mountHTMLeX(page, `
    <button id="invalidPublishTimerAction" GET="/edge/invalid-publish-timer-action" target="#invalidPublishTimerActionOut(innerHTML)" publish="invalid-publish-timer" timer="soon">Publish</button>
    <div id="invalidPublishTimerSubscriber" subscribe="invalid-publish-timer" GET="/edge/invalid-publish-timer-subscriber" target="#invalidPublishTimerSubscriberOut(innerHTML)"></div>
    <div id="invalidPublishTimerActionOut"></div>
    <div id="invalidPublishTimerSubscriberOut"></div>
  `);

  await page.locator('#invalidPublishTimerAction').click();
  await expect(page.locator('#invalidPublishTimerActionOut')).toHaveText('action:1');
  await expect(page.locator('#invalidPublishTimerSubscriberOut')).toHaveText('subscriber:1');
  await page.waitForTimeout(120);

  expect(actionCalls).toBe(1);
  expect(subscriberCalls).toBe(1);
});

test('websocket this targets update the socket element and disconnect on removal', async ({ page }) => {
  await page.evaluate(() => {
    window.__fakeSockets = [];
    window.io = () => {
      const anyHandlers = [];
      const eventHandlers = new Map();
      const socket = {
        disconnected: false,
        on(eventName, callback) {
          eventHandlers.set(eventName, callback);
          return socket;
        },
        onAny(callback) {
          anyHandlers.push(callback);
          return socket;
        },
        disconnect() {
          socket.disconnected = true;
          const disconnectHandler = eventHandlers.get('disconnect');
          if (disconnectHandler) disconnectHandler('client disconnect');
        },
        emitAny(eventName, data) {
          anyHandlers.forEach(callback => callback(eventName, data));
        }
      };
      window.__fakeSockets.push(socket);
      return socket;
    };
  });

  await mountHTMLeX(page, `
    <div id="socketSelf" socket="/fake-socket" target="this(innerHTML)">Waiting</div>
  `);

  await page.evaluate(() => {
    window.__fakeSockets[0].emitAny('update', '<span id="socketSelfPayload">Self socket update</span>');
  });

  await expect(page.locator('#socketSelfPayload')).toHaveText('Self socket update');
  await page.locator('#socketSelf').evaluate(element => element.remove());
  await expect.poll(() => page.evaluate(() => window.__fakeSockets[0].disconnected)).toBe(true);
});

test('lazy auto observers disconnect when their element is removed', async ({ page }) => {
  let lazyCalls = 0;

  await page.route('**/edge/lazy-cleanup', route => {
    lazyCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `lazy:${lazyCalls}` });
  });

  await page.evaluate(() => {
    window.__lazyDisconnects = 0;
    window.__lazyObservers = [];
    window.IntersectionObserver = class {
      constructor(callback) {
        this.callback = callback;
        this.element = null;
        this.disconnected = false;
        window.__lazyObservers.push(this);
      }
      observe(element) {
        this.element = element;
      }
      disconnect() {
        if (!this.disconnected) {
          this.disconnected = true;
          window.__lazyDisconnects += 1;
        }
      }
      trigger() {
        this.callback([{ isIntersecting: true, target: this.element }], this);
      }
    };
  });

  await mountHTMLeX(page, `
    <div id="lazyCleanup" GET="/edge/lazy-cleanup" auto="lazy" target="#lazyCleanupOut(innerHTML)">Lazy</div>
    <div id="lazyCleanupOut"></div>
  `);

  await expect.poll(() => page.evaluate(() => window.__lazyObservers.length)).toBe(1);
  await page.locator('#lazyCleanup').evaluate(element => element.remove());
  await expect.poll(() => page.evaluate(() => window.__lazyDisconnects)).toBe(1);
  await page.evaluate(() => window.__lazyObservers[0].trigger());
  await page.waitForTimeout(80);

  expect(lazyCalls).toBe(0);
  await expect(page.locator('#lazyCleanupOut')).toHaveText('');
});

test('lazy auto falls back to immediate action when IntersectionObserver is unavailable', async ({ page }) => {
  let lazyFallbackCalls = 0;

  await page.route('**/edge/lazy-fallback', route => {
    lazyFallbackCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `lazy-fallback:${lazyFallbackCalls}` });
  });

  await page.evaluate(() => {
    window.IntersectionObserver = undefined;
  });

  await mountHTMLeX(page, `
    <div id="lazyFallback" GET="/edge/lazy-fallback" auto="lazy" target="#lazyFallbackOut(innerHTML)">Lazy fallback</div>
    <div id="lazyFallbackOut"></div>
  `);

  await expect(page.locator('#lazyFallbackOut')).toHaveText('lazy-fallback:1');
  expect(lazyFallbackCalls).toBe(1);
});

test('diffed HTMLeX behavior nodes are re-registered when method attributes change', async ({ page }) => {
  let oldCalls = 0;
  let newCalls = 0;
  const newMethods = [];

  await page.route('**/edge/dynamic-old', route => {
    oldCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `old:${oldCalls}` });
  });
  await page.route('**/edge/dynamic-swap', route => {
    return route.fulfill({
      contentType: 'text/html',
      body: '<button id="dynamicAction" POST="/edge/dynamic-new" target="#dynamicOut(innerHTML)">New action</button>'
    });
  });
  await page.route('**/edge/dynamic-new', route => {
    newCalls += 1;
    newMethods.push(route.request().method());
    return route.fulfill({ contentType: 'text/html', body: `new:${newCalls}` });
  });

  await mountHTMLeX(page, `
    <div id="dynamicHost">
      <button id="dynamicAction" GET="/edge/dynamic-old" target="#dynamicOut(innerHTML)">Old action</button>
    </div>
    <button id="dynamicSwap" GET="/edge/dynamic-swap" target="#dynamicHost(innerHTML)">Swap action</button>
    <div id="dynamicOut"></div>
  `);

  await page.locator('#dynamicAction').click();
  await expect(page.locator('#dynamicOut')).toHaveText('old:1');

  await page.locator('#dynamicSwap').click();
  await expect(page.locator('#dynamicAction')).toHaveText('New action');
  await expect(page.locator('#dynamicAction')).toHaveAttribute('data-htmlex-registered', 'true');
  await page.locator('#dynamicAction').click();

  await expect(page.locator('#dynamicOut')).toHaveText('new:1');
  expect(oldCalls).toBe(1);
  expect(newCalls).toBe(1);
  expect(newMethods).toEqual(['POST']);
});

test('existing nodes register when HTMLeX method attributes are added later', async ({ page }) => {
  let lateCalls = 0;

  await page.route('**/edge/late-attribute-action', route => {
    lateCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `late:${lateCalls}` });
  });

  await mountHTMLeX(page, `
    <button id="lateAttributeAction" type="button">Late action</button>
    <div id="lateAttributeOut"></div>
  `);

  await page.locator('#lateAttributeAction').evaluate(element => {
    element.setAttribute('target', '#lateAttributeOut(innerHTML)');
    element.setAttribute('GET', '/edge/late-attribute-action');
  });

  await expect(page.locator('#lateAttributeAction')).toHaveAttribute('data-htmlex-registered', 'true');
  await page.locator('#lateAttributeAction').click();

  await expect(page.locator('#lateAttributeOut')).toHaveText('late:1');
  expect(lateCalls).toBe(1);
});

test('registered nodes re-register when method and trigger attributes change in place', async ({ page }) => {
  let oldCalls = 0;
  let newCalls = 0;
  const newMethods = [];

  await page.route('**/edge/reregister-old', route => {
    oldCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `old-register:${oldCalls}` });
  });
  await page.route('**/edge/reregister-new', route => {
    newCalls += 1;
    newMethods.push(route.request().method());
    return route.fulfill({ contentType: 'text/html', body: `new-register:${newCalls}` });
  });

  await mountHTMLeX(page, `
    <button id="reregisterAction" GET="/edge/reregister-old" target="#reregisterOut(innerHTML)">Dynamic registration</button>
    <div id="reregisterOut"></div>
  `);

  await page.locator('#reregisterAction').click();
  await expect(page.locator('#reregisterOut')).toHaveText('old-register:1');

  await page.locator('#reregisterAction').evaluate(element => {
    element.removeAttribute('GET');
    element.setAttribute('POST', '/edge/reregister-new');
    element.setAttribute('trigger', 'dblclick');
  });

  await page.locator('#reregisterAction').click();
  await page.waitForTimeout(120);
  await expect(page.locator('#reregisterOut')).toHaveText('old-register:1');

  await page.locator('#reregisterAction').dblclick();
  await expect(page.locator('#reregisterOut')).toHaveText('new-register:1');
  expect(oldCalls).toBe(1);
  expect(newCalls).toBe(1);
  expect(newMethods).toEqual(['POST']);
});

test('registered subscribers re-register when subscribe attributes change in place', async ({ page }) => {
  let oldSubscriberCalls = 0;
  let newSubscriberCalls = 0;

  await page.route('**/edge/resubscribe-old', route => {
    oldSubscriberCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `old-sub:${oldSubscriberCalls}` });
  });
  await page.route('**/edge/resubscribe-new', route => {
    newSubscriberCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `new-sub:${newSubscriberCalls}` });
  });

  await mountHTMLeX(page, `
    <button id="oldSignalPublisher" publish="old-dynamic-signal">Old signal</button>
    <button id="newSignalPublisher" publish="new-dynamic-signal">New signal</button>
    <div id="dynamicSubscriber" subscribe="old-dynamic-signal" GET="/edge/resubscribe-old" target="#dynamicSubscriberOut(innerHTML)"></div>
    <div id="dynamicSubscriberOut"></div>
  `);

  await page.locator('#dynamicSubscriber').evaluate(element => {
    element.setAttribute('subscribe', 'new-dynamic-signal');
    element.setAttribute('GET', '/edge/resubscribe-new');
  });

  await page.locator('#oldSignalPublisher').click();
  await page.waitForTimeout(120);
  await expect(page.locator('#dynamicSubscriberOut')).toHaveText('');

  await page.locator('#newSignalPublisher').click();
  await expect(page.locator('#dynamicSubscriberOut')).toHaveText('new-sub:1');
  expect(oldSubscriberCalls).toBe(0);
  expect(newSubscriberCalls).toBe(1);
});

test('removing the final HTMLeX attribute unregisters stale action listeners', async ({ page }) => {
  let actionCalls = 0;

  await page.route('**/edge/remove-final-action', route => {
    actionCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `final-action:${actionCalls}` });
  });

  await mountHTMLeX(page, `
    <button id="removeFinalAction" GET="/edge/remove-final-action" target="#removeFinalActionOut(innerHTML)">Run once</button>
    <div id="removeFinalActionOut"></div>
  `);

  await page.locator('#removeFinalAction').click();
  await expect(page.locator('#removeFinalActionOut')).toHaveText('final-action:1');

  await page.locator('#removeFinalAction').evaluate(element => element.removeAttribute('GET'));
  await expect(page.locator('#removeFinalAction')).not.toHaveAttribute('data-htmlex-registered', 'true');

  await page.locator('#removeFinalAction').click();
  await page.waitForTimeout(120);

  expect(actionCalls).toBe(1);
  await expect(page.locator('#removeFinalActionOut')).toHaveText('final-action:1');
});

test('modifier and trigger-only attributes do not create inert registrations', async ({ page }) => {
  let actionCalls = 0;

  await page.route('**/edge/remove-action-keep-modifiers', route => {
    actionCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `modifier-action:${actionCalls}` });
  });

  await mountHTMLeX(page, `
    <button
      id="modifierOnly"
      debounce="20"
      throttle="20"
      retry="2"
      timeout="50"
      cache
      sequential="FALSE"
      trigger="click"
    >Modifier only</button>
    <div id="triggerOnly" auto="50" poll="100" repeat="1" subscribe="unused-signal">Trigger only</div>
    <button
      id="removeActionKeepModifiers"
      GET="/edge/remove-action-keep-modifiers"
      debounce="20"
      throttle="20"
      retry="1"
      timeout="200"
      cache
      sequential="FALSE"
      auto="false"
      poll="1000"
      repeat="1"
      subscribe="unused-signal"
      target="#removeActionKeepModifiersOut(innerHTML)"
    >Run once</button>
    <div id="removeActionKeepModifiersOut"></div>
  `);

  await expect(page.locator('#modifierOnly')).not.toHaveAttribute('data-htmlex-registered', 'true');
  await expect(page.locator('#triggerOnly')).not.toHaveAttribute('data-htmlex-registered', 'true');

  await page.locator('#removeActionKeepModifiers').click();
  await expect(page.locator('#removeActionKeepModifiersOut')).toHaveText('modifier-action:1');

  await page.locator('#removeActionKeepModifiers').evaluate(element => element.removeAttribute('GET'));
  await expect(page.locator('#removeActionKeepModifiers')).not.toHaveAttribute('data-htmlex-registered', 'true');

  await page.locator('#removeActionKeepModifiers').click();
  await page.waitForTimeout(140);

  expect(actionCalls).toBe(1);
  await expect(page.locator('#removeActionKeepModifiersOut')).toHaveText('modifier-action:1');
});

test('invalid retry values still perform the initial request', async ({ page }) => {
  let negativeRetryCalls = 0;
  let invalidRetryCalls = 0;

  await page.route('**/edge/negative-retry', route => {
    negativeRetryCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `negative:${negativeRetryCalls}` });
  });
  await page.route('**/edge/invalid-retry', route => {
    invalidRetryCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `invalid:${invalidRetryCalls}` });
  });

  await mountHTMLeX(page, `
    <button id="negativeRetryBtn" GET="/edge/negative-retry" retry="-1" target="#negativeRetryOut(innerHTML)">Negative retry</button>
    <button id="invalidRetryBtn" GET="/edge/invalid-retry" retry="later" target="#invalidRetryOut(innerHTML)">Invalid retry</button>
    <div id="negativeRetryOut"></div>
    <div id="invalidRetryOut"></div>
  `);

  await page.locator('#negativeRetryBtn').click();
  await page.locator('#invalidRetryBtn').click();

  await expect(page.locator('#negativeRetryOut')).toHaveText('negative:1');
  await expect(page.locator('#invalidRetryOut')).toHaveText('invalid:1');
  expect(negativeRetryCalls).toBe(1);
  expect(invalidRetryCalls).toBe(1);
});

test('cached non-GET requests include request body in the cache key', async ({ page }) => {
  let postCacheCalls = 0;

  await page.route('**/edge/post-cache', route => {
    postCacheCalls += 1;
    const body = route.request().postData() || '';
    const item = body.includes('beta') ? 'beta' : 'alpha';
    return route.fulfill({ contentType: 'text/html', body: `post-cache:${postCacheCalls}:${item}` });
  });

  await mountHTMLeX(page, `
    <form id="postCacheForm" POST="/edge/post-cache" cache target="#postCacheOut(innerHTML)">
      <input id="postCacheInput" name="item" value="alpha">
      <button id="postCacheSubmit" type="submit">Save</button>
    </form>
    <div id="postCacheOut"></div>
  `);

  await page.locator('#postCacheSubmit').click();
  await expect(page.locator('#postCacheOut')).toHaveText('post-cache:1:alpha');

  await page.locator('#postCacheInput').fill('beta');
  await page.locator('#postCacheSubmit').click();
  await expect(page.locator('#postCacheOut')).toHaveText('post-cache:2:beta');

  await page.locator('#postCacheSubmit').click();
  await expect(page.locator('#postCacheOut')).toHaveText('post-cache:2:beta');
  expect(postCacheCalls).toBe(2);
});

test('cache hits still run publish side effects', async ({ page }) => {
  let cacheActionCalls = 0;
  let cacheSubscriberCalls = 0;

  await page.route('**/edge/cache-publish-action', route => {
    cacheActionCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `cache-action:${cacheActionCalls}` });
  });
  await page.route('**/edge/cache-publish-subscriber', route => {
    cacheSubscriberCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `cache-subscriber:${cacheSubscriberCalls}` });
  });

  await mountHTMLeX(page, `
    <button id="cachePublishAction" GET="/edge/cache-publish-action" cache publish="cache-published" target="#cachePublishActionOut(innerHTML)">Load</button>
    <div id="cachePublishSubscriber" subscribe="cache-published" GET="/edge/cache-publish-subscriber" target="#cachePublishSubscriberOut(innerHTML)"></div>
    <div id="cachePublishActionOut"></div>
    <div id="cachePublishSubscriberOut"></div>
  `);

  await page.locator('#cachePublishAction').click();
  await expect(page.locator('#cachePublishActionOut')).toHaveText('cache-action:1');
  await expect(page.locator('#cachePublishSubscriberOut')).toHaveText('cache-subscriber:1');

  await page.locator('#cachePublishAction').click();
  await expect(page.locator('#cachePublishActionOut')).toHaveText('cache-action:1');
  await expect(page.locator('#cachePublishSubscriberOut')).toHaveText('cache-subscriber:2');
  expect(cacheActionCalls).toBe(1);
  expect(cacheSubscriberCalls).toBe(2);
});

test('delayed Emit header signals do not fire after source removal', async ({ page }) => {
  let emitSubscriberCalls = 0;

  await page.route('**/edge/delayed-emit-source', route => {
    return route.fulfill({
      contentType: 'text/html',
      headers: { Emit: 'delayed-emit; delay=120' },
      body: 'emit source'
    });
  });
  await page.route('**/edge/delayed-emit-subscriber', route => {
    emitSubscriberCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `emit-subscriber:${emitSubscriberCalls}` });
  });

  await mountHTMLeX(page, `
    <button id="delayedEmitSource" GET="/edge/delayed-emit-source" target="#delayedEmitSourceOut(innerHTML)">Emit later</button>
    <div id="delayedEmitSubscriber" subscribe="delayed-emit" GET="/edge/delayed-emit-subscriber" target="#delayedEmitSubscriberOut(innerHTML)"></div>
    <div id="delayedEmitSourceOut"></div>
    <div id="delayedEmitSubscriberOut"></div>
  `);

  await page.locator('#delayedEmitSource').click();
  await page.locator('#delayedEmitSource').evaluate(element => element.remove());
  await expect(page.locator('#delayedEmitSourceOut')).toHaveText('emit source');
  await page.waitForTimeout(180);

  expect(emitSubscriberCalls).toBe(0);
  await expect(page.locator('#delayedEmitSubscriberOut')).toHaveText('');
});

test('delayed Emit header signals are canceled when action attributes are removed', async ({ page }) => {
  let emitSubscriberCalls = 0;

  await page.route('**/edge/delayed-emit-attribute-source', route => {
    return route.fulfill({
      contentType: 'text/html',
      headers: { Emit: 'delayed-attribute-emit; delay=500' },
      body: 'emit source'
    });
  });
  await page.route('**/edge/delayed-emit-attribute-subscriber', route => {
    emitSubscriberCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `emit-attribute-subscriber:${emitSubscriberCalls}` });
  });

  await mountHTMLeX(page, `
    <button id="delayedEmitAttributeSource" GET="/edge/delayed-emit-attribute-source" target="#delayedEmitAttributeSourceOut(innerHTML)">Emit later</button>
    <div id="delayedEmitAttributeSubscriber" subscribe="delayed-attribute-emit" GET="/edge/delayed-emit-attribute-subscriber" target="#delayedEmitAttributeSubscriberOut(innerHTML)"></div>
    <div id="delayedEmitAttributeSourceOut"></div>
    <div id="delayedEmitAttributeSubscriberOut"></div>
  `);

  await page.locator('#delayedEmitAttributeSource').click();
  await expect.poll(() => page.locator('#delayedEmitAttributeSource').evaluate(element => (
    element._htmlexDelayedSignalTimers?.size || 0
  ))).toBe(1);
  await page.locator('#delayedEmitAttributeSource').evaluate(element => element.removeAttribute('GET'));
  await expect(page.locator('#delayedEmitAttributeSource')).not.toHaveAttribute('data-htmlex-registered', 'true');
  await page.waitForTimeout(650);

  expect(emitSubscriberCalls).toBe(0);
  await expect(page.locator('#delayedEmitAttributeSubscriberOut')).toHaveText('');
});

test('target strategies are handled case-insensitively', async ({ page }) => {
  let uppercaseTargetCalls = 0;

  await page.route('**/edge/uppercase-target', route => {
    uppercaseTargetCalls += 1;
    return route.fulfill({
      contentType: 'text/html',
      body: `<span class="uppercase-target-item">upper:${uppercaseTargetCalls}</span>`
    });
  });

  await mountHTMLeX(page, `
    <button id="uppercaseTargetBtn" GET="/edge/uppercase-target" target="#uppercaseTargetOut(APPEND)">Append</button>
    <div id="uppercaseTargetOut"></div>
  `);

  await page.locator('#uppercaseTargetBtn').click();
  await page.locator('#uppercaseTargetBtn').click();

  await expect(page.locator('#uppercaseTargetOut .uppercase-target-item')).toHaveText(['upper:1', 'upper:2']);
  expect(uppercaseTargetCalls).toBe(2);
});

test('auto false disables automatic firing but keeps manual triggers working', async ({ page }) => {
  let autoFalseCalls = 0;

  await page.route('**/edge/auto-false', route => {
    autoFalseCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `auto-false:${autoFalseCalls}` });
  });

  await mountHTMLeX(page, `
    <button id="autoFalseBtn" GET="/edge/auto-false" auto="false" target="#autoFalseOut(innerHTML)">Manual</button>
    <div id="autoFalseOut"></div>
  `);

  await page.waitForTimeout(120);
  expect(autoFalseCalls).toBe(0);
  await expect(page.locator('#autoFalseOut')).toHaveText('');

  await page.locator('#autoFalseBtn').click();
  await expect(page.locator('#autoFalseOut')).toHaveText('auto-false:1');
  expect(autoFalseCalls).toBe(1);
});

test('auto modes are handled case-insensitively', async ({ page }) => {
  let falseCalls = 0;
  let lazyCalls = 0;
  let prefetchCalls = 0;

  await page.route('**/edge/auto-uppercase-false', route => {
    falseCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `false-case:${falseCalls}` });
  });
  await page.route('**/edge/auto-uppercase-lazy', route => {
    lazyCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `lazy-case:${lazyCalls}` });
  });
  await page.route('**/edge/auto-uppercase-prefetch', route => {
    prefetchCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `prefetch-case:${prefetchCalls}` });
  });

  await page.evaluate(() => {
    window.__autoCaseObservers = [];
    window.IntersectionObserver = class {
      constructor(callback) {
        this.callback = callback;
        this.element = null;
        window.__autoCaseObservers.push(this);
      }
      observe(element) {
        this.element = element;
      }
      disconnect() {}
      trigger() {
        this.callback([{ isIntersecting: true, target: this.element }], this);
      }
    };
  });

  await mountHTMLeX(page, `
    <button id="autoUpperFalseBtn" GET="/edge/auto-uppercase-false" auto="FALSE" target="#autoUpperFalseOut(innerHTML)">Manual</button>
    <div id="autoUpperLazy" GET="/edge/auto-uppercase-lazy" auto="Lazy" target="#autoUpperLazyOut(innerHTML)">Lazy</div>
    <div id="autoUpperPrefetch" GET="/edge/auto-uppercase-prefetch" auto="PREFETCH" target="#autoUpperPrefetchOut(innerHTML)">Prefetch</div>
    <div id="autoUpperFalseOut"></div>
    <div id="autoUpperLazyOut"></div>
    <div id="autoUpperPrefetchOut"></div>
  `);

  await expect(page.locator('#autoUpperPrefetchOut')).toHaveText('prefetch-case:1');
  await page.waitForTimeout(120);
  expect(falseCalls).toBe(0);
  expect(lazyCalls).toBe(0);
  expect(prefetchCalls).toBe(1);
  await expect(page.locator('#autoUpperFalseOut')).toHaveText('');
  await expect(page.locator('#autoUpperLazyOut')).toHaveText('');

  await expect.poll(() => page.evaluate(() => window.__autoCaseObservers.length)).toBe(1);
  await page.evaluate(() => window.__autoCaseObservers[0].trigger());
  await expect(page.locator('#autoUpperLazyOut')).toHaveText('lazy-case:1');

  await page.locator('#autoUpperFalseBtn').click();
  await expect(page.locator('#autoUpperFalseOut')).toHaveText('false-case:1');
  expect(falseCalls).toBe(1);
});

test('trigger names are normalized case-insensitively', async ({ page }) => {
  let triggerCalls = 0;

  await page.route('**/edge/trigger-case', route => {
    triggerCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `trigger-case:${triggerCalls}` });
  });

  await mountHTMLeX(page, `
    <button id="triggerCaseBtn" GET="/edge/trigger-case" trigger="onClick" target="#triggerCaseOut(innerHTML)">Trigger</button>
    <div id="triggerCaseOut"></div>
  `);

  await page.locator('#triggerCaseBtn').click();

  await expect(page.locator('#triggerCaseOut')).toHaveText('trigger-case:1');
  expect(triggerCalls).toBe(1);
});

test('sequential false values are handled case-insensitively', async ({ page }) => {
  let sequentialFalseCalls = 0;

  await page.route('**/edge/sequential-false-case', async (route) => {
    sequentialFalseCalls += 1;
    const id = sequentialFalseCalls;
    await delay(id === 1 ? 160 : 20);
    return route.fulfill({
      contentType: 'text/html',
      body: `<span class="sequential-false-case-item">seq-false:${id}</span>`
    });
  });

  await mountHTMLeX(page, `
    <button id="sequentialFalseCaseBtn" GET="/edge/sequential-false-case" sequential="FALSE" target="#sequentialFalseCaseOut(append)">Run</button>
    <div id="sequentialFalseCaseOut"></div>
  `);

  const firstRequest = page.waitForRequest('**/edge/sequential-false-case');
  await page.locator('#sequentialFalseCaseBtn').click();
  await firstRequest;
  await page.locator('#sequentialFalseCaseBtn').click();

  await expect(page.locator('#sequentialFalseCaseOut .sequential-false-case-item')).toHaveText(['seq-false:2']);
  await page.waitForTimeout(220);
  await expect(page.locator('#sequentialFalseCaseOut .sequential-false-case-item')).toHaveText(['seq-false:2']);
  expect(sequentialFalseCalls).toBe(2);
});

test('very small poll intervals are clamped to avoid request pressure', async ({ page }) => {
  let fastPollCalls = 0;

  await page.route('**/edge/fast-poll', route => {
    fastPollCalls += 1;
    return route.fulfill({ contentType: 'text/html', body: `fast-poll:${fastPollCalls}` });
  });

  await mountHTMLeX(page, `
    <div id="fastPoll" GET="/edge/fast-poll" poll="1" repeat="2" target="#fastPollOut(innerHTML)">Fast poll</div>
    <div id="fastPollOut"></div>
  `);

  await page.waitForTimeout(60);
  expect(fastPollCalls).toBe(0);

  await expect(page.locator('#fastPollOut')).toHaveText('fast-poll:2');
  expect(fastPollCalls).toBe(2);
});

test('onafterSwap runs after the target DOM has been updated', async ({ page }) => {
  await page.route('**/edge/after-swap-dom', route => route.fulfill({
    contentType: 'text/html',
    body: 'after swap payload'
  }));

  await mountHTMLeX(page, `
    <button
      id="afterSwapTimingBtn"
      GET="/edge/after-swap-dom"
      target="#afterSwapTimingOut(innerHTML)"
      onafterSwap="document.querySelector('#afterSwapTimingProbe').textContent = document.querySelector('#afterSwapTimingOut').textContent"
    >Swap</button>
    <div id="afterSwapTimingOut"></div>
    <div id="afterSwapTimingProbe"></div>
  `);

  await page.locator('#afterSwapTimingBtn').click();

  await expect(page.locator('#afterSwapTimingOut')).toHaveText('after swap payload');
  await expect(page.locator('#afterSwapTimingProbe')).toHaveText('after swap payload');
});

test('lifecycle hooks receive the triggering event snapshot', async ({ page }) => {
  await page.route('**/edge/hook-event', route => route.fulfill({
    contentType: 'text/html',
    body: 'hook event ok'
  }));

  await mountHTMLeX(page, `
    <button
      id="hookEventBtn"
      GET="/edge/hook-event"
      target="#hookEventOut(innerHTML)"
      onbefore="window.__hookEvents.push('before:' + event.type + ':' + event.currentTarget.id + ':' + event.target.id)"
      onbeforeSwap="window.__hookEvents.push('beforeSwap:' + event.type + ':' + event.currentTarget.id)"
      onafterSwap="window.__hookEvents.push('afterSwap:' + event.type + ':' + event.currentTarget.id)"
      onafter="window.__hookEvents.push('after:' + event.type + ':' + event.currentTarget.id)"
    ><span id="hookEventChild">Run</span></button>
    <div id="hookEventOut"></div>
  `);
  await page.evaluate(() => { window.__hookEvents = []; });

  await page.locator('#hookEventChild').click();

  await expect(page.locator('#hookEventOut')).toHaveText('hook event ok');
  await expect.poll(() => page.evaluate(() => window.__hookEvents)).toEqual([
    'before:click:hookEventBtn:hookEventChild',
    'beforeSwap:click:hookEventBtn',
    'afterSwap:click:hookEventBtn',
    'after:click:hookEventBtn'
  ]);
});

test('onafterSwap runs for fragment swaps after all fragments update', async ({ page }) => {
  await page.route('**/edge/fragment-after-swap-dom', route => route.fulfill({
    contentType: 'text/html',
    body: `
      <fragment target="#fragmentAfterSwapOut(append)"><span class="fragment-after-swap-item">First</span></fragment>
      <fragment target="#fragmentAfterSwapOut(append)"><span class="fragment-after-swap-item">Second</span></fragment>
    `
  }));

  await mountHTMLeX(page, `
    <button
      id="fragmentAfterSwapBtn"
      GET="/edge/fragment-after-swap-dom"
      onafterSwap="window.__fragmentAfterSwapHooks.push('afterSwap'); document.querySelector('#fragmentAfterSwapProbe').textContent = document.querySelector('#fragmentAfterSwapOut').textContent"
      onafter="window.__fragmentAfterSwapHooks.push('after')"
    >Swap fragments</button>
    <div id="fragmentAfterSwapOut"></div>
    <div id="fragmentAfterSwapProbe"></div>
  `);
  await page.evaluate(() => { window.__fragmentAfterSwapHooks = []; });

  await page.locator('#fragmentAfterSwapBtn').click();

  await expect(page.locator('#fragmentAfterSwapOut .fragment-after-swap-item')).toHaveText(['First', 'Second']);
  await expect(page.locator('#fragmentAfterSwapProbe')).toHaveText('FirstSecond');
  await expect.poll(() => page.evaluate(() => window.__fragmentAfterSwapHooks)).toEqual(['afterSwap', 'after']);
});

test('outerHTML replacement preserves multiple top-level response nodes', async ({ page }) => {
  await page.route('**/edge/multi-root-outer', route => route.fulfill({
    contentType: 'text/html',
    body: '<section id="outerRootA">First root</section><button id="outerRootB" GET="/edge/multi-root-followup" target="#outerFollowupOut(innerHTML)">Second root action</button>'
  }));

  await page.route('**/edge/multi-root-followup', route => route.fulfill({
    contentType: 'text/html',
    body: 'followup ok'
  }));

  await mountHTMLeX(page, `
    <div id="outerReplaceTarget">Replace me</div>
    <button id="outerMultiRootBtn" GET="/edge/multi-root-outer" target="#outerReplaceTarget(outerHTML)">Replace</button>
    <div id="outerFollowupOut"></div>
  `);

  await page.locator('#outerMultiRootBtn').click();

  await expect(page.locator('#outerReplaceTarget')).toHaveCount(0);
  await expect(page.locator('#outerRootA')).toHaveText('First root');
  await expect(page.locator('#outerRootB')).toBeVisible();
  await expect(page.locator('#outerRootB')).toHaveAttribute('data-htmlex-registered', 'true');

  await page.locator('#outerRootB').click();
  await expect(page.locator('#outerFollowupOut')).toHaveText('followup ok');
});

test('default fragments register inserted HTMLeX controls', async ({ page }) => {
  let followupCalls = 0;

  await page.route('**/edge/default-fragment-control', route => route.fulfill({
    contentType: 'text/html',
    body: '<fragment><button id="defaultFragmentAction" GET="/edge/default-fragment-followup" target="#defaultFragmentOut(innerHTML)">Follow up</button></fragment>'
  }));
  await page.route('**/edge/default-fragment-followup', route => {
    followupCalls += 1;
    return route.fulfill({
      contentType: 'text/html',
      body: `default-fragment-followup:${followupCalls}`
    });
  });

  await mountHTMLeX(page, `
    <div id="defaultFragmentLoader" GET="/edge/default-fragment-control">Load default fragment</div>
    <div id="defaultFragmentOut"></div>
  `);

  await page.locator('#defaultFragmentLoader').click();
  await expect(page.locator('#defaultFragmentAction')).toHaveAttribute('data-htmlex-registered', 'true');

  await page.locator('#defaultFragmentAction').click();
  await expect(page.locator('#defaultFragmentOut')).toHaveText('default-fragment-followup:1');
  expect(followupCalls).toBe(1);
});

test('loading and error this targets resolve to the triggering element', async ({ page }) => {
  await page.route('**/edge/loading-this', async (route) => {
    await delay(120);
    await route.fulfill({ contentType: 'text/html', body: 'loading complete' });
  });
  await page.route('**/edge/error-this', route => route.fulfill({
    status: 500,
    contentType: 'text/html',
    body: 'failure'
  }));

  await mountHTMLeX(page, `
    <button id="loadingThisBtn" GET="/edge/loading-this" loading="this(innerHTML)" target="#loadingThisOut(innerHTML)">Load self</button>
    <div id="loadingThisOut"></div>
    <button id="errorThisBtn" GET="/edge/error-this" onerror="this(innerHTML)">Error self</button>
  `);

  await page.locator('#loadingThisBtn').click();
  await expect(page.locator('#loadingThisBtn .loading')).toHaveText('Loading...');
  await expect(page.locator('#loadingThisOut')).toHaveText('loading complete');

  await page.locator('#errorThisBtn').click();
  await expect(page.locator('#errorThisBtn .error')).toContainText('HTTP 500');
});

test('fragment inserted publish timers emit once', async ({ page }) => {
  let timerSubscriberCalls = 0;

  await page.route('**/edge/fragment-publish-timer', route => route.fulfill({
    contentType: 'text/html',
    body: '<fragment target="#fragmentPublishHost(innerHTML)"><span id="fragmentPublishTimer" timer="80" publish="fragment-timer-signal">Timer</span></fragment>'
  }));
  await page.route('**/edge/fragment-timer-subscriber', route => {
    timerSubscriberCalls += 1;
    return route.fulfill({
      contentType: 'text/html',
      body: `timer subscriber:${timerSubscriberCalls}`
    });
  });

  await mountHTMLeX(page, `
    <button id="fragmentPublishTimerBtn" GET="/edge/fragment-publish-timer">Insert timer</button>
    <div id="fragmentPublishHost"></div>
    <div id="fragmentTimerSubscriber" subscribe="fragment-timer-signal" GET="/edge/fragment-timer-subscriber" target="#fragmentTimerOut(innerHTML)"></div>
    <div id="fragmentTimerOut"></div>
  `);

  await page.locator('#fragmentPublishTimerBtn').click();
  await expect(page.locator('#fragmentPublishTimer')).toHaveText('Timer');
  await expect(page.locator('#fragmentTimerOut')).toHaveText('timer subscriber:1');
  await page.waitForTimeout(140);
  expect(timerSubscriberCalls).toBe(1);
});

test('fragment inserted API timers are canceled when timer attributes are removed', async ({ page }) => {
  let fragmentTimerCalls = 0;

  await page.route('**/edge/fragment-cancelable-timer-source', route => route.fulfill({
    contentType: 'text/html',
    body: '<fragment target="#fragmentCancelableTimerHost(innerHTML)"><span id="fragmentCancelableTimer" GET="/edge/fragment-cancelable-timer" timer="120" target="#fragmentCancelableTimerOut(innerHTML)">Timer action</span></fragment>'
  }));
  await page.route('**/edge/fragment-cancelable-timer', route => {
    fragmentTimerCalls += 1;
    return route.fulfill({
      contentType: 'text/html',
      body: `fragment-cancelable-timer:${fragmentTimerCalls}`
    });
  });

  await mountHTMLeX(page, `
    <button id="fragmentCancelableTimerBtn" GET="/edge/fragment-cancelable-timer-source">Insert timer</button>
    <div id="fragmentCancelableTimerHost"></div>
    <div id="fragmentCancelableTimerOut"></div>
  `);

  await page.locator('#fragmentCancelableTimerBtn').click();
  await expect(page.locator('#fragmentCancelableTimer')).toHaveAttribute('data-htmlex-registered', 'true');

  await page.locator('#fragmentCancelableTimer').evaluate(element => element.removeAttribute('timer'));
  await page.waitForTimeout(180);

  expect(fragmentTimerCalls).toBe(0);
  await expect(page.locator('#fragmentCancelableTimerOut')).toHaveText('');
});

test('sequential default fragments preserve all fragments in one response', async ({ page }) => {
  await page.route('**/edge/sequential-default-fragments', route => route.fulfill({
    contentType: 'text/html',
    body: '<fragment><span class="seq-default">First</span></fragment><fragment><span class="seq-default">Second</span></fragment>'
  }));

  await mountHTMLeX(page, `
    <button id="sequentialDefaultBtn" GET="/edge/sequential-default-fragments" sequential="10">Original</button>
  `);

  await page.locator('#sequentialDefaultBtn').click();

  await expect(page.locator('#sequentialDefaultBtn .seq-default')).toHaveText(['First', 'Second']);
});
