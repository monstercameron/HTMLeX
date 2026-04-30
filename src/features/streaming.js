/**
 * @fileoverview Domain logic for streaming endpoints.
 * This module handles various streaming and asynchronous operations such as
 * loading more items, notifications, sequential polling, process steps, demo loading,
 * and SSE endpoints.
 *
 * @module features/streaming
 */

import { setTimeout as delay } from 'node:timers/promises';
import { render, div, span } from '../components/HTMLeX.js';
import {
  renderLoadingMessage,
  renderNotificationMessage,
  renderCounter,
  NotificationsDemo,
  ClickCounterWidget,
  multiFragmentDemo,
  SSESubscribersDemo,
  SignalChainingDemo,
  ChatInterfaceDemo,
  WebSocketUpdatesDemo,
  loadingStateDemo,
  SequentialDemo,
  InfiniteScrollDemo,
  PollingDemo,
  HoverTriggerDemo,
} from '../components/Components.js';
import {
  endResponse,
  endServerError,
  sendFragmentResponse,
  sendTextResponse,
  sendServerError,
  setResponseHeader,
  writeFragmentResponse,
} from './responses.js';
import { logRequestError } from '../serverLogger.js';

const FALLBACK_ISO_TIMESTAMP = '1970-01-01T00:00:00.000Z';
const FALLBACK_CLOCK_TIME = 'now';

function safeString(value, fallback = '') {
  try {
    return String(value ?? fallback);
  } catch {
    return fallback;
  }
}

function getCurrentTimestamp() {
  try {
    const timestamp = Date.now();
    return Number.isSafeInteger(timestamp) ? timestamp : 0;
  } catch {
    return 0;
  }
}

function formatIsoTimestamp() {
  try {
    return new Date().toISOString();
  } catch {
    return FALLBACK_ISO_TIMESTAMP;
  }
}

function formatClockTime() {
  try {
    return new Date().toLocaleTimeString();
  } catch {
    return FALLBACK_CLOCK_TIME;
  }
}

function normalizeItemCount(count) {
  return Number.isSafeInteger(count) && count >= 0 && count <= 100 ? count : 5;
}

function responseDelay(ms) {
  return safeString(process.env.HTMLEX_TEST_FAST).trim() === '1' ? Math.min(ms, 25) : ms;
}

function waitForResponseDelay(ms) {
  return delay(responseDelay(ms));
}

function renderLoadMoreItems(count = 5) {
  const itemCount = normalizeItemCount(count);
  const baseTimestamp = getCurrentTimestamp();
  return Array.from({ length: itemCount }, (_, index) =>
    render(div({ class: 'surface-muted p-3 small' }, `Item ${baseTimestamp + index}`))
  ).join('');
}

/**
 * Module-level counter for the clicker demo.
 * @type {number}
 */
let clickerCounter = 0;

/**
 * Handles the '/items/loadMore' endpoint.
 * Sends a loading message and, after a delay, appends more items.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export async function loadMoreItems(req, res) {
  try {
    writeFragmentResponse(res, '#infiniteList(append)', renderLoadingMessage('Loading more items...'));
    await waitForResponseDelay(2000);
    writeFragmentResponse(res, '#infiniteList(append)', renderLoadMoreItems());
  } catch (error) {
    logRequestError(req, 'Failed to stream load-more items.', error);
    endServerError(res);
    return;
  }

  endResponse(res);
}

export async function infiniteScrollDemoInit(req, res) {
  try {
    sendFragmentResponse(res, '#demoCanvas(innerHTML)', InfiniteScrollDemo());
  } catch (error) {
    logRequestError(req, 'Failed to initialize infinite-scroll demo.', error);
    sendServerError(res);
  }
}

/**
 * Handles the '/notifications/init' endpoint.
 * Immediately sends the final notification content fragment.
 *
 * This function writes a fragment to update the target element (using the
 * "#demoCanvas(innerHTML)" directive) and then finalizes the response with `res.end()`.
 *
 * @async
 * @function notificationsDemoInit
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response has been fully sent.
 */
export async function notificationsDemoInit(req, res) {
  try {
    writeFragmentResponse(res, '#demoCanvas(innerHTML)', render(NotificationsDemo()));
    endResponse(res);
  } catch (error) {
    logRequestError(req, 'Failed to initialize notifications demo.', error);
    endServerError(res);
  }
}

