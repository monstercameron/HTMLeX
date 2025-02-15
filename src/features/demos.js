// ./src/features/demos.js

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DemoItem, renderFragment } from '../components/Components.js';
import { render } from '../components/HTMLeX.js';

// Determine __dirname in ES modules.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the demos JSON file.
const DEMOS_FILE = path.join(__dirname, '..', 'persistence', 'demos.json');

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
    const data = await fs.readFile(DEMOS_FILE, 'utf8');
    const demos = JSON.parse(data);

    // For each demo, generate the virtual node using DemoItem,
    // then render it to an HTML string and wrap it in a fragment.
    const fragments = demos.map((demo) => {
      const demoNode = DemoItem(demo);             // Virtual node for the demo
      const demoHtml = render(demoNode);             // Convert virtual node to HTML string
      // Wrap the demoHtml in a fragment using renderFragment.
      // (The target parameter is left empty or can be customized as needed.)
      return demoHtml;
    });
    const html = renderFragment('this(innerHTML)', fragments.join(''))

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Error loading demos:', error);
    res.status(500).send('Error loading demos');
  }
}
