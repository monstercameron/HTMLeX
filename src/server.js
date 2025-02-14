// server/server.js
import { startServer } from './app.js';

const PORT = process.env.PORT || 5500;
startServer(PORT);
