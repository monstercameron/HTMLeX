import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from '../../src/components/HTMLeX.js';
import {
  Aside,
  Canvas,
  DEMO_SNIPPETS,
  DemoActions,
  DemoItem,
  DemoList,
  Footer,
  FullHTML,
  Header,
  ChatInterfaceDemo,
  ClickCounterWidget,
  HoverTriggerDemo,
  HtmlSnippet,
  InfiniteScrollDemo,
  NotificationsDemo,
  PollingDemo,
  SSESubscribersDemo,
  SequentialDemo,
  SignalChainingDemo,
  WebSocketUpdatesDemo,
  loadingStateDemo,
  multiFragmentDemo,
  renderCounter,
  renderDefaultIndexPage,
  renderEditForm,
  renderLoadingMessage,
  renderNotificationMessage,
  renderTodoList,
  renderTodoItems,
  TodoWidget
} from '../../src/components/Components.js';

const sampleDemo = {
  icon: 'T',
  title: 'Test Demo',
  subtitle: 'Unit surface',
  description: 'Exercises component composition',
  highlights: ['GET', 'Fragments'],
  launchButtonText: 'Launch',
  learnMoreText: 'Docs',
  learnMoreHref: 'https://example.test/docs',
  initDemoHref: '/test/init',
};

function valueWithThrowingString() {
  return {
    toString() {
      throw new Error('string unavailable');
    },
  };
}

