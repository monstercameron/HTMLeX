/**
 * @fileoverview Domain logic for streaming endpoints.
 * This module handles various streaming and asynchronous operations such as
 * loading more items, notifications, sequential polling, process steps, demo loading,
 * and SSE endpoints.
 *
 * @module features/streaming
 */

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
  sendServerError,
  writeFragmentResponse,
} from './responses.js';

function responseDelay(ms) {
  return process.env.HTMLEX_TEST_FAST === '1' ? Math.min(ms, 25) : ms;
}

function renderLoadMoreItems(count = 5) {
  let itemsHtml = '';
  const baseTimestamp = Date.now();
  for (let index = 0; index < count; index += 1) {
    itemsHtml += render(div({ class: 'surface-muted p-3 small' }, `Item ${baseTimestamp + index}`));
  }
  return itemsHtml;
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
    setTimeout(() => {
      try {
        writeFragmentResponse(res, '#infiniteList(append)', renderLoadMoreItems());
      } catch (writeError) {
        console.error('Error while writing items in loadMoreItems:', writeError);
      }
      endResponse(res);
    }, responseDelay(2000));
  } catch (error) {
    console.error('Error in loadMoreItems:', error);
    endServerError(res);
  }
}

export async function infiniteScrollDemoInit(req, res) {
  try {
    sendFragmentResponse(res, '#demoCanvas(innerHTML)', InfiniteScrollDemo());
  } catch (error) {
    console.error('Error in infiniteScrollDemoInit:', error);
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
    console.error('Error in notificationsDemoInit:', error);
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
    setTimeout(() => {
      try {
        writeFragmentResponse(
          res,
          '#notificationArea(innerHTML)',
          renderNotificationMessage('You have a new notification! It will disappear in 5000ms'),
          { timer: '5000' }
        );
      } catch (writeError) {
        console.error('Error while writing notification in fetchNotification:', writeError);
      } finally {
        endResponse(res);
      }
    }, responseDelay(2500));
  } catch (error) {
    console.error('Error in fetchNotification:', error);
    endServerError(res);
  }
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
    console.error('Error in incrementCounter:', error);
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
    clickerCounter++;
    sendFragmentResponse(res, '#counterDisplay(innerHTML)', renderCounter(clickerCounter));
  } catch (error) {
    console.error('Error in incrementCounter:', error);
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
    console.error('Error in multiFragmentDemoInit:', error);
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
    console.error('Error in multiFragment:', error);
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
    console.error('Error in sequentialDemoInit:', error);
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
    await new Promise(resolve => setTimeout(resolve, responseDelay(1000)));
    const timestamp = new Date().toISOString();
    const contentNode = div({}, timestamp);
    const htmlContent = render(contentNode);
    writeFragmentResponse(res, '#sequentialOutput(append)', htmlContent);
  } catch (error) {
    console.error('Error in sequentialNext:', error);
    if (!res.headersSent) {
      res.status(500).write('Internal server error');
    }
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
function processStep(step, res) {
  setTimeout(() => {
    try {
      const message = `Step ${step}: Data received at ${new Date().toLocaleTimeString()}`;
      sendFragmentResponse(res, `#chainOutput(${step === 1 ? 'innerHTML' : 'append'})`, render(div({}, message)));
    } catch (error) {
      console.error(`Error in processStep${step}:`, error);
      sendServerError(res);
    }
  }, responseDelay(1000));
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
    console.error('Error in processInit:', error);
    endServerError(res);
  }
}

/**
 * Handles the '/process/step1' endpoint.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
export function processStep1(req, res) {
  processStep(1, res);
}

/**
 * Handles the '/process/step2' endpoint.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
export function processStep2(req, res) {
  processStep(2, res);
}

/**
 * Handles the '/process/step3' endpoint.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
export function processStep3(req, res) {
  processStep(3, res);
}

/**
 * Handles the '/process/step4' endpoint.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
export function processStep4(req, res) {
  processStep(4, res);
}

/**
 * Handles the '/process/step5' endpoint.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 */
export function processStep5(req, res) {
  processStep(5, res);
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
    console.error('Error in demoInit:', error);
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

    setTimeout(() => {
      try {
        const payloadNode = div(
          { class: 'alert alert-info mb-0' },
          'Payload received after 5000ms'
        );
        writeFragmentResponse(res, '#loadingDemoOutput(innerHTML)', render(payloadNode));
      } catch (writeError) {
        console.error('Error writing demo loading payload:', writeError);
      }
      endResponse(res);
    }, responseDelay(5000));
  } catch (error) {
    console.error('Error in demoLoading:', error);
    endServerError(res);
  }
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
    console.error('Error in sseDemoInit:', error);
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
    res.setHeader('Emit', 'sseUpdate');
    res.send('');
  } catch (error) {
    console.error('Error in sseSubscribe:', error);
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
    console.error('Error in sseSubscribeMessage:', error);
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
    console.error('Error in chatDemoInit:', error);
    endServerError(res);
  }
}

export async function webSocketUpdatesDemoInit(req, res) {
  try {
    writeFragmentResponse(res, '#demoCanvas(innerHTML)', render(WebSocketUpdatesDemo()));
    endResponse(res);
  } catch (error) {
    console.error('Error in webSocketUpdatesDemoInit:', error);
    endServerError(res);
  }
}

export async function pollingDemoInit(req, res) {
  try {
    sendFragmentResponse(res, '#demoCanvas(innerHTML)', PollingDemo());
  } catch (error) {
    console.error('Error in pollingDemoInit:', error);
    sendServerError(res);
  }
}

export async function pollingTick(req, res) {
  try {
    const timestamp = new Date().toISOString();
    sendFragmentResponse(res, '#pollingOutput(innerHTML)', render(div({}, `Polling update at ${timestamp}`)));
  } catch (error) {
    console.error('Error in pollingTick:', error);
    sendServerError(res);
  }
}

export async function hoverDemoInit(req, res) {
  try {
    sendFragmentResponse(res, '#demoCanvas(innerHTML)', HoverTriggerDemo());
  } catch (error) {
    console.error('Error in hoverDemoInit:', error);
    sendServerError(res);
  }
}

export async function hoverMessage(req, res) {
  try {
    sendFragmentResponse(res, '#hoverOutput(innerHTML)', render(div({}, 'Hover action loaded')));
  } catch (error) {
    console.error('Error in hoverMessage:', error);
    sendServerError(res);
  }
}

