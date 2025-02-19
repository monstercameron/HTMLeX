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
  renderCounter, NotificationsDemo,
  ClickCounterWidget, multiFragmentDemo,
  SSESubscribersDemo, SignalChainingDemo,
  WebSocketUpdatesDemo, loadingStateDemo,
  SequentialDemo
} from '../components/Components.js';
import { renderFragment } from "../components/HTMLeX.js"

import { write } from 'fs';

/**
 * Module-level counter for the clicker demo.
 * @type {number}
 */
let clickerCounter = 0;

/**
 * Module-level value for sequential polling.
 * @type {number}
 */
let pollVal = 0;

/**
 * Handles the '/items/loadMore' endpoint.
 * Sends a loading message and, after a delay, appends more items.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export async function loadMoreItems(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    res.write(renderFragment('#infiniteList(append)', renderLoadingMessage("Loading more items...")));
    setTimeout(() => {
      try {
        let itemsHtml = "";
        for (let i = 0; i < 5; i++) {
          itemsHtml += render(`<div class="p-2 bg-gray-700 rounded-md text-gray-100">Item ${Date.now() + i}</div>`);
        }
        res.write(renderFragment('#infiniteList(append)', itemsHtml));
      } catch (innerErr) {
        console.error('Error while writing items in loadMoreItems:', innerErr);
      }
      if (!res.headersSent) res.end();
    }, 2000);
  } catch (err) {
    console.error('Error in loadMoreItems:', err);
    if (!res.headersSent) res.status(500).end();
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
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    // Write the final notification fragment immediately.
    res.write(renderFragment('#demoCanvas(innerHTML)', NotificationsDemo()));
    res.end();
  } catch (err) {
    console.error('Error in notificationsDemoInit:', err);
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.end();
    }
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
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    // Write a loading message fragment immediately.
    res.write(
      renderFragment(
        '#notificationArea(innerHTML)',
        renderLoadingMessage("Fetching notification in 2500ms...")
      )
    );
    // After 2500ms, write the final notification fragment and then close the response.
    setTimeout(() => {
      try {
        res.write(
          renderFragment(
            '#notificationArea(innerHTML)',
            renderNotificationMessage("You have a new notification! It will disappear in 5000ms"),
            { timer: "5000" }
          )
        );
      } catch (innerErr) {
        console.error('Error while writing notification in fetchNotification:', innerErr);
      } finally {
        // Ensure the response is closed regardless of errors.
        res.end();
      }
    }, 2500);
  } catch (err) {
    console.error('Error in fetchNotification:', err);
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.end();
    }
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
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderFragment('#demoCanvas(innerHTML)', ClickCounterWidget()));
  } catch (err) {
    console.error('Error in incrementCounter:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
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
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderFragment('#counterDisplay(innerHTML)', renderCounter(clickerCounter)));
  } catch (err) {
    console.error('Error in incrementCounter:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
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
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    // Write the HTML fragment to update the target element.
    res.write(renderFragment("#demoCanvas(innerHTML)", multiFragmentDemo()));
    // End the response to finalize the transmission.
    res.end();
  } catch (err) {
    console.error('Error in multiFragmentDemoInit:', err);
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    } else {
      res.end();
    }
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
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    const fragment1 = renderFragment('#multiUpdate1(innerHTML)', render(`<div class="p-4 bg-blue-700 rounded-md text-white">Primary Content Loaded</div>`));
    const fragment2 = renderFragment('#multiUpdate2(append)', render(`<div class="p-2 bg-blue-600 rounded-md text-white mt-2">Additional Content Appended</div>`));
    res.send(fragment1 + fragment2);
  } catch (err) {
    console.error('Error in multiFragment:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
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
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    res.write(renderFragment("#demoCanvas(innerHTML)", SequentialDemo()));
  } catch (err) {
    console.error('Error in sequentialDemoInit:', err);
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  } finally {
    res.end();
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
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const timestamp = new Date().toISOString();
    const contentNode = div({}, timestamp);
    const htmlContent = render(contentNode);
    res.write(renderFragment('#sequentialOutput(append)', htmlContent));
  } catch (err) {
    console.error('Error in sequentialNext:', err);
    if (!res.headersSent) {
      res.status(500).write('Internal server error');
    }
  } finally {
    res.end();
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
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const message = `Step ${step}: Data received at ${new Date().toLocaleTimeString()}<br>`;
      res.send(renderFragment(`#chainOutput(${step === 1 ? "innerHTML" : "append"})`, render(message)));
    } catch (err) {
      console.error(`Error in processStep${step}:`, err);
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  }, 1000);
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
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    // Write the HTML fragment to update the "#demoCanvas" element.
    res.write(renderFragment("#demoCanvas(innerHTML)", SignalChainingDemo()));
    // End the response to finalize the transmission.
    res.end();
  } catch (err) {
    console.error('Error in processInit:', err);
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    } else {
      res.end();
    }
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
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    res.write(renderFragment("#demoCanvas(innerHTML)", loadingStateDemo()));
    res.end();
  } catch (err) {
    console.error('Error in demoInit:', err);
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.end();
    }
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
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    // Create a virtual node for the loading state.
    const loadingNode = div(
      {},
      span({ class: 'spinner' }),
      'Loading, wait 5000ms'
    );

    // Write the loading fragment.
    res.write(renderFragment('#loadingDemoOutput(innerHTML)', render(loadingNode)));

    setTimeout(() => {
      try {
        // Create a virtual node for the final payload.
        const payloadNode = div(
          { class: 'p-4 bg-green-700 rounded-md text-green-100' },
          'Payload received after 5000ms'
        );
        // Write the payload fragment.
        res.write(renderFragment('#loadingDemoOutput(innerHTML)', render(payloadNode)));
      } catch (innerErr) {
        console.error('Error writing demo loading payload:', innerErr);
      }
      if (!res.headersSent) res.end();
    }, 5000);
  } catch (err) {
    console.error('Error in demoLoading:', err);
    if (!res.headersSent) res.status(500).end();
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
    res.write(renderFragment("#demoCanvas(innerHTML)", SSESubscribersDemo()));
    res.end();
  } catch (err) {
    console.error('Error in sseDemoInit:', err);
    if (!res.headersSent) {
      res.status(500).send('');
    }
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
  } catch (err) {
    console.error('Error in sseSubscribe:', err);
    if (!res.headersSent) res.status(500).send('');
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
    const message = render(`SSE action performed`);
    const fragment = renderFragment('this(innerHTML)', message);
    res.send(fragment);
  } catch (err) {
    console.error('Error in sseSubscribeMessage:', err);
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
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
    res.write(renderFragment('#demoCanvas(innerHTML)', WebSocketUpdatesDemo()));
    res.end();
  } catch (err) {
    console.error('Error in chatDemoInit:', err);
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  }
}