/**
 * Handles the '/notifications' endpoint.
 * Sends an initial loading fragment and, after a delay, writes a notification fragment before closing the response.
 *
 * The response stream first sends a loading message for the target element
 * ("#notificationArea(innerHTML)") and then, after a 2500ms delay, writes the final
 * notification message (with a timer option). The connection is then properly closed with `res.end()`.
 *
 * @async
 * @function fetchNotification
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the entire response has been sent.
 */
export async function fetchNotification(req, res) {
  try {
    writeFragmentResponse(
      res,
      '#notificationArea(innerHTML)',
      renderLoadingMessage('Fetching notification in 2500ms...')
    );
    await waitForResponseDelay(2500);
    writeFragmentResponse(
      res,
      '#notificationArea(innerHTML)',
      renderNotificationMessage('You have a new notification! It will disappear in 5000ms'),
      { timer: '5000' }
    );
  } catch (error) {
    logRequestError(req, 'Failed to fetch notification.', error);
    endServerError(res);
    return;
  }

  endResponse(res);
}

/**
 * Increments the counter for the clicker demo and sends the updated counter as an HTML fragment.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export async function incrementCounterDemoInit(req, res) {
  try {
    sendFragmentResponse(res, '#demoCanvas(innerHTML)', ClickCounterWidget());
  } catch (error) {
    logRequestError(req, 'Failed to initialize counter demo.', error);
    sendServerError(res);
  }
}

/**
 * Increments the counter for the clicker demo and sends the updated counter as an HTML fragment.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export async function incrementCounter(req, res) {
  try {
    clickerCounter = Number.isSafeInteger(clickerCounter) && clickerCounter < Number.MAX_SAFE_INTEGER
      ? clickerCounter + 1
      : 1;
    sendFragmentResponse(res, '#counterDisplay(innerHTML)', renderCounter(clickerCounter));
  } catch (error) {
    logRequestError(req, 'Failed to increment counter demo.', error);
    sendServerError(res);
  }
}

/**
 * Handles the '/multi/init' endpoint.
 * Sends multiple HTML fragments in a single response to update the UI.
 *
 * This endpoint generates an HTML fragment by invoking `multiFragmentDemo()`
 * and targets the "#demoCanvas" element (updating its innerHTML) with the rendered content.
 * After sending the fragment, the response is properly terminated.
 *
 * @async
 * @function multiFragmentDemoInit
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been completely sent.
 */
export async function multiFragmentDemoInit(req, res) {
  try {
    writeFragmentResponse(res, '#demoCanvas(innerHTML)', render(multiFragmentDemo()));
    endResponse(res);
  } catch (error) {
    logRequestError(req, 'Failed to initialize multi-fragment demo.', error);
    endServerError(res);
  }
}

/**
 * Handles the '/multi/fragment' endpoint.
 * Sends multiple HTML fragments in a single response.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export async function multiFragment(req, res) {
  try {
    const primaryContent = render(
      div({ class: 'surface p-3 small' }, 'Primary Content Loaded')
    );
    const appendContent = render(
      div({ class: 'surface-muted mt-2 p-3 small' }, 'Additional Content Appended')
    );
    writeFragmentResponse(
      res,
      '#multiUpdate1(innerHTML)',
      primaryContent
    );
    writeFragmentResponse(
      res,
      '#multiUpdate2(append)',
      appendContent
    );
    endResponse(res);
  } catch (error) {
    logRequestError(req, 'Failed to send multi-fragment response.', error);
    endServerError(res);
  }
}

/**
 * Handles the '/sequential/init' endpoint.
 * Sends the current poll value (via the SequentialDemo fragment) and increments it.
 *
 * This endpoint updates the "#demoCanvas" element's innerHTML with the output of `SequentialDemo()`
 * and immediately terminates the response.
 *
 * @async
 * @function sequentialDemoInit
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been fully sent.
 */
export async function sequentialDemoInit(req, res) {
  try {
    writeFragmentResponse(res, '#demoCanvas(innerHTML)', SequentialDemo());
  } catch (error) {
    logRequestError(req, 'Failed to initialize sequential demo.', error);
    endServerError(res);
  } finally {
    endResponse(res);
  }
}

