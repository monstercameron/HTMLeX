import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import spdy from 'spdy';
import { WebSocketServer } from 'ws';
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

const app = express();
const PORT = process.env.PORT || 5500;

// Get __dirname in ES modules.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from the "public" directory.
app.use(express.static(path.join(__dirname, 'public')));

// Default root route to serve an index page.
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send(renderDefaultIndexPage());
  }
});

// Configure multer for form data processing.
const upload = multer();

// Path to the data file storing todos.
const dataPath = path.join(__dirname, 'data.json');

// Ensure data.json exists
if (!fs.existsSync(dataPath)) {
  fs.writeFileSync(dataPath, JSON.stringify([], null, 2));
}

// Global counter for the clicker demo.
let clickerCounter = 0;

// In-memory chat message store (for demonstration).
let chatMessages = [];

/**
 * Loads todos from the data file.
 * @returns {Array<Object>} Array of todo objects.
 */
const loadTodos = () => {
  try {
    if (!fs.existsSync(dataPath)) {
      console.log('Data file not found, creating empty file');
      fs.writeFileSync(dataPath, JSON.stringify([], null, 2));
      return [];
    }
    const data = fs.readFileSync(dataPath, 'utf8');
    console.log('Loaded todos data:', data);
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading todos:', err);
    return [];
  }
};

/**
 * Writes the todos array to the data file.
 * @param {Array<Object>} todos - Array of todo objects.
 */
const writeTodos = (todos) => {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(todos, null, 2));
    console.log('Successfully wrote todos to file');
  } catch (err) {
    console.error('Error writing todos:', err);
    throw err;
  }
};

// ------------------------------
// Todo API Endpoints
// ------------------------------

// CREATE: Add a new todo
app.post('/todos/create', upload.none(), (req, res) => {
  try {
    const todos = loadTodos();
    const newText = Array.isArray(req.body.todo) ? req.body.todo[0] : req.body.todo;
    if (!newText) {
      console.error('Missing todo text in request');
      return res.status(400).send('Missing todo text');
    }
    const newTodo = { id: Date.now(), text: newText };
    todos.push(newTodo);
    writeTodos(todos);
    const htmlSnippet = renderTodoList(todos);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Refresh the entire todo list
    res.send(renderFragment('#todoList(innerHTML)', htmlSnippet));
  } catch (err) {
    console.error('Error in /todos/create endpoint:', err);
    res.status(500).send('Internal server error');
  }
});

// READ: List all todos
app.get('/todos/list', (req, res) => {
  try {
    console.log('GET /todos/list endpoint hit');
    const todos = loadTodos();
    if (!Array.isArray(todos)) {
      console.error('Loaded todos is not an array:', todos);
      return res.status(500).send('Internal server error: Invalid todo data');
    }
    const htmlSnippet = renderTodoList(todos);
    if (!htmlSnippet) {
      console.error('Failed to render todo list');
      return res.status(500).send('Internal server error: Failed to render todos');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderFragment('#todoList(innerHTML)', htmlSnippet));
  } catch (err) {
    console.error('Error in /todos/list endpoint:', err);
    res.status(500).send('Internal server error');
  }
});

// READ SINGLE: Return a single todo item
app.get('/todos/item/:id', (req, res) => {
  try {
    const todos = loadTodos();
    const id = parseInt(req.params.id, 10);
    const todo = todos.find(t => t.id === id);
    if (!todo) {
      console.error(`Todo with id ${id} not found`);
      return res.status(404).send('Todo not found');
    }
    const htmlSnippet = renderTodoItem(todo);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderFragment(`#todo-${id}(outerHTML)`, htmlSnippet));
  } catch (err) {
    console.error('Error in /todos/item endpoint:', err);
    res.status(500).send('Internal server error');
  }
});

// EDIT FORM: Return an edit form for a todo item
app.get('/todos/edit/:id', (req, res) => {
  try {
    const todos = loadTodos();
    const id = parseInt(req.params.id, 10);
    const todo = todos.find(t => t.id === id);
    if (!todo) {
      console.error(`Todo with id ${id} not found`);
      return res.status(404).send('Todo not found');
    }
    const htmlSnippet = renderEditForm(todo);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderFragment(`#todo-${id}(outerHTML)`, htmlSnippet));
  } catch (err) {
    console.error('Error in /todos/edit endpoint:', err);
    res.status(500).send('Internal server error');
  }
});

// UPDATE: Update a todo (refresh the entire list)
app.put('/todos/:id', upload.none(), (req, res) => {
  try {
    const todos = loadTodos();
    const id = parseInt(req.params.id, 10);
    const index = todos.findIndex(todo => todo.id === id);
    if (index === -1) {
      console.error(`Todo with id ${id} not found`);
      return res.status(404).send('Todo not found');
    }
    const newText = Array.isArray(req.body.todo) ? req.body.todo[0] : req.body.todo;
    if (!newText) {
      console.error('Missing updated todo text');
      return res.status(400).send('Missing updated todo text');
    }
    todos[index].text = newText;
    writeTodos(todos);
    const updatedList = renderTodoList(todos);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Refresh the entire todo list after update
    res.send(renderFragment('#todoList(innerHTML)', updatedList));
  } catch (err) {
    console.error('Error in /todos/update endpoint:', err);
    res.status(500).send('Internal server error');
  }
});

