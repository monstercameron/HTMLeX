import { hooks, initHTMLeX } from './htmlex.js';

const lifecycleMarkers = {
  'todo:create:before': 'beforeTodoCreate',
  'todo:create:after': 'afterTodoCreate',
  'todo:create:before-swap': 'beforeTodoSwap',
  'todo:create:after-swap': 'afterTodoSwap',
  'chat:send:before': 'beforeChatSend',
  'chat:send:after': 'afterChatSend'
};

for (const [name, marker] of Object.entries(lifecycleMarkers)) {
  hooks.register(name, () => {
    window.__htmlexLifecycle = marker;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initHTMLeX();
});