/**
 * Handles the '/sequential/next' endpoint.
 * After a delay, sends a div containing the exact timestamp to update the target.
 *
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export async function sequentialNext(req, res) {
  try {
    await waitForResponseDelay(1000);
    const timestamp = formatIsoTimestamp();
    const contentNode = div({}, timestamp);
    const htmlContent = render(contentNode);
    writeFragmentResponse(res, '#sequentialOutput(append)', htmlContent);
  } catch (error) {
    logRequestError(req, 'Failed to append sequential update.', error);
    endServerError(res);
  } finally {
    endResponse(res);
  }
}

/**
 * Internal helper for process step endpoints.
 * Simulates work by delaying the response, then sends an HTML fragment indicating the process step
 * and the time at which the data was "received". This fragment is appended to the current content.
 *
 * This function is part of a chain of signals where an API response is delayed to simulate work,
 * then a publish signal is triggered to invoke a subsequent API call.
 *
 * @param {number} step - The current process step number.
 * @param {import('express').Response} res - The Express response object.
 */
async function processStep(step, req, res) {
  try {
    await waitForResponseDelay(1000);
    const message = `Step ${step}: Data received at ${formatClockTime()}`;
    sendFragmentResponse(res, `#chainOutput(${step === 1 ? 'innerHTML' : 'append'})`, render(div({}, message)));
  } catch (error) {
    logRequestError(req, `Failed to render process step ${step}.`, error);
    sendServerError(res);
  }
}

/**
 * Handles the '/process/step1' endpoint.
 * Sends an HTML fragment that triggers the signal chaining demo, updating the UI.
 *
 * This endpoint renders an HTML fragment via `SignalChainingDemo()` and targets the "#demoCanvas"
 * element to update its innerHTML. Once the fragment is sent, the response is properly terminated.
 *
 * @function processInit
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export function processInit(req, res) {
  try {
    writeFragmentResponse(res, '#demoCanvas(innerHTML)', render(SignalChainingDemo()));
    endResponse(res);
  } catch (error) {
    logRequestError(req, 'Failed to initialize signal chaining demo.', error);
    endServerError(res);
  }
}

/**
 * Handles the '/process/step1' endpoint.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
export async function processStep1(req, res) {
  await processStep(1, req, res);
}

/**
 * Handles the '/process/step2' endpoint.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
export async function processStep2(req, res) {
  await processStep(2, req, res);
}

/**
 * Handles the '/process/step3' endpoint.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
export async function processStep3(req, res) {
  await processStep(3, req, res);
}

/**
 * Handles the '/process/step4' endpoint.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
export async function processStep4(req, res) {
  await processStep(4, req, res);
}

/**
 * Handles the '/process/step5' endpoint.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
export async function processStep5(req, res) {
  await processStep(5, req, res);
}

/**
 * Handles the '/demo/init' endpoint.
 * Sends a loading spinner fragment and then, after a delay, sends the final payload.
 *
 * This endpoint writes an HTML fragment that updates the "#demoCanvas" element's innerHTML
 * with the output of `loadingStateDemo()`. After writing the fragment, the response is terminated.
 *
 * @async
 * @function demoInit
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been fully sent.
 */
export async function demoInit(req, res) {
  try {
    writeFragmentResponse(res, '#demoCanvas(innerHTML)', render(loadingStateDemo()));
    endResponse(res);
  } catch (error) {
    logRequestError(req, 'Failed to initialize loading demo.', error);
    endServerError(res);
  }
}

/**
 * Handles the '/demo/loading' endpoint.
 * Writes a loading spinner immediately and, after a 5-second delay,
 * writes the final payload to the response using HTMLeX virtual nodes.
 *
 * This function uses progressive updates by wrapping the content in an HTMLeX fragment
 * that targets the "#loadingDemoOutput" element's innerHTML.
 *
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response has been fully sent.
 */
export async function demoLoading(req, res) {
  try {
    const loadingNode = div(
      {},
      span({ class: 'spinner' }),
      'Loading, wait 5000ms'
    );

    writeFragmentResponse(res, '#loadingDemoOutput(innerHTML)', render(loadingNode));

    await waitForResponseDelay(5000);
    const payloadNode = div(
      { class: 'alert alert-info mb-0' },
      'Payload received after 5000ms'
    );
    writeFragmentResponse(res, '#loadingDemoOutput(innerHTML)', render(payloadNode));
  } catch (error) {
    logRequestError(req, 'Failed to stream loading demo.', error);
    endServerError(res);
    return;
  }

  endResponse(res);
}