// DELETE: Remove a todo (refresh the entire list)
app.delete('/todos/:id', (req, res) => {
  try {
    const todos = loadTodos();
    const id = parseInt(req.params.id, 10);
    const index = todos.findIndex(todo => todo.id === id);
    if (index === -1) {
      console.error(`Todo with id ${id} not found`);
      return res.status(404).send('Todo not found');
    }
    todos.splice(index, 1);
    writeTodos(todos);
    const updatedList = renderTodoList(todos);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Refresh the entire todo list after deletion
    res.send(renderFragment('#todoList(innerHTML)', updatedList));
  } catch (err) {
    console.error('Error in /todos/delete endpoint:', err);
    res.status(500).send('Internal server error');
  }
});

// ------------------------------
// Streaming Endpoints (HTTP/2 via spdy)
// ------------------------------

// Infinite Scrolling: Load More Items
app.get('/items/loadMore', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.write(renderFragment('#infiniteList(append)', renderLoadingMessage("Loading more items...")));
  setTimeout(() => {
    let itemsHtml = "";
    for (let i = 0; i < 5; i++) {
      itemsHtml += render(`<div class="p-2 bg-gray-700 rounded-md text-gray-100">Item ${Date.now() + i}</div>`);
    }
    res.write(renderFragment('#infiniteList(append)', itemsHtml));
    res.end();
  }, 2000);
});

// Notifications: Simulate a notification stream with a timer to remove after 5 sec
app.get('/notifications', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Send a loading fragment first
  res.write(renderFragment('#notificationArea(innerHTML)', renderLoadingMessage("Fetching notification...")));
  setTimeout(() => {
    // Send the notification fragment with a timer (assumes client handles the timer attribute)
    res.write(renderFragment('#notificationArea(innerHTML)', renderNotificationMessage("You have a new notification!"), { timer: "5000" }));
    res.end();
  }, 1500);
});

// Clicker Counter: Increment counter on click
app.get('/counter/increment', (req, res) => {
  clickerCounter++;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderFragment('#counterDisplay(innerHTML)', renderCounter(clickerCounter)));
});

// Chat: Send a chat message
app.post('/chat/send', upload.none(), (req, res) => {
  try {
    const message = req.body.message;
    if (!message) {
      return res.status(400).send('Missing chat message');
    }
    const newMessage = {
      id: Date.now(),
      username: req.body.username || 'Anonymous',
      text: message
    };
    chatMessages.push(newMessage);
    // Broadcast to WebSocket clients
    chatWss.clients.forEach(client => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify(newMessage));
      }
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.write(renderFragment('#chatMessages(innerHTML)', renderLoadingMessage("Sending message...")));
    setTimeout(() => {
      res.write(renderFragment('#chatMessages(innerHTML)', renderChatMessage(newMessage.username, newMessage.text)));
      res.end();
    }, 1000);
  } catch (err) {
    console.error('Error in /chat/send endpoint:', err);
    res.status(500).send('Internal server error');
  }
});

// Multi-Fragment Updates
app.get('/multi/fragment', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const fragments = [
    renderFragment('#multiUpdate1(innerHTML)', render(`<div class="p-4 bg-blue-700 rounded-md text-white">Primary Content Loaded</div>`)),
    renderFragment('#multiUpdate2(append)', render(`<div class="p-2 bg-blue-600 rounded-md text-white mt-2">Additional Content Appended</div>`))
  ];
  res.send(fragments.join(''));
});

// Sequential API Calls (simplified demo)
let pollVal = 0
app.get('/sequential/poll', (req, res) => {
  setTimeout(() => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderFragment('this(innerHTML)', render(`${pollVal++}, \n`)));
  }, 1000);
});

// Sequential API Calls (simplified demo)
app.get('/sequential/process', (req, res) => {
  setTimeout(() => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderFragment('this(innerHTML)', render(`this just came in \n`)));
  }, 1000);
});

