import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFragment,
  escapeAttribute,
  escapeHtml,
  generateFragment,
  rawHtml,
  render,
  renderFragment,
  tags,
} from '../../src/components/HTMLeX.js';

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

test('renderFragment supports fragment attributes without overriding the target', () => {
  const html = renderFragment(
    '#target(innerHTML)',
    '<div class="ok">Ready</div>',
    { timer: '5000', target: '#ignored(remove)' }
  );

  assert.equal(
    html,
    '<fragment timer="5000" target="#target(innerHTML)"><div class="ok">Ready</div></fragment>'
  );
});

test('escape helpers cover text and attribute-only edge cases', () => {
  assert.equal(
    escapeHtml(`Tom & "Jerry" <tag> 'ok'`),
    'Tom &amp; &quot;Jerry&quot; &lt;tag&gt; &#39;ok&#39;'
  );
  assert.equal(escapeAttribute('`template`'), '&#96;template&#96;');
});

test('render handles arrays, raw HTML, booleans, and omitted attributes', () => {
  const html = render([
    tags.input({
      disabled: true,
      value: 'ready',
      hidden: false,
      title: null,
      placeholder: undefined,
    }),
    rawHtml('<span data-owned="server">Trusted</span>'),
  ]);

  assert.equal(
    html,
    '<input disabled value="ready"></input><span data-owned="server">Trusted</span>'
  );
});

test('fragment helpers render status and target attributes consistently', () => {
  assert.equal(
    render(createFragment('Missing', '404')),
    '<fragment status="404">Missing</fragment>'
  );
  assert.equal(
    render(generateFragment('#panel(append)', tags.div({}, 'Ready'), '202')),
    '<fragment target="#panel(append)" status="202"><div>Ready</div></fragment>'
  );
});
