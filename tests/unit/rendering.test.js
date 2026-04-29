import assert from 'node:assert/strict';
import test from 'node:test';
import { render, renderFragment, tags } from '../../src/components/HTMLeX.js';

test('render escapes text nodes by default', () => {
  const html = render(tags.span({}, '<img src=x onerror="globalThis.__xss=1">'));

  assert.equal(
    html,
    '<span>&lt;img src=x onerror=&quot;globalThis.__xss=1&quot;&gt;</span>'
  );
  assert.doesNotMatch(html, /<img/i);
});

test('render escapes attribute values by default', () => {
  const html = render(tags.input({
    type: 'text',
    value: '" autofocus onfocus="globalThis.__xss=1'
  }));

  assert.equal(
    html,
    '<input type="text" value="&quot; autofocus onfocus=&quot;globalThis.__xss=1"></input>'
  );
});

test('renderFragment preserves trusted server-owned fragment HTML', () => {
  const html = renderFragment('#target(innerHTML)', '<div class="ok">Ready</div>');

  assert.equal(
    html,
    '<fragment target="#target(innerHTML)"><div class="ok">Ready</div></fragment>'
  );
});
