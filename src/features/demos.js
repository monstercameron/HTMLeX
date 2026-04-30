import fs from 'node:fs/promises';
import path from 'node:path';
import { DemoItem } from '../components/Components.js';
import { render, tag } from '../components/HTMLeX.js';
import { logRequestError, logRequestWarning } from '../serverLogger.js';
import { sendFragmentResponse, sendHtmlResponse, sendTextResponse } from './responses.js';

// Path to the demos JSON file.
const DEFAULT_DEMOS_FILE = path.join(import.meta.dirname, '..', 'persistence', 'demos.json');
const REQUIRED_DEMO_FIELDS = [
  'id',
  'icon',
  'title',
  'subtitle',
  'description',
  'initDemoHref',
  'launchButtonText',
  'learnMoreText',
  'learnMoreHref'
];
const DEMO_ROUTE_BASE_URL = 'https://htmlex.local';
let cachedDemosFile = '';
let cachedDemosMtimeMs = 0;
let cachedDemosSize = 0;
let cachedDemosHtml = '';

function safeString(value, fallback = '') {
  try {
    return String(value ?? fallback);
  } catch {
    return fallback;
  }
}

function getField(target, fieldName, fallback = undefined) {
  try {
    return target?.[fieldName] ?? fallback;
  } catch {
    return fallback;
  }
}

function getDemosFile() {
  const configuredFile = safeString(process.env.HTMLEX_DEMOS_FILE).trim();
  return path.resolve(configuredFile || DEFAULT_DEMOS_FILE);
}

function normalizeRequiredString(value, fieldName, index) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  if (!normalizedValue) {
    throw new TypeError(`Demo item ${index} has an invalid ${fieldName} field.`);
  }

  return normalizedValue;
}