/**
 * Handles the '/sse/subscribe' endpoint.
 * Initializes the SSE subscribers by sending an HTML fragment to update the target element.
 *
 * This endpoint writes a fragment that updates the "#demoCanvas" element's innerHTML with
 * the output of `SSESubscribersDemo()`. After writing the fragment, it ends the response.
 *
 * @async
 * @function sseDemoInit
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been fully sent.
 */
export async function sseDemoInit(req, res) {
  try {
    writeFragmentResponse(res, '#demoCanvas(innerHTML)', render(SSESubscribersDemo()));
    endResponse(res);
  } catch (error) {
    logRequestError(req, 'Failed to initialize SSE demo.', error);
    endServerError(res);
  }
}

/**
 * Handles the '/sse/subscribe' endpoint.
 * Sets an 'Emit' header for SSE and sends an empty response.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export async function sseSubscribe(req, res) {
  try {
    if (!setResponseHeader(res, 'Emit', 'sseUpdate')) {
      sendServerError(res, '');
      return;
    }
    sendTextResponse(res, 200, '');
  } catch (error) {
    logRequestError(req, 'Failed to emit SSE subscription signal.', error);
    sendServerError(res, '');
  }
}

/**
 * Handles the '/sse/subscribe/message' endpoint.
 * Sends an HTML fragment that indicates an SSE (Server-Sent Events) action was performed.
 *
 * This endpoint renders a fragment to update the target element's innerHTML with a message,
 * and sends the response immediately.
 *
 * @async
 * @function sseSubscribeMessage
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
export async function sseSubscribeMessage(req, res) {
  try {
    const message = render('SSE action performed');
    sendFragmentResponse(res, 'this(innerHTML)', message);
  } catch (error) {
    logRequestError(req, 'Failed to render SSE subscription message.', error);
    sendServerError(res);
  }
}

/**
 * Handles the '/sse/subscribe/message' endpoint.
 * Sends an HTML fragment indicating an SSE action by updating the target element.
 *
 * This endpoint writes a fragment that updates the "#demoCanvas" element's innerHTML
 * with the output of `WebSocketUpdatesDemo()`. After writing the fragment, the response is terminated.
 *
 * @async
 * @function chatDemoInit
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been fully sent.
 */
export async function chatDemoInit(req, res) {
  try {
    writeFragmentResponse(res, '#demoCanvas(innerHTML)', render(ChatInterfaceDemo()));
    endResponse(res);
  } catch (error) {
    logRequestError(req, 'Failed to initialize chat demo.', error);
    endServerError(res);
  }
}

export async function webSocketUpdatesDemoInit(req, res) {
  try {
    writeFragmentResponse(res, '#demoCanvas(innerHTML)', render(WebSocketUpdatesDemo()));
    endResponse(res);
  } catch (error) {
    logRequestError(req, 'Failed to initialize websocket updates demo.', error);
    endServerError(res);
  }
}

export async function pollingDemoInit(req, res) {
  try {
    sendFragmentResponse(res, '#demoCanvas(innerHTML)', PollingDemo());
  } catch (error) {
    logRequestError(req, 'Failed to initialize polling demo.', error);
    sendServerError(res);
  }
}

export async function pollingTick(req, res) {
  try {
    const timestamp = formatIsoTimestamp();
    sendFragmentResponse(res, '#pollingOutput(innerHTML)', render(div({}, `Polling update at ${timestamp}`)));
  } catch (error) {
    logRequestError(req, 'Failed to render polling tick.', error);
    sendServerError(res);
  }
}

export async function hoverDemoInit(req, res) {
  try {
    sendFragmentResponse(res, '#demoCanvas(innerHTML)', HoverTriggerDemo());
  } catch (error) {
    logRequestError(req, 'Failed to initialize hover demo.', error);
    sendServerError(res);
  }
}

export async function hoverMessage(req, res) {
  try {
    sendFragmentResponse(res, '#hoverOutput(innerHTML)', render(div({}, 'Hover action loaded')));
  } catch (error) {
    logRequestError(req, 'Failed to render hover message.', error);
    sendServerError(res);
  }
}
