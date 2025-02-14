// ./src/app.js

import express from 'express';
import createHttp2Express from 'http2-express-bridge';
import path from 'path';
import fs from 'fs';
import http2 from 'http2';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { Server as SocketIOServer } from 'socket.io';
import {
  renderTodoItem,
  renderTodoList,
  renderEditForm,
  renderCounter,
  renderFragment,
  renderLoadingMessage,
  renderNotificationMessage,
  renderSequentialStep,
  renderChatMessage,
  renderDefaultIndexPage
} from './components.js';
import { render } from './HTMLeX.js';

// Global error handling
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

// Create an Express app using the HTTP/2 bridge.
const app = createHttp2Express(express);
const PORT = process.env.PORT || 5500;

// Get __dirname in ES modules.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from the "public" directory.
app.use(express.static(path.join(__dirname, 'public')));

// Default root route to serve an index page.
app.get('/', async (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  try {
    await fs.promises.access(indexPath);
    return res.sendFile(indexPath);
  } catch (err) {
    return res.send(renderDefaultIndexPage());
  }
});

// Configure multer for form data processing.
const upload = multer();

// Path to the data file storing todos.
const dataPath = path.join(__dirname, 'data.json');

// Ensure data.json exists asynchronously.
(async () => {
  try {
    await fs.promises.access(dataPath);
  } catch (err) {
    console.log('Data file not found, creating empty file');
    await fs.promises.writeFile(dataPath, JSON.stringify([], null, 2));
  }
})();

// Global counter for the clicker demo.
let clickerCounter = 0;

// In-memory chat message store.
let chatMessages = [];

/**
 * Asynchronously loads todos from the data file.
 * @returns {Promise<Array<Object>>} Array of todo objects.
 */
const loadTodos = async () => {
  try {
    await fs.promises.access(dataPath);
    const data = await fs.promises.readFile(dataPath, 'utf8');
    console.log('Loaded todos data:', data);
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('Data file not found, creating empty file');
      await fs.promises.writeFile(dataPath, JSON.stringify([], null, 2));
      return [];
    }
    console.error('Error loading todos:', err);
    return [];
  }
};

/**
 * Asynchronously writes the todos array to the data file.
 * @param {Array<Object>} todos - Array of todo objects.
 */
const writeTodos = async (todos) => {
  try {
    await fs.promises.writeFile(dataPath, JSON.stringify(todos, null, 2));
    console.log('Successfully wrote todos to file');
  } catch (err) {
    console.error('Error writing todos:', err);
    throw err;
  }
};

// ------------------------------
// Todo API Endpoints (Async)
// ------------------------------