// Endpoints for process chaining (steps 1 - 5)
app.get('/process/step1', (req, res) => {
  setTimeout(() => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const message = `Step 1: Data received at ${new Date().toLocaleTimeString()}<br>`;
    res.send(renderFragment('this(append)', render(message)));
  }, 100);
});
app.get('/process/step2', (req, res) => {
  setTimeout(() => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const message = `Step 2: Data received at ${new Date().toLocaleTimeString()}<br>`;
    res.send(renderFragment('this(append)', render(message)));
  }, 100);
});
app.get('/process/step3', (req, res) => {
  setTimeout(() => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const message = `Step 3: Data received at ${new Date().toLocaleTimeString()}<br>`;
    res.send(renderFragment('this(append)', render(message)));
  }, 100);
});
app.get('/process/step4', (req, res) => {
  setTimeout(() => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const message = `Step 4: Data received at ${new Date().toLocaleTimeString()}<br>`;
    res.send(renderFragment('this(append)', render(message)));
  }, 100);
});
app.get('/process/step5', (req, res) => {
  setTimeout(() => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const message = `Step 5: Data received at ${new Date().toLocaleTimeString()}<br>`;
    res.send(renderFragment('this(append)', render(message)));
  }, 100);
});

// New Demo Endpoint: Loading State Demo with Spinner
app.get('/demo/loading', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // First send a loading fragment that includes a spinner and a loading message
  res.write(renderFragment('#loadingDemoOutput(innerHTML)', render(`<div><span class="spinner"></span>Loading, please wait...</div>`)));
  // After 5 seconds, send the payload fragment
  setTimeout(() => {
    res.write(renderFragment('#loadingDemoOutput(innerHTML)', render(`<div class="p-4 bg-green-700 rounded-md text-green-100">Payload loaded after 5 seconds!</div>`)));
    res.end();
  }, 5000);
});

// SSE Subscriber
app.get('/sse/subscribe', (req, res) => {
  res.setHeader('Emit', 'sseUpdate');
  res.send('');
});
app.get('/sse/subscribe/message', (req, res) => {
  res.send(renderFragment('this(innerHTML)', render(`SSe action performed`)));
});

// ------------------------------
// Server Setup with TLS (HTTP/2)
// ------------------------------

// UPDATED SPDY options with allowHTTP1: true added so WebSocket upgrades work (HTTP/1.1 fallback).
const spdyOptions = {
  key: fs.readFileSync(path.join(__dirname, 'cert', 'server.key')),
  cert: fs.readFileSync(path.join(__dirname, 'cert', 'server.crt')),
  allowHTTP1: true, // <-- Added for WebSocket upgrades
  protocols: ['h2', 'spdy/3.1', 'spdy/3', 'spdy/2'],
  'x-forwarded-for': true,
  connection: {
    windowSize: 1024 * 1024,
    autoSpdy31: false
  }
};

// Create HTTP/2 server with TLS enabled.
const server = spdy.createServer(spdyOptions, app);

// ------------------------------
// WebSocket Setup
// ------------------------------

// Counter WebSocket
const counterWss = new WebSocketServer({
  server,
  path: '/counter',
  perMessageDeflate: false
});
counterWss.on('connection', (ws) => {
  console.log("New WebSocket connection on /counter");
  let count = 0;
  const interval = setInterval(() => {
    count++;
    ws.send(renderCounter(count));
  }, 1000);
  ws.on('error', (err) => console.error("Counter WebSocket error:", err));
  ws.on('close', () => clearInterval(interval));
});

// Chat WebSocket
const chatWss = new WebSocketServer({
  server,
  path: '/chat',
  perMessageDeflate: false
});
chatWss.on('connection', (ws) => {
  console.log("New WebSocket connection on /chat");
  ws.send(JSON.stringify({ history: chatMessages }));
  ws.on('error', (err) => console.error("Chat WebSocket error:", err));
  ws.on('message', (message) => {
    chatWss.clients.forEach(client => {
      if (client.readyState === client.OPEN) {
        client.send(message);
      }
    });
  });
});

// Updates WebSocket
const updatesWss = new WebSocketServer({
  server,
  path: '/updates',
  perMessageDeflate: false
});
updatesWss.on('connection', (ws) => {
  console.log("New WebSocket connection on /updates");
  const interval = setInterval(() => {
    const updateMsg = render(`<div class="p-2 bg-gray-700 rounded-md text-gray-100">Live update at ${new Date().toLocaleTimeString()}</div>`);
    ws.send(updateMsg);
  }, 3000);
  ws.on('error', (err) => console.error("Updates WebSocket error:", err));
  ws.on('close', () => clearInterval(interval));
});

// ------------------------------
// Start Server
// ------------------------------
export function startServer(port = PORT) {
  server.on('error', (err) => {
    console.error('Server error:', err);
  });
  // Updated clientError handler to avoid multiple callback calls
  server.on('clientError', (err, socket) => {
    console.error('Client connection error:', err);
    if (socket && !socket.destroyed) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }
  });
  return new Promise((resolve, reject) => {
    server.listen(port, (err) => {
      if (err) {
        console.error('Failed to start server:', err);
        reject(err);
        return;
      }
      console.log(`Express HTTP/2 server (local dev) listening on https://localhost:${port}`);
      console.log('Server Features:');
      console.log('- HTTP/2 Enabled');
      console.log('- WebSocket Endpoints: /counter, /chat, /updates');
      console.log('- Todo API Endpoints');
      console.log('- Streaming Support');
      resolve(server);
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
