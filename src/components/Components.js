/**
 * @fileoverview Components for HTMLeX responses built with the HTMLeX JavaScript API.
 */

import { tags, render } from './HTMLeX.js';

const {
  html,
  head,
  meta,
  title,
  script,
  body,
  div,
  main,
  header,
  h1,
  h2,
  h3,
  p,
  aside,
  ul,
  li,
  span,
  button,
  a,
  section,
  footer,
  input,
  label,
  form,
  pre,
  code,
  small
} = tags;

const APP_BG = 'app-root';
const PANE = 'app-pane';
const WIDGET = 'widget';
const WIDGET_TITLE = 'widget-title';
const MUTED_TEXT = 'muted-copy';
const FIELD = 'form-control';
const PRIMARY_BUTTON = 'btn btn-primary';
const SECONDARY_BUTTON = 'btn btn-outline-light';
const DANGER_BUTTON = 'btn btn-outline-danger';

export const DEMO_SNIPPETS = {
  todo: `<form POST="/todos/create" target="#todoList(outerHTML)" publish="todoCreated" sequential="150">
  <input id="todoInput" name="todo" required>
  <button type="submit">Add Todo</button>
</form>
<div id="todoList"></div>`,
  infiniteScroll: `<div id="infiniteList">
  <button GET="/items/loadMore" target="#infiniteList(append)">
    Load More
  </button>
</div>`,
  notifications: `<button GET="/notifications" target="#notificationArea(innerHTML)">
  Get Notification
</button>
<div id="notificationArea" timer="5000"></div>`,
  clickCounter: `<div id="counterDisplay">0</div>
<button GET="/counter/increment" trigger="click" target="#counterDisplay(innerHTML)">
  Click Me
</button>`,
  chat: `<div id="chatMessages" socket="/chat" target="#chatMessages(innerHTML)"></div>
<form POST="/chat/send" target="#chatMessages(innerHTML)" extras="username=DemoUser">
  <input name="message" required>
  <button type="submit">Send</button>
</form>`,
  multiFragment: `<button GET="/multi/fragment" target="#multiUpdate1(innerHTML) #multiUpdate2(append)">
  Load Multi-Fragment Update
</button>
<div id="multiUpdate1"></div>
<div id="multiUpdate2"></div>`,
  signalChaining: `<button publish="chain1">Start Process</button>
<div subscribe="chain1" trigger="signal" GET="/process/step1" target="#chainOutput(append)" publish="chain2"></div>
<div subscribe="chain2" trigger="signal" GET="/process/step2" target="#chainOutput(append)"></div>`,
  sse: `<button GET="/sse/subscribe">Get SSE Signal</button>
<div subscribe="sseUpdate" GET="/sse/subscribe/message" target="this(innerHTML)">
  SSE updates will appear here...
</div>`,
  websocketUpdates: `<div id="liveFeed" socket="/updates" target="#liveFeed(innerHTML)">
  Connecting to live feed...
</div>`,
  sequential: `<button GET="/sequential/next" target="#sequentialOutput(append)" sequential="2500">
  Run Sequential
</button>
<div id="sequentialOutput"></div>`,
  loading: `<button GET="/demo/loading" target="#loadingDemoOutput(innerHTML)">
  Load Payload
</button>
<div id="loadingDemoOutput"></div>`,
  polling: `<div id="pollingOutput" GET="/polling/tick" target="#pollingOutput(innerHTML)" poll="1000" repeat="3" auto="true">
  Waiting for polling update...
</div>`,
  hover: `<button GET="/hover/message" trigger="mouseenter" target="#hoverOutput(innerHTML)" debounce="250">
  Hover Action
</button>
<div id="hoverOutput"></div>`
};

export function HtmlSnippet({ title: snippetTitle = 'HTML pattern', snippet }) {
  return div(
    { class: 'snippet-panel mt-4 p-3' },
    div(
      { class: 'd-flex align-items-center justify-content-between gap-3 mb-3' },
      h3({ class: 'h6 mb-0' }, snippetTitle),
      span({ class: 'badge rounded-pill text-bg-secondary' }, 'HTML')
    ),
    pre({}, code({}, snippet.trim()))
  );
}