function arrayWithHostileSlot(firstItem) {
  return new Proxy([firstItem], {
    get(target, property, receiver) {
      if (property === 'length') return 2;
      if (property === '1') {
        throw new Error('array slot unavailable');
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

test('todo list escapes persisted todo text', () => {
  const html = render(renderTodoList([
    { id: 1, text: '<img src=x onerror="globalThis.__xss=1">' }
  ]));

  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /&lt;img src=x/);
});

test('todo edit form escapes todo text inside value attributes', () => {
  const html = renderEditForm({
    id: 1,
    text: '" autofocus onfocus="globalThis.__xss=1'
  });

  assert.match(html, /value="&quot; autofocus onfocus=&quot;globalThis.__xss=1"/);
  assert.doesNotMatch(html, /onfocus="globalThis/);
});

test('todo widget targets the todo list wrapper instead of nesting duplicate lists', () => {
  const html = TodoWidget([{ id: 1, text: 'Buy milk' }]);

  assert.match(html, /target="#todoList\(outerHTML\)"/);
});

test('demo snippet panels render escaped HTML examples', () => {
  const html = render(HtmlSnippet({ snippet: DEMO_SNIPPETS.todo }));

  assert.match(html, /HTML pattern/);
  assert.match(html, /&lt;form POST=&quot;\/todos\/create&quot;/);
  assert.doesNotMatch(html, /<form POST="\/todos\/create"/);
});

test('todo widget includes the feature HTML snippet inside the demo area', () => {
  const html = TodoWidget([]);

  assert.match(html, /snippet-panel/);
  assert.match(html, /&lt;input id=&quot;todoInput&quot;/);
});

test('layout components compose the Bootstrap shell and catalog actions', () => {
  const html = render([
    Header({ title: 'HTMLeX', subtitle: 'Server UI', className: 'unit-header' }),
    DemoItem(sampleDemo),
    DemoList([sampleDemo]),
    Aside({ demos: [sampleDemo], asideClass: 'unit-aside' }),
    Canvas({ headerText: 'Canvas', clickCount: 7, sectionClass: 'unit-canvas' }),
    Footer({
      year: 2026,
      copyText: 'HTMLeX',
      projectLinks: [{ href: '/source', icon: '#', text: 'Source' }],
      footerClass: 'unit-footer',
    }),
  ]);

  assert.match(html, /unit-header/);
  assert.match(html, /GET="\/test\/init"/);
  assert.match(html, /catalog-list/);
  assert.match(html, /unit-aside/);
  assert.match(html, /id="clickCount"[^>]*>7</);
  assert.match(html, /Copyright 2026 HTMLeX/);
});

test('full document and utility renderers expose expected HTML contracts', () => {
  const documentHtml = render(FullHTML({
    headerProps: { title: 'HTMLeX', subtitle: 'Testing' },
    demos: [sampleDemo],
    canvasProps: { headerText: 'Workspace' },
    footerProps: {
      year: 2026,
      copyText: 'HTMLeX',
      projectLinks: [{ href: '/docs', icon: '?', text: 'Docs' }],
    },
  }));

  assert.match(documentHtml, /^<html lang="en" data-bs-theme="dark">/);
  assert.match(documentHtml, /bootstrap@5\.3\.8/);
  assert.match(documentHtml, /\/socket\.io\/socket\.io\.js/);
  assert.equal(renderCounter(3), 'Counter: 3');
  assert.match(renderLoadingMessage('Loading'), /aria-hidden="true"/);
  assert.match(renderNotificationMessage('Done'), /target="this\(remove\)"/);
  assert.match(renderDefaultIndexPage(), /default-index-page/);
  assert.match(renderTodoItems([{ id: 9, text: 'Nine' }]), /todo-9/);
});

test('demo widgets expose their expected HTMLeX declarative attributes', () => {
  const html = [
    NotificationsDemo(),
    ClickCounterWidget(),
    ChatInterfaceDemo(),
    multiFragmentDemo(),
    SignalChainingDemo(),
    SSESubscribersDemo(),
    WebSocketUpdatesDemo(),
    InfiniteScrollDemo(),
    PollingDemo(),
    HoverTriggerDemo(),
    SequentialDemo(),
    loadingStateDemo(),
  ].map(component => typeof component === 'string' ? component : render(component)).join('\n');

  assert.match(html, /GET="\/notifications"/);
  assert.match(html, /POST="\/chat\/send"/);
  assert.match(html, /socket="\/updates"/);
  assert.match(html, /subscribe="sseUpdate"/);
  assert.match(html, /publish="chain1"/);
  assert.match(html, /poll="1000"/);
  assert.match(html, /trigger="mouseenter"/);
  assert.match(html, /sequential="2500"/);
  assert.match(html, /GET="\/demo\/loading"/);
  assert.match(html, /target="#loadingDemoOutput\(innerHTML\)"/);
});

test('layout and demo helpers tolerate missing props, hostile arrays, and hostile getters', () => {
  const hostileClass = valueWithThrowingString();
  const hostileDemo = {
    icon: '!',
    title: 'Hostile Demo',
    subtitle: 'Still renders',
    get description() {
      throw new Error('description unavailable');
    },
    highlights: arrayWithHostileSlot('Safe highlight'),
    launchButtonText: 'Launch',
    learnMoreText: 'Docs',
    learnMoreHref: '/docs',
    initDemoHref: '/demo/init',
  };
  const hostileHeaderProps = {};
  Object.defineProperty(hostileHeaderProps, 'title', {
    enumerable: true,
    get() {
      throw new Error('title unavailable');
    },
  });

  const html = render([
    HtmlSnippet(),
    DemoActions(),
    DemoItem(hostileDemo),
    DemoList(arrayWithHostileSlot(hostileDemo)),
    Aside({ demos: arrayWithHostileSlot(hostileDemo), asideClass: hostileClass }),
    Canvas({ headerText: 'Canvas', clickCount: hostileClass, sectionClass: hostileClass }),
    Footer({
      year: hostileClass,
      copyText: hostileClass,
      projectLinks: arrayWithHostileSlot({ href: '/docs', icon: '?', text: 'Docs' }),
      footerClass: hostileClass,
    }),
    FullHTML({
      headerProps: hostileHeaderProps,
      demos: arrayWithHostileSlot(hostileDemo),
      canvasProps: { clickCount: hostileClass },
      footerProps: { projectLinks: arrayWithHostileSlot({ href: '/docs', icon: '?', text: 'Docs' }) },
    }),
  ]);

  assert.match(html, /HTML pattern/);
  assert.match(html, /Hostile Demo/);
  assert.match(html, /Safe highlight/);
  assert.match(html, /GET="\/demo\/init"/);
  assert.match(html, /catalog-list/);
  assert.match(html, /Copyright/);
  assert.match(html, /^<div class="snippet-panel|[\s\S]*<html lang="en"/);
});

test('todo and utility renderers tolerate malformed data without throwing', () => {
  const hostileText = valueWithThrowingString();
  const hostileTodo = {
    id: 9,
    get text() {
      throw new Error('todo text unavailable');
    },
  };
  const hostileTodos = arrayWithHostileSlot(hostileTodo);

  assert.match(render(renderTodoList(undefined)), /No todos available/);
  assert.match(render(renderTodoList(hostileTodos)), /id="todo-9"/);
  assert.match(renderTodoItems(hostileTodos), /id="todo-9"/);
  assert.equal(renderTodoItems(undefined), '');
  assert.match(renderEditForm({ id: hostileText, text: hostileText }), /id="editForm-"/);
  assert.equal(renderCounter(hostileText), 'Counter: ');
});
