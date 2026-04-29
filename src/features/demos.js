// ./src/features/demos.js

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DemoItem } from '../components/Components.js';
import { renderFragment } from "../components/HTMLeX.js"
import { render } from '../components/HTMLeX.js';

// Determine __dirname in ES modules.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the demos JSON file.
const DEMOS_FILE = path.join(__dirname, '..', 'persistence', 'demos.json');
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

/**
 * Express route handler that loads demos from the JSON file,
 * wraps each demo item in an HTMLeX fragment using the exported renderFragment,
 * and sends the concatenated HTML fragments as the response.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export async function loadAndRenderDemos(req, res) {
  try {
    const html = renderFragment('this(innerHTML)', await getRenderedDemosHtml());

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Error loading demos:', error);
    res.status(500).send('Error loading demos');
  }
}