/* ===========================
   Header Component
   =========================== */

export function Header({ title, subtitle = '', className = '' } = {}) {
  return header(
    { class: `app-header border-bottom ${className}` },
    div(
      { class: 'container-fluid d-flex flex-wrap align-items-center justify-content-between gap-3 py-3' },
      div(
        {},
        p({ class: 'small fw-semibold text-uppercase text-primary mb-1' }, 'Server-driven UI lab'),
        h1({ class: 'h4 mb-0' }, title),
        ...(subtitle ? [p({ class: `small ${MUTED_TEXT} mt-1 mb-0` }, subtitle)] : [])
      ),
      div(
        { class: 'd-none d-sm-flex align-items-center gap-2 small text-subtle' },
        span({ class: 'demo-chip' }, 'HTTPS'),
        span({ class: 'demo-chip' }, 'Fragments'),
        span({ class: 'demo-chip' }, 'Socket.IO')
      )
    )
  );
}

/* ===========================
   Demo Atomic Components
   =========================== */

export function DemoBackground() {
  return [];
}

export function DemoHeader({ icon, title: demoTitle, subtitle }) {
  return div(
    { class: 'd-flex align-items-start gap-3' },
    div(
      { class: 'demo-icon d-flex align-items-center justify-content-center flex-shrink-0' },
      icon
    ),
    div(
      { class: 'min-w-0' },
      h2({ class: 'h6 mb-1' }, demoTitle),
      small({ class: 'text-subtle' }, subtitle)
    )
  );
}

export function DemoDescription(description) {
  return p({ class: `small ${MUTED_TEXT} mb-0` }, description);
}

export function DemoHighlights(highlights) {
  return div(
    { class: 'd-flex flex-wrap gap-2' },
    ...highlights.map(highlight => span({ class: 'demo-chip' }, highlight))
  );
}

export function DemoActions(
  { launchButtonText, learnMoreText, learnMoreHref, initDemoHref }
) {
  return div(
    { class: 'd-flex align-items-center justify-content-between gap-3 pt-1' },
    button(
      {
        class: `${PRIMARY_BUTTON} btn-sm`,
        GET: initDemoHref
      },
      launchButtonText
    ),
    a(
      { href: learnMoreHref, class: 'small text-subtle text-decoration-none' },
      learnMoreText
    )
  );
}

/* ===========================
   Composite Demo Components
   =========================== */

export function DemoItem(demo) {
  return li(
    { class: 'demo-card' },
    div(
      { class: 'd-grid gap-3' },
      DemoHeader({
        icon: demo.icon,
        title: demo.title,
        subtitle: demo.subtitle
      }),
      DemoDescription(demo.description),
      DemoHighlights(demo.highlights),
      DemoActions(
        {
          launchButtonText: demo.launchButtonText,
          learnMoreText: demo.learnMoreText,
          learnMoreHref: demo.learnMoreHref,
          initDemoHref: demo.initDemoHref
        }
      )
    )
  );
}

export function DemoList(demos) {
  const items = demos.map((demo) => DemoItem(demo));
  return ul({ class: 'catalog-list list-unstyled mb-0 d-grid gap-3' }, ...items);
}

export function Aside({ demos, asideClass = '' } = {}) {
  return aside(
    { class: `catalog-pane ${PANE} ${asideClass}` },
    div(
      { class: 'pane-header d-flex align-items-end justify-content-between gap-3' },
      div(
        {},
        p({ class: 'small text-uppercase text-subtle mb-1' }, 'Catalog'),
        h2({ class: 'h6 mb-0' }, 'Demos')
      ),
      span({ class: 'badge rounded-pill text-bg-primary' }, 'Live')
    ),
    DemoList(demos)
  );
}

/* ===========================
   Canvas Component
   =========================== */

