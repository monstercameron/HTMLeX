import assert from 'node:assert/strict';
import test from 'node:test';
import { render } from '../../src/components/HTMLeX.js';
import {
  DEMO_SNIPPETS,
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
  renderEditForm,
  renderTodoList,
  TodoWidget
} from '../../src/components/Components.js';

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
