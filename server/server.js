// server/server.js
import { startServer } from './api.js';

const PORT = process.env.PORT || 5500;
startServer(PORT);