export function Canvas({ headerText, clickCount = 0, sectionClass = '' } = {}) {
  return section(
    { class: `workspace-pane ${PANE} ${sectionClass}` },
    div(
      { class: 'pane-header d-flex flex-wrap align-items-center justify-content-between gap-3' },
      div(
        {},
        p({ class: 'small text-uppercase text-subtle mb-1' }, 'Workspace'),
        h2({ class: 'h6 mb-0' }, headerText)
      ),
      span({ class: 'small text-subtle' }, 'Interactive canvas')
    ),
    div(
      { class: 'workspace-scroll' },
      div(
        { id: 'clicker', class: 'workspace-empty d-flex flex-column align-items-center justify-content-center text-center p-4' },
        p(
          { id: 'clickCount', class: 'display-4 fw-semibold mb-4' },
          String(clickCount)
        ),
        button(
          { id: 'clickButton', class: PRIMARY_BUTTON },
          'Click me!'
        )
      )
    )
  );
}

/* ===========================
   Footer Component
   =========================== */

export function Footer({ year, copyText, projectLinks, footerClass = '' } = {}) {
  const links = projectLinks.map((projectLink) =>
    a(
      { href: projectLink.href, class: 'd-inline-flex align-items-center text-decoration-none' },
      span({ class: 'me-1' }, projectLink.icon),
      projectLink.text
    )
  );

  return footer(
    { class: `app-footer border-top ${footerClass}` },
    div(
      { class: 'container-fluid d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2 py-3 small text-subtle' },
      p({ class: 'mb-0' }, `Copyright ${year} ${copyText}`),
      div({ class: 'd-flex gap-3' }, ...links)
    )
  );
}

/* ===========================
   Full HTML Document Composition
   =========================== */

export function FullHTML({ headerProps, demos, canvasProps, footerProps }) {
  return html(
    { lang: 'en', 'data-bs-theme': 'dark' },
    head(
      {},
      meta({ charset: 'UTF-8' }),
      meta({ name: 'viewport', content: 'width=device-width, initial-scale=1.0' }),
      title({}, 'HTMLeX playgrounds'),
      tags.link({
        href: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css',
        rel: 'stylesheet',
        integrity: 'sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB',
        crossorigin: 'anonymous'
      }),
      tags.link({ href: './styles.css', rel: 'stylesheet' }),
      script({ src: '/socket.io/socket.io.js' })
    ),
    body(
      { class: APP_BG },
      Header(headerProps),
      main(
        { class: 'app-shell container-fluid' },
        Aside({ demos }),
        Canvas(canvasProps)
      ),
      Footer(footerProps),
      script({
        src: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js',
        integrity: 'sha384-FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI',
        crossorigin: 'anonymous'
      }),
      script({ type: 'module', src: './src/main.js' })
    )
  );
}

/* ===========================
   Todo Components
   =========================== */

export function renderTodoItem(todo) {
  const editButton = button(
    {
      GET: `/todos/edit/${todo.id}`,
      class: `edit-button ${SECONDARY_BUTTON} btn-sm`
    },
    'Edit'
  );

  const deleteButton = button(
    {
      DELETE: `/todos/${todo.id}`,
      class: `delete-button ${DANGER_BUTTON} btn-sm`
    },
    'Delete'
  );

  const actionsDiv = div(
    { class: 'todo-actions d-flex flex-wrap gap-2' },
    editButton,
    deleteButton
  );

  const todoText = span(
    { class: 'todo-text flex-grow-1 fw-medium' },
    todo.text
  );

  return div(
    {
      id: `todo-${todo.id}`,
      class: 'todo-item surface-muted d-flex align-items-center justify-content-between gap-3 p-3 mb-2'
    },
    todoText,
    actionsDiv
  );
}

export function renderTodoList(todos) {
  if (!todos.length) {
    return div(
      { id: 'todoList', class: 'no-todos workspace-empty d-flex align-items-center justify-content-center text-center p-4 small text-subtle' },
      'No todos available.'
    );
  }

  const todoNodes = todos.map(todo => renderTodoItem(todo));

  return div(
    { id: 'todoList', class: 'todo-list surface p-3' },
    ...todoNodes
  );
}

export function renderTodoItems(todos) {
  return todos.map(todo => render(renderTodoItem(todo))).join('');
}