function normalizeRouteHref(value, fieldName, index) {
  const href = normalizeRequiredString(value, fieldName, index);
  let url;
  try {
    url = new URL(href, DEMO_ROUTE_BASE_URL);
  } catch (error) {
    throw new TypeError(`Demo item ${index} has an invalid ${fieldName} route.`, { cause: error });
  }

  if (!href.startsWith('/') || href.startsWith('//') || url.origin !== DEMO_ROUTE_BASE_URL) {
    throw new TypeError(`Demo item ${index} has an unsafe ${fieldName} route.`);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function normalizeDemoItem(demo, index) {
  if (!demo || typeof demo !== 'object' || Array.isArray(demo)) {
    throw new TypeError(`Demo item ${index} must be an object.`);
  }

  const normalizedDemo = {};
  for (const fieldName of REQUIRED_DEMO_FIELDS) {
    normalizedDemo[fieldName] = normalizeRequiredString(getField(demo, fieldName), fieldName, index);
  }
  normalizedDemo.initDemoHref = normalizeRouteHref(getField(demo, 'initDemoHref'), 'initDemoHref', index);
  normalizedDemo.learnMoreHref = normalizeRouteHref(getField(demo, 'learnMoreHref'), 'learnMoreHref', index);

  const highlights = getField(demo, 'highlights');
  if (!Array.isArray(highlights) || highlights.length === 0) {
    throw new TypeError(`Demo item ${index} must include at least one highlight.`);
  }

  normalizedDemo.highlights = highlights.map((highlight, highlightIndex) => (
    normalizeRequiredString(highlight, `highlights[${highlightIndex}]`, index)
  ));

  return normalizedDemo;
}

function parseDemoCatalog(data) {
  let demos;
  try {
    demos = JSON.parse(data);
  } catch (error) {
    throw new SyntaxError('Demo catalog contains invalid JSON.', { cause: error });
  }
  if (!Array.isArray(demos)) {
    throw new TypeError('Demo catalog must be a JSON array.');
  }

  const normalizedDemos = demos.map((demo, index) => normalizeDemoItem(demo, index));
  const seenIds = new Set();
  const seenDetailRoutes = new Set();
  for (const [index, demo] of normalizedDemos.entries()) {
    if (seenIds.has(demo.id)) {
      throw new TypeError(`Demo item ${index} duplicates id "${demo.id}".`);
    }
    if (seenDetailRoutes.has(demo.learnMoreHref)) {
      throw new TypeError(`Demo item ${index} duplicates detail route "${demo.learnMoreHref}".`);
    }
    seenIds.add(demo.id);
    seenDetailRoutes.add(demo.learnMoreHref);
  }

  return normalizedDemos;
}

async function getRenderedDemosHtml() {
  const demosFile = getDemosFile();
  let fileStats;
  try {
    fileStats = await fs.stat(demosFile);
  } catch (error) {
    throw new Error(`Unable to stat demo catalog file: ${demosFile}`, { cause: error });
  }
  const { mtimeMs, size } = fileStats;
  if (
    cachedDemosHtml &&
    cachedDemosFile === demosFile &&
    cachedDemosMtimeMs === mtimeMs &&
    cachedDemosSize === size
  ) {
    return cachedDemosHtml;
  }

  let data;
  try {
    data = await fs.readFile(demosFile, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read demo catalog file: ${demosFile}`, { cause: error });
  }
  const demos = parseDemoCatalog(data);
  const html = demos.map((demo) => render(DemoItem(demo))).join('');

  cachedDemosFile = demosFile;
  cachedDemosMtimeMs = mtimeMs;
  cachedDemosSize = size;
  cachedDemosHtml = html;
  return html;
}

async function loadDemos() {
  const demosFile = getDemosFile();
  try {
    return parseDemoCatalog(await fs.readFile(demosFile, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) throw error;
    throw new Error(`Unable to read demo catalog file: ${demosFile}`, { cause: error });
  }
}

function renderDemoDetailsDocument(demo) {
  const highlightItems = demo.highlights.map(highlight => tag('li', {}, highlight));
  return '<!DOCTYPE html>' + render(tag('html', { lang: 'en' },
    tag('head', {},
      tag('meta', { charset: 'utf-8' }),
      tag('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
      tag('title', {}, `${demo.title} - HTMLeX Demo`)
    ),
    tag('body', {},
      tag('main', { style: 'max-width: 720px; margin: 3rem auto; padding: 0 1rem; font-family: system-ui, sans-serif; line-height: 1.5;' },
        tag('a', { href: '/', style: 'color: #0d6efd;' }, 'Back to demos'),
        tag('h1', {}, demo.title),
        tag('p', {}, demo.description),
        tag('h2', {}, 'Highlights'),
        tag('ul', {}, ...highlightItems),
        tag('p', {},
          tag('a', { href: demo.initDemoHref, style: 'color: #0d6efd;' }, `Open ${demo.launchButtonText}`)
        )
      )
    )
  ));
}

/**
 * Express route handler that loads demos from the JSON file,
 * wraps the rendered catalog in an HTMLeX fragment and sends it as the response.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export async function loadAndRenderDemos(req, res) {
  try {
    sendFragmentResponse(res, 'this(innerHTML)', await getRenderedDemosHtml());
  } catch (error) {
    logRequestError(req, 'Failed to load demo catalog.', error);
    sendTextResponse(res, 500, 'Error loading demos');
  }
}

/**
 * Express route handler for catalog Learn More links.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export async function renderDemoDetails(req, res) {
  try {
    const demos = await loadDemos();
    const requestPath = safeString(getField(req, 'path'));
    const demo = demos.find(item => item.learnMoreHref === requestPath);

    if (!demo) {
      logRequestWarning(req, 'Demo detail route was not found.', {
        path: requestPath,
        statusCode: 404
      });
      sendTextResponse(res, 404, `Demo details not found. Request ID: ${safeString(getField(req, 'requestId'))}`);
      return;
    }

    sendHtmlResponse(res, 200, renderDemoDetailsDocument(demo));
  } catch (error) {
    logRequestError(req, 'Failed to render demo details.', error);
    sendTextResponse(res, 500, 'Error loading demo details');
  }
}
