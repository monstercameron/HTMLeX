import fs from 'node:fs/promises';
import path from 'node:path';
import { DemoItem } from '../components/Components.js';
import { render, tag } from '../components/HTMLeX.js';
import { logRequestError, logRequestWarning } from '../serverLogger.js';
import { sendFragmentResponse } from './responses.js';

// Path to the demos JSON file.
const DEMOS_FILE = path.join(import.meta.dirname, '..', 'persistence', 'demos.json');
let cachedDemosMtimeMs = 0;
let cachedDemosHtml = '';

async function getRenderedDemosHtml() {
  const { mtimeMs } = await fs.stat(DEMOS_FILE);
  if (cachedDemosHtml && cachedDemosMtimeMs === mtimeMs) {
    return cachedDemosHtml;
  }

  const data = await fs.readFile(DEMOS_FILE, 'utf8');
  const demos = JSON.parse(data);
  const html = demos.map((demo) => render(DemoItem(demo))).join('');

  cachedDemosMtimeMs = mtimeMs;
  cachedDemosHtml = html;
  return html;
}

async function loadDemos() {
  return JSON.parse(await fs.readFile(DEMOS_FILE, 'utf8'));
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
    res.status(500).send('Error loading demos');
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
    const demo = demos.find(item => item.learnMoreHref === req.path);

    if (!demo) {
      logRequestWarning(req, 'Demo detail route was not found.', {
        path: req.path,
        statusCode: 404
      });
      res.status(404).type('text/plain').send(`Demo details not found. Request ID: ${req.requestId}`);
      return;
    }

    res.type('html').send(renderDemoDetailsDocument(demo));
  } catch (error) {
    logRequestError(req, 'Failed to render demo details.', error);
    res.status(500).type('text/plain').send('Error loading demo details');
  }
}