export function renderEditForm(todo) {
  const inputField = input({
    type: 'text',
    name: 'todo',
    value: todo.text,
    required: 'true',
    class: `edit-input ${FIELD}`
  });

  const saveButton = button(
    { type: 'submit', class: `save-button ${PRIMARY_BUTTON} btn-sm` },
    'Save'
  );

  const cancelButton = button(
    {
      GET: `/todos/item/${todo.id}`,
      class: `cancel-button ${DANGER_BUTTON} btn-sm`,
      target: `#editForm-${todo.id}(outerHTML)`,
      type: 'button'
    },
    'Cancel'
  );

  const editForm = form(
    {
      id: `editForm-${todo.id}`,
      class: 'edit-form surface p-3',
      PUT: `/todos/${todo.id}`,
      target: `#todo-${todo.id}(innerHTML)`
    },
    div({ class: 'mb-3' }, inputField),
    div({ class: 'd-flex flex-wrap gap-2' }, saveButton, cancelButton)
  );

  return render(editForm);
}

export function TodoWidget(todos) {
  return render(
    section(
      { id: 'todoApp', class: WIDGET },
      h2({ class: WIDGET_TITLE }, 'Todo App with Lifecycle Hooks'),
      form(
        {
          POST: '/todos/create',
          target: '#todoList(outerHTML)',
          extras: 'locale=en_US',
          publish: 'todoCreated',
          sequential: '150',
          onbefore: 'todo:create:before',
          onafter: 'todo:create:after',
          onbeforeSwap: 'todo:create:before-swap',
          onafterSwap: 'todo:create:after-swap',
          class: 'mb-4'
        },
        div(
          { class: 'mb-3' },
          label(
            { for: 'todoInput', class: 'form-label small fw-semibold text-uppercase text-subtle' },
            'New Todo'
          ),
          input({
            type: 'text',
            id: 'todoInput',
            name: 'todo',
            required: 'true',
            class: FIELD,
            placeholder: 'Enter your task'
          })
        ),
        button(
          {
            type: 'submit',
            class: `w-100 ${PRIMARY_BUTTON}`
          },
          'Add Todo'
        )
      ),
      renderTodoList(todos),
      HtmlSnippet({ snippet: DEMO_SNIPPETS.todo })
    )
  );
}

/* ===========================
   Utility Renderers
   =========================== */

export function renderCounter(counter) {
  return `Counter: ${counter}`;
}

export function renderLoadingMessage(message) {
  return render(
    div(
      { class: 'loading-message' },
      span({ class: 'spinner', 'aria-hidden': 'true' }),
      message
    )
  );
}

export function renderNotificationMessage(message) {
  return render(
    div({ class: 'notification-message', timer: '5000', target: 'this(remove)' }, message)
  );
}

export function renderDefaultIndexPage() {
  return render(
    div(
      { class: 'default-index-page' },
      h1({}, 'Welcome to the Default Index Page'),
      p({}, 'No custom index.html was found. This default page has been generated automatically.')
    )
  );
}

/* ===========================
   Demo Widgets
   =========================== */

export function NotificationsDemo(message = 'Waiting...') {
  return section(
    { id: 'notifications', class: WIDGET },
    h2({ class: WIDGET_TITLE }, 'Notifications'),
    button(
      {
        GET: '/notifications',
        target: '#notificationArea(innerHTML)',
        class: PRIMARY_BUTTON
      },
      'Get Notification'
    ),
    div(
      { id: 'notificationArea', class: 'surface mt-4 p-3 small muted-copy' },
      message
    ),
    HtmlSnippet({ snippet: DEMO_SNIPPETS.notifications })
  );
}

export function ClickCounterWidget() {
  return render(
    section(
      { id: 'clickCounter', class: WIDGET },
      h2({ class: WIDGET_TITLE }, 'Clicker Counter'),
      div(
        { id: 'counterDisplay', class: 'counter-display surface d-flex align-items-center justify-content-center text-center p-4' },
        '0'
      ),
      div(
        { class: 'mt-4 text-center' },
        button(
          {
            GET: '/counter/increment',
            trigger: 'click',
            target: '#counterDisplay(innerHTML)',
            class: PRIMARY_BUTTON
          },
          'Click Me!'
        )
      ),
      HtmlSnippet({ snippet: DEMO_SNIPPETS.clickCounter })
    )
  );
}

