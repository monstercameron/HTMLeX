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
  tag,
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
    '<input type="text" value="&quot; autofocus onfocus=&quot;globalThis.__xss=1">'
  );
});

test('render rejects invalid tag and attribute names', () => {
  assert.throws(
    () => tag('img src=x onerror=globalThis.__xss=1', {}),
    /Invalid HTML tag name/
  );
  assert.throws(
    () => render(tag('div', { 'data-x onclick=globalThis.__xss=1': 'bad' })),
    /Invalid HTML attribute name/
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

test('renderFragment accepts primitive server-owned content and status values', () => {
  const html = renderFragment('#target(innerHTML)', 123n, 202n);

  assert.equal(
    html,
    '<fragment target="#target(innerHTML)" status="202">123</fragment>'
  );
});

test('escape helpers cover text and attribute-only edge cases', () => {
  assert.equal(
    escapeHtml(`Tom & "Jerry" <tag> 'ok'`),
    'Tom &amp; &quot;Jerry&quot; &lt;tag&gt; &#39;ok&#39;'
  );
  assert.equal(escapeAttribute('`template`'), '&#96;template&#96;');

  const hostileValue = {
    toString() {
      throw new Error('string denied');
    },
  };
  assert.equal(escapeHtml(hostileValue), '');
  assert.equal(escapeAttribute(hostileValue), '');
  assert.equal(rawHtml(hostileValue).html, '');
  assert.equal(render(rawHtml(hostileValue)), '');
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
    '<input disabled value="ready"><span data-owned="server">Trusted</span>'
  );
});

test('tag helpers treat omitted attrs and virtual children ergonomically', () => {
  const html = render([
    tags.div('Text child'),
    tags.section(tags.span({}, 'Nested')),
    tags.p(null, 'Null attrs'),
    2n,
  ]);

  assert.equal(
    html,
    '<div>Text child</div><section><span>Nested</span></section><p>Null attrs</p>2'
  );
});

test('render serializes primitive BigInt values without relying on prototype toString', () => {
  const originalToString = BigInt.prototype.toString;
  BigInt.prototype.toString = () => {
    throw new Error('bigint string unavailable');
  };

  try {
    assert.equal(render(2n), '2');
  } finally {
    BigInt.prototype.toString = originalToString;
  }
});

test('render handles malformed virtual children and hostile attrs safely', () => {
  assert.equal(
    render({ tag: 'div', attrs: { id: 'unit' }, children: 'Text child' }),
    '<div id="unit">Text child</div>'
  );
  assert.equal(render(rawHtml(null)), '');

  const hostileAttrs = new Proxy({}, {
    ownKeys() {
      throw new Error('attrs unavailable');
    },
  });

  assert.equal(render({ tag: 'div', attrs: hostileAttrs, children: 'Ready' }), '<div>Ready</div>');

  const partiallyHostileAttrs = { class: 'ok' };
  Object.defineProperty(partiallyHostileAttrs, 'id', {
    enumerable: true,
    get() {
      throw new Error('id unavailable');
    },
  });

  assert.equal(
    render({ tag: 'div', attrs: partiallyHostileAttrs, children: 'Ready' }),
    '<div class="ok">Ready</div>'
  );
});

test('render tolerates hostile virtual node fields and child arrays', () => {
  const hostileNode = {};
  Object.defineProperties(hostileNode, {
    attrs: {
      get() {
        throw new Error('attrs unavailable');
      },
    },
    children: {
      get() {
        throw new Error('children unavailable');
      },
    },
    tag: {
      get() {
        throw new Error('tag unavailable');
      },
    },
  });

  assert.equal(render(hostileNode), '');

  const hostileChildren = new Proxy(['First'], {
    get(target, property, receiver) {
      if (property === '1') {
        throw new Error('child unavailable');
      }
      if (property === 'length') {
        return 2;
      }
      return Reflect.get(target, property, receiver);
    },
  });

  assert.equal(
    render({ tag: 'div', attrs: { class: 'children' }, children: hostileChildren }),
    '<div class="children">First</div>'
  );
});

test('render emits standard void elements without closing tags', () => {
  assert.equal(
    render([
      tags.br(),
      tags.img({ alt: 'Logo', src: '/logo.png' }),
    ]),
    '<br><img alt="Logo" src="/logo.png">'
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

test('renderFragment tolerates hostile fragment attribute bags without target override', () => {
  const hostileAttributes = new Proxy({}, {
    ownKeys() {
      throw new Error('fragment keys unavailable');
    },
  });

  assert.equal(
    renderFragment('#target(innerHTML)', '<strong>Ready</strong>', hostileAttributes),
    '<fragment target="#target(innerHTML)"><strong>Ready</strong></fragment>'
  );

  const partiallyHostileAttributes = { timer: '5000' };
  Object.defineProperty(partiallyHostileAttributes, 'target', {
    enumerable: true,
    get() {
      throw new Error('target unavailable');
    },
  });
  Object.defineProperty(partiallyHostileAttributes, 'status', {
    enumerable: true,
    get() {
      throw new Error('status unavailable');
    },
  });

  assert.equal(
    renderFragment('#target(innerHTML)', '<strong>Ready</strong>', partiallyHostileAttributes),
    '<fragment timer="5000" target="#target(innerHTML)"><strong>Ready</strong></fragment>'
  );
});
