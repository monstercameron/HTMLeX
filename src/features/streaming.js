/**
 * @fileoverview Domain logic for streaming endpoints.
 * This module handles various streaming and asynchronous operations such as
 * loading more items, notifications, sequential polling, process steps, demo loading,
 * and SSE endpoints.
 *
 * @module features/streaming
 */

import { render } from '../components/HTMLeX.js';
import {
  renderLoadingMessage,
  renderNotificationMessage,
  renderCounter, NotificationsDemo, renderFragment, ClickCounterWidget, multiFragmentDemo
} from '../components/Components.js';

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
 * Handles the '/sequential/poll' endpoint.
 * After a delay, sends the current poll value and increments it.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export async function sequentialPoll(req, res) {
  setTimeout(() => {
    try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderFragment('this(innerHTML)', render(`${pollVal++}, \n`)));
    } catch (err) {
      console.error('Error in sequentialPoll:', err);
      if (!res.headersSent) res.status(500).send('Internal server error');
    }
  }, 1000);
}

/**
 * Internal helper for process step endpoints.
 * Sends a message indicating the step and the current time.
 * @param {number} step - The process step number.
 * @param {import('express').Response} res - Express response object.
 */
function processStep(step, res) {
  setTimeout(() => {
    try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const message = `Step ${step}: Data received at ${new Date().toLocaleTimeString()}<br>`;
      res.send(renderFragment('this(append)', render(message)));
    } catch (err) {
      console.error(`Error in processStep${step}:`, err);
      if (!res.headersSent) res.status(500).send('Internal server error');
    }
  }, 100);
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
 * Handles the '/demo/loading' endpoint.
 * Sends a loading spinner and, after a delay, sends the final payload.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export async function demoLoading(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    res.write(renderFragment('#loadingDemoOutput(innerHTML)', render(`<div><span class="spinner"></span>Loading, please wait...</div>`)));
    setTimeout(() => {
      try {
        res.write(renderFragment('#loadingDemoOutput(innerHTML)', render(`<div class="p-4 bg-green-700 rounded-md text-green-100">Payload loaded after 5 seconds!</div>`)));
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
 * Sends an HTML fragment indicating an SSE action.
 * @async
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export async function sseSubscribeMessage(req, res) {
  try {
    res.send(renderFragment('this(innerHTML)', render(`SSe action performed`)));
  } catch (err) {
    console.error('Error in sseSubscribeMessage:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
}