// CREATE: Add a new todo
app.post('/todos/create', upload.none(), async (req, res) => {
  try {
    const todos = await loadTodos();
    const newText = Array.isArray(req.body.todo) ? req.body.todo[0] : req.body.todo;
    if (!newText) {
      console.error('Missing todo text in request');
      if (!res.headersSent) return res.status(400).send('Missing todo text');
    }
    const newTodo = { id: Date.now(), text: newText };
    todos.push(newTodo);
    await writeTodos(todos);
    const htmlSnippet = renderTodoList(todos);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderFragment('#todoList(innerHTML)', htmlSnippet));
  } catch (err) {
    console.error('Error in /todos/create endpoint:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
});

// READ: List all todos
app.get('/todos/list', async (req, res) => {
  console.log('GET /todos/list endpoint hit');
  try {
    const todos = await loadTodos();
    if (!Array.isArray(todos)) {
      console.error('Loaded todos is not an array:', todos);
      if (!res.headersSent)
        return res.status(500).send('Internal server error: Invalid todo data');
      return;
    }
    const htmlSnippet = renderTodoList(todos);
    if (!htmlSnippet) {
      console.error('Failed to render todo list');
      if (!res.headersSent)
        return res.status(500).send('Internal server error: Failed to render todos');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderFragment('#todoList(innerHTML)', htmlSnippet));
  } catch (err) {
    console.error('Error in /todos/list endpoint:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
});

// READ SINGLE: Return a single todo item
app.get('/todos/item/:id', async (req, res) => {
  try {
    const todos = await loadTodos();
    const id = parseInt(req.params.id, 10);
    const todo = todos.find(t => t.id === id);
    if (!todo) {
      console.error(`Todo with id ${id} not found`);
      if (!res.headersSent) return res.status(404).send('Todo not found');
      return;
    }
    const htmlSnippet = renderTodoItem(todo);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderFragment(`#editForm-${id}(innerHTML)`, htmlSnippet));
  } catch (err) {
    console.error('Error in /todos/item endpoint:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
});

// EDIT FORM: Return an edit form for a todo item
app.get('/todos/edit/:id', async (req, res) => {
  try {
    const todos = await loadTodos();
    const id = parseInt(req.params.id, 10);
    const todo = todos.find(t => t.id === id);
    if (!todo) {
      console.error(`Todo with id ${id} not found`);
      if (!res.headersSent) return res.status(404).send('Todo not found');
      return;
    }
    const htmlSnippet = renderEditForm(todo);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderFragment(`#todo-${id}(outerHTML)`, htmlSnippet));
  } catch (err) {
    console.error('Error in /todos/edit endpoint:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
});

// UPDATE: Update a todo (update a single todo item)
app.put('/todos/:id', upload.none(), async (req, res) => {
  try {
    const todos = await loadTodos();
    const id = parseInt(req.params.id, 10);
    const index = todos.findIndex(todo => todo.id === id);
    if (index === -1) {
      console.error(`Todo with id ${id} not found`);
      if (!res.headersSent) return res.status(404).send('Todo not found');
      return;
    }
    const newText = Array.isArray(req.body.todo) ? req.body.todo[0] : req.body.todo;
    if (!newText) {
      console.error('Missing updated todo text');
      if (!res.headersSent) return res.status(400).send('Missing updated todo text');
      return;
    }
    todos[index].text = newText;
    await writeTodos(todos);
    const updatedTodoItem = renderTodoItem(todos[index]);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderFragment(`#todo-${id}(innerHTML)`, updatedTodoItem));
  } catch (err) {
    console.error('Error in /todos/:id PUT endpoint:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
});

// DELETE: Remove a todo (refresh the entire list)
app.delete('/todos/:id', async (req, res) => {
  try {
    const todos = await loadTodos();
    const id = parseInt(req.params.id, 10);
    const index = todos.findIndex(todo => todo.id === id);
    if (index === -1) {
      console.error(`Todo with id ${id} not found`);
      if (!res.headersSent) return res.status(404).send('Todo not found');
      return;
    }
    todos.splice(index, 1);
    await writeTodos(todos);
    const updatedList = renderTodoList(todos);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderFragment('#todoList(innerHTML)', updatedList));
  } catch (err) {
    console.error('Error in /todos/:id DELETE endpoint:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
});

// ------------------------------
// Streaming Endpoints (HTTP/2)
// ------------------------------

app.get('/items/loadMore', async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    res.write(renderFragment('#infiniteList(append)', renderLoadingMessage("Loading more items...")));
    setTimeout(() => {
      try {
        let itemsHtml = "";
        for (let i = 0; i < 5; i++) {
          itemsHtml += render(`<div class="p-2 bg-gray-700 rounded-md text-gray-100">Item ${Date.now() + i}</div>`);
        }
        res.write(renderFragment('#infiniteList(append)', itemsHtml));
      } catch (innerErr) {
        console.error('Error while writing items in /items/loadMore:', innerErr);
      }
      if (!res.headersSent) res.end();
    }, 2000);
  } catch (err) {
    console.error('Error in /items/loadMore endpoint:', err);
    if (!res.headersSent) res.status(500).end();
  }
});

app.get('/notifications', async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    res.write(renderFragment('#notificationArea(innerHTML)', renderLoadingMessage("Fetching notification...")));
    setTimeout(() => {
      try {
        res.write(renderFragment('#notificationArea(innerHTML)', renderNotificationMessage("You have a new notification!"), { timer: "5000" }));
      } catch (innerErr) {
        console.error('Error while writing notification in /notifications:', innerErr);
      }
      if (!res.headersSent) res.end();
    }, 1500);
  } catch (err) {
    console.error('Error in /notifications endpoint:', err);
    if (!res.headersSent) res.status(500).end();
  }
});

app.get('/counter/increment', async (req, res) => {
  try {
    clickerCounter++;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderFragment('#counterDisplay(innerHTML)', renderCounter(clickerCounter)));
  } catch (err) {
    console.error('Error in /counter/increment endpoint:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
});

app.post('/chat/send', upload.none(), async (req, res) => {
  try {
    const message = req.body.message;
    if (!message) {
      if (!res.headersSent) return res.status(400).send('Missing chat message');
      return;
    }
    const newMessage = {
      id: Date.now(),
      username: req.body.username || 'Anonymous',
      text: message
    };
    chatMessages.push(newMessage);
    // Broadcast the new message via Socket.IO (namespace /chat)
    io.of('/chat').emit('chatMessage', newMessage);
    return res.status(204).end();
  } catch (err) {
    console.error('Error in /chat/send endpoint:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
});

app.get('/multi/fragment', async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    const fragments = [
      renderFragment('#multiUpdate1(innerHTML)', render(`<div class="p-4 bg-blue-700 rounded-md text-white">Primary Content Loaded</div>`)),
      renderFragment('#multiUpdate2(append)', render(`<div class="p-2 bg-blue-600 rounded-md text-white mt-2">Additional Content Appended</div>`))
    ];
    return res.send(fragments.join(''));
  } catch (err) {
    console.error('Error in /multi/fragment endpoint:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
});

let pollVal = 0;
app.get('/sequential/poll', async (req, res) => {
  setTimeout(() => {
    try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderFragment('this(innerHTML)', render(`${pollVal++}, \n`)));
    } catch (err) {
      console.error('Error in /sequential/poll endpoint:', err);
      if (!res.headersSent) res.status(500).send('Internal server error');
    }
  }, 1000);
});

app.get('/process/step1', async (req, res) => {
  setTimeout(() => {
    try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const message = `Step 1: Data received at ${new Date().toLocaleTimeString()}<br>`;
      res.send(renderFragment('this(append)', render(message)));
    } catch (err) {
      console.error('Error in /process/step1:', err);
      if (!res.headersSent) res.status(500).send('Internal server error');
    }
  }, 100);
});
app.get('/process/step2', async (req, res) => {
  setTimeout(() => {
    try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const message = `Step 2: Data received at ${new Date().toLocaleTimeString()}<br>`;
      res.send(renderFragment('this(append)', render(message)));
    } catch (err) {
      console.error('Error in /process/step2:', err);
      if (!res.headersSent) res.status(500).send('Internal server error');
    }
  }, 100);
});
app.get('/process/step3', async (req, res) => {
  setTimeout(() => {
    try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const message = `Step 3: Data received at ${new Date().toLocaleTimeString()}<br>`;
      res.send(renderFragment('this(append)', render(message)));
    } catch (err) {
      console.error('Error in /process/step3:', err);
      if (!res.headersSent) res.status(500).send('Internal server error');
    }
  }, 100);
});
app.get('/process/step4', async (req, res) => {
  setTimeout(() => {
    try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const message = `Step 4: Data received at ${new Date().toLocaleTimeString()}<br>`;
      res.send(renderFragment('this(append)', render(message)));
    } catch (err) {
      console.error('Error in /process/step4:', err);
      if (!res.headersSent) res.status(500).send('Internal server error');
    }
  }, 100);
});
app.get('/process/step5', async (req, res) => {
  setTimeout(() => {
    try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const message = `Step 5: Data received at ${new Date().toLocaleTimeString()}<br>`;
      res.send(renderFragment('this(append)', render(message)));
    } catch (err) {
      console.error('Error in /process/step5:', err);
      if (!res.headersSent) res.status(500).send('Internal server error');
    }
  }, 100);
});

