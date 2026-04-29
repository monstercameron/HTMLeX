import { renderFragment } from '../components/HTMLeX.js';
import { logRequestWarning } from '../serverLogger.js';

const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
const DEFAULT_ERROR_MESSAGE = 'Internal server error';

export function setHtmlResponse(res) {
  if (!res.headersSent) {
    res.setHeader('Content-Type', HTML_CONTENT_TYPE);
  }
}

export function sendFragmentResponse(res, target, htmlContent, fragmentAttributes = undefined) {
  setHtmlResponse(res);
  res.send(renderFragment(target, htmlContent, fragmentAttributes));
}

export function writeFragmentResponse(res, target, htmlContent, fragmentAttributes = undefined) {
  setHtmlResponse(res);
  res.write(renderFragment(target, htmlContent, fragmentAttributes));
}

export function endResponse(res) {
  if (!res.writableEnded) {
    res.end();
  }
}

export function sendServerError(res, message = DEFAULT_ERROR_MESSAGE) {
  if (!res.headersSent) {
    res.status(500).send(message);
    return;
  }

  logRequestWarning(res.req, 'Unable to send 500 response because headers were already sent.', {
    attemptedMessage: message,
  });
}

export function endServerError(res) {
  if (!res.headersSent) {
    res.status(500).end();
    return;
  }

  logRequestWarning(res.req, 'Ending already-started response after server error.');
  endResponse(res);
}