export function ChatInterfaceDemo() {
  return section(
    { id: 'chatInterface', class: WIDGET },
    h2({ class: WIDGET_TITLE }, 'Chat Interface'),
    div(
      {
        id: 'chatMessages',
        socket: '/chat',
        target: '#chatMessages(innerHTML)',
        class: 'surface scroll-panel mb-4 p-3'
      },
      p({ class: 'text-center small text-subtle mb-0' }, 'Waiting for messages...')
    ),
    form(
      {
        POST: '/chat/send',
        target: '#chatMessages(innerHTML)',
        extras: 'username=DemoUser',
        onbefore: 'chat:send:before',
        onafter: 'chat:send:after',
        class: 'd-flex flex-column flex-sm-row gap-2'
      },
      input({
        type: 'text',
        name: 'message',
        required: 'true',
        placeholder: 'Type your message',
        class: `flex-grow-1 ${FIELD}`
      }),
      button(
        { type: 'submit', class: PRIMARY_BUTTON },
        'Send'
      )
    ),
    HtmlSnippet({ snippet: DEMO_SNIPPETS.chat })
  );
}

export function multiFragmentDemo() {
  return section(
    { id: 'multiFragment', class: WIDGET },
    h2({ class: WIDGET_TITLE }, 'Multi-Fragment Updates'),
    button(
      {
        GET: '/multi/fragment',
        target: '#multiUpdate1(innerHTML) #multiUpdate2(append)',
        class: PRIMARY_BUTTON
      },
      'Load Multi-Fragment Update'
    ),
    div(
      { class: 'mt-4 d-grid gap-3' },
      div({ id: 'multiUpdate1', class: 'surface p-3 small muted-copy' }),
      div({ id: 'multiUpdate2', class: 'surface p-3 small muted-copy' })
    ),
    HtmlSnippet({ snippet: DEMO_SNIPPETS.multiFragment })
  );
}

export function SignalChainingDemo() {
  return section(
    { id: 'signalChaining', class: WIDGET },
    h2({ class: WIDGET_TITLE }, 'Signal Chaining'),
    div(
      { class: 'd-grid gap-3' },
      button(
        { publish: 'chain1', class: PRIMARY_BUTTON },
        'Start Process'
      ),
      div(
        { class: 'd-none' },
        div({ subscribe: 'chain1', trigger: 'signal', GET: '/process/step1', target: '#chainOutput(append)', publish: 'chain2' }),
        div({ subscribe: 'chain2', trigger: 'signal', GET: '/process/step2', target: '#chainOutput(append)', publish: 'chain3' }),
        div({ subscribe: 'chain3', trigger: 'signal', GET: '/process/step3', target: '#chainOutput(append)', publish: 'chain4' }),
        div({ subscribe: 'chain4', trigger: 'signal', GET: '/process/step4', target: '#chainOutput(append)', publish: 'chain5' }),
        div({ subscribe: 'chain5', trigger: 'signal', GET: '/process/step5', target: '#chainOutput(append)' })
      ),
      div(
        { id: 'chainOutput', class: 'surface output-panel p-3 small muted-copy' }
      )
    ),
    HtmlSnippet({ snippet: DEMO_SNIPPETS.signalChaining })
  );
}

export function SSESubscribersDemo() {
  return section(
    { id: 'sseDemo', class: WIDGET },
    h2({ class: WIDGET_TITLE }, 'SSE Subscriber (Simulated)'),
    button(
      { GET: '/sse/subscribe', class: PRIMARY_BUTTON },
      'Get SSE Signal'
    ),
    div(
      {
        subscribe: 'sseUpdate',
        GET: '/sse/subscribe/message',
        target: 'this(innerHTML)',
        class: 'surface mt-4 p-3 small muted-copy'
      },
      'SSE updates will appear here...'
    ),
    HtmlSnippet({ snippet: DEMO_SNIPPETS.sse })
  );
}