app.get('/demo/loading', async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    res.write(renderFragment('#loadingDemoOutput(innerHTML)', render(`<div><span class="spinner"></span>Loading, please wait...</div>`)));
    setTimeout(() => {
      try {
        res.write(renderFragment('#loadingDemoOutput(innerHTML)', render(`<div class="p-4 bg-green-700 rounded-md text-green-100">Payload loaded after 5 seconds!</div>`)));
      } catch (innerErr) {
        console.error('Error writing demo loading payload:', innerErr);
      }
      if (!res.headersSent) res.end();
    }, 5000);
  } catch (err) {
    console.error('Error in /demo/loading endpoint:', err);
    if (!res.headersSent) res.status(500).end();
  }
});

app.get('/sse/subscribe', async (req, res) => {
  try {
    res.setHeader('Emit', 'sseUpdate');
    return res.send('');
  } catch (err) {
    console.error('Error in /sse/subscribe endpoint:', err);
    if (!res.headersSent) res.status(500).send('');
  }
});

app.get('/sse/subscribe/message', async (req, res) => {
  try {
    return res.send(renderFragment('this(innerHTML)', render(`SSe action performed`)));
  } catch (err) {
    console.error('Error in /sse/subscribe/message endpoint:', err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
});

// ------------------------------
// Server Setup with TLS (HTTP/2 with HTTP/1 fallback)
// ------------------------------
const http2Options = {
  key: fs.readFileSync(path.join(__dirname, 'cert', 'localhost+2-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'cert', 'localhost+2.pem')),
  allowHTTP1: true // Enables fallback to HTTP/1.1 (and thus our Express bridge)
};

const server = http2.createSecureServer(http2Options, app);

// ------------------------------
// Socket.IO Setup
// ------------------------------
const io = new SocketIOServer(server, {
  // Optional Socket.IO options
});

// /counter namespace: emits an incrementing counter every second.
const counterNamespace = io.of('/counter');
counterNamespace.on('connection', (socket) => {
  console.log("New Socket.IO connection on /counter");
  let count = 0;
  const interval = setInterval(() => {
    count++;
    socket.emit('counter', count);
  }, 1000);
  socket.on('disconnect', () => clearInterval(interval));
});

// /chat namespace: sends chat history on connection and relays messages.
const chatNamespace = io.of('/chat');
chatNamespace.on('connection', (socket) => {
  console.log("New Socket.IO connection on /chat");
  // Send existing chat history to the client.
  socket.emit('chatHistory', { history: chatMessages });
  // Listen for new chat messages from clients.
  socket.on('chatMessage', (msg) => {
    // Expect msg to be an object with username and text.
    chatMessages.push(msg);
    // Broadcast the new message to all connected clients.
    chatNamespace.emit('chatMessage', msg);
  });
});

// /updates namespace: sends live updates every 3 seconds.
const updatesNamespace = io.of('/updates');
updatesNamespace.on('connection', (socket) => {
  console.log("New Socket.IO connection on /updates");
  const interval = setInterval(() => {
    const updateMsg = render(`<div class="p-2 bg-gray-700 rounded-md text-gray-100">Live update at ${new Date().toLocaleTimeString()}</div>`);
    socket.emit('update', updateMsg);
  }, 3000);
  socket.on('disconnect', () => clearInterval(interval));
});

// ------------------------------
// Start Server
// ------------------------------
server.on('error', (err) => {
  console.error('Server error:', err);
});
server.on('clientError', (err, socket) => {
  console.error('Client connection error:', err);
  if (socket && socket.writable && !socket.destroyed) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  } else if (socket && !socket.destroyed) {
    try {
      socket.destroy();
    } catch (destroyError) {
      console.error("Error destroying socket:", destroyError);
    }
  }
});

export function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    const listener = server.listen(port, (err) => {
      if (err) {
        console.error('Failed to start server:', err);
        reject(err);
        return;
      }
      console.log(`Express HTTP/2 server (local dev) listening on https://localhost:${port}`);
      console.log('Server Features:');
      console.log('- HTTP/2 Enabled with HTTP/1 fallback (via http2-express-bridge)');
      console.log('- Socket.IO Namespaces: /counter, /chat, /updates');
      console.log('- Todo API Endpoints');
      console.log('- Streaming Support');
      resolve(server);
    });
    listener.on('error', err => {
      console.error("Server LISTENER error", err);
    });
  });
}

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default server;
