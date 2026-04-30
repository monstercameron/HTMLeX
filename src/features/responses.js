import { renderFragment } from '../components/HTMLeX.js';
import { logRequestWarning } from '../serverLogger.js';

const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
const DEFAULT_ERROR_MESSAGE = 'Internal server error';

function safeString(value, fallback = '') {
  try {
    return String(value ?? fallback);
  } catch {
    return fallback;
  }
}

function getResponseField(res, fieldName, fallback = undefined) {
  try {
    return res?.[fieldName] ?? fallback;
  } catch {
    return fallback;
  }
}

function logResponseWarning(res, message, details = {}) {
  try {
    logRequestWarning(getResponseField(res, 'req', undefined), message, details);
  } catch {
    // Response helpers must never throw while reporting a failed response write.
  }
}

function callResponseMethod(res, methodName, args = [], fallback = false) {
  try {
    const method = getResponseField(res, methodName, null);
    if (typeof method !== 'function') return fallback;
    return method.call(res, ...args);
  } catch (error) {
    logResponseWarning(res, `Response method "${methodName}" failed.`, {
      error: safeString(error?.message || error, 'Unknown response error'),
    });
    return fallback;
  }
}

function hasHeadersSent(res) {
  return Boolean(getResponseField(res, 'headersSent', true));
}

function hasWritableEnded(res) {
  return Boolean(getResponseField(res, 'writableEnded', true));
}

function renderSafeFragment(res, target, htmlContent, fragmentAttributes) {
  try {
    return renderFragment(target, htmlContent, fragmentAttributes);
  } catch (error) {
    logResponseWarning(res, 'Failed to render HTMLeX fragment response.', {
      error: safeString(error?.message || error, 'Unknown fragment render error'),
    });
    return null;
  }
}

export function setHtmlResponse(res) {
  if (!hasHeadersSent(res)) {
    callResponseMethod(res, 'setHeader', ['Content-Type', HTML_CONTENT_TYPE]);
  }
}

export function setResponseHeader(res, name, value) {
  if (hasHeadersSent(res)) {
    logResponseWarning(res, `Unable to set response header "${safeString(name)}" because headers were already sent.`);
    return false;
  }

  return callResponseMethod(res, 'setHeader', [safeString(name), safeString(value)], false) !== false;
}

export function sendTypedResponse(res, statusCode, message = '', contentType = null) {
  if (hasHeadersSent(res)) {
    logResponseWarning(res, `Unable to send HTTP ${statusCode} response because headers were already sent.`, {
      attemptedMessage: safeString(message),
    });
    return false;
  }

  const statusTarget = callResponseMethod(res, 'status', [statusCode], res) || res;
  const typeTarget = contentType
    ? callResponseMethod(statusTarget, 'type', [safeString(contentType)], statusTarget) || statusTarget
    : statusTarget;
  return callResponseMethod(typeTarget, 'send', [safeString(message)], false) !== false;
}

export function sendTextResponse(res, statusCode, message = '') {
  return sendTypedResponse(res, statusCode, message, 'text/plain');
}

export function sendHtmlResponse(res, statusCode, htmlContent = '') {
  return sendTypedResponse(res, statusCode, htmlContent, 'html');
}

export function sendEmptyResponse(res, statusCode = 204) {
  if (hasHeadersSent(res)) {
    logResponseWarning(res, `Unable to send HTTP ${statusCode} empty response because headers were already sent.`);
    return false;
  }

  const statusTarget = callResponseMethod(res, 'status', [statusCode], res) || res;
  return callResponseMethod(statusTarget, 'end', [], false) !== false;
}

export function sendFragmentResponse(res, target, htmlContent, fragmentAttributes = undefined) {
  const fragmentHtml = renderSafeFragment(res, target, htmlContent, fragmentAttributes);
  if (fragmentHtml === null) return false;
  setHtmlResponse(res);
  return callResponseMethod(res, 'send', [fragmentHtml]);
}

export function writeFragmentResponse(res, target, htmlContent, fragmentAttributes = undefined) {
  const fragmentHtml = renderSafeFragment(res, target, htmlContent, fragmentAttributes);
  if (fragmentHtml === null) return false;
  setHtmlResponse(res);
  return callResponseMethod(res, 'write', [fragmentHtml]);
}

export function endResponse(res) {
  if (!hasWritableEnded(res)) {
    return callResponseMethod(res, 'end');
  }
  return false;
}

export function sendServerError(res, message = DEFAULT_ERROR_MESSAGE) {
  if (!hasHeadersSent(res)) {
    const statusTarget = callResponseMethod(res, 'status', [500], res) || res;
    return callResponseMethod(statusTarget, 'send', [safeString(message, DEFAULT_ERROR_MESSAGE)]);
  }

  logResponseWarning(res, 'Unable to send 500 response because headers were already sent.', {
    attemptedMessage: safeString(message, DEFAULT_ERROR_MESSAGE),
  });
  return false;
}

export function endServerError(res) {
  if (!hasHeadersSent(res)) {
    const statusTarget = callResponseMethod(res, 'status', [500], res) || res;
    return callResponseMethod(statusTarget, 'end');
  }

  logResponseWarning(res, 'Ending already-started response after server error.');
  return endResponse(res);
}