export function WebSocketUpdatesDemo() {
  return section(
    { id: 'websocketUpdates', class: WIDGET },
    h2({ class: WIDGET_TITLE }, 'Live WebSocket Feed'),
    div(
      {
        id: 'liveFeed',
        socket: '/updates',
        target: '#liveFeed(innerHTML)',
        class: 'surface scroll-panel p-3 small muted-copy'
      },
      p(
        { class: 'text-center text-subtle mb-0' },
        'Connecting to live feed...'
      )
    ),
    HtmlSnippet({ snippet: DEMO_SNIPPETS.websocketUpdates })
  );
}

export function InfiniteScrollDemo() {
  return render(
    section(
      { id: 'infiniteScrollDemo', class: WIDGET },
      h2({ class: WIDGET_TITLE }, 'Infinite Scrolling List'),
      div(
        { id: 'infiniteList', class: 'surface d-grid gap-2 p-3' },
        div({ class: 'surface-muted p-3 small' }, 'Initial item')
      ),
      button(
        {
          GET: '/items/loadMore',
          target: '#infiniteList(append)',
          class: `mt-4 ${PRIMARY_BUTTON}`
        },
        'Load More'
      ),
      HtmlSnippet({ snippet: DEMO_SNIPPETS.infiniteScroll })
    )
  );
}

export function PollingDemo() {
  return render(
    section(
      { id: 'pollingDemo', class: WIDGET },
      h2({ class: WIDGET_TITLE }, 'Polling Demo'),
      div(
        {
          id: 'pollingOutput',
          GET: '/polling/tick',
          target: '#pollingOutput(innerHTML)',
          poll: '1000',
          repeat: '3',
          auto: 'true',
          class: 'surface mt-4 p-3 small muted-copy'
        },
        'Waiting for polling update...'
      ),
      HtmlSnippet({ snippet: DEMO_SNIPPETS.polling })
    )
  );
}

export function HoverTriggerDemo() {
  return render(
    section(
      { id: 'hoverTriggerDemo', class: WIDGET },
      h2({ class: WIDGET_TITLE }, 'Hover Trigger Demo'),
      button(
        {
          GET: '/hover/message',
          trigger: 'mouseenter',
          target: '#hoverOutput(innerHTML)',
          debounce: '250',
          class: PRIMARY_BUTTON
        },
        'Hover Action'
      ),
      div({ id: 'hoverOutput', class: 'surface mt-4 p-3 small muted-copy' }, 'Waiting for hover...'),
      HtmlSnippet({ snippet: DEMO_SNIPPETS.hover })
    )
  );
}

export function SequentialDemo() {
  return render(
    section(
      { id: 'sequentialDemo', class: WIDGET },
      h2({ class: WIDGET_TITLE }, 'Sequential API Calls'),
      div(
        { class: 'd-flex flex-column flex-sm-row gap-2' },
        button(
          {
            GET: '/sequential/next',
            target: '#sequentialOutput(append)',
            sequential: '2500',
            class: PRIMARY_BUTTON
          },
          'Sequential, First In First Out'
        ),
        button(
          {
            GET: '/sequential/next',
            target: '#sequentialOutput(append)',
            debounce: '500',
            class: SECONDARY_BUTTON
          },
          'Non Sequential Last In Last Out'
        )
      ),
      div(
        {
          id: 'sequentialOutput',
          class: 'surface output-panel mt-4 p-3 small muted-copy'
        },
        'Sequential responses will be queued and rendered here'
      ),
      HtmlSnippet({ snippet: DEMO_SNIPPETS.sequential })
    )
  );
}

export function loadingStateDemo() {
  return section(
    { id: 'loadingDemo', class: WIDGET },
    h2({ class: WIDGET_TITLE }, 'Loading State Demo'),
    button(
      {
        GET: '/demo/loading',
        target: '#loadingDemoOutput(innerHTML)',
        class: PRIMARY_BUTTON
      },
      'Load Payload'
    ),
    div(
      { id: 'loadingDemoOutput', class: 'surface output-panel mt-4 p-3 small muted-copy' }
    ),
    HtmlSnippet({ snippet: DEMO_SNIPPETS.loading })
  );
}
