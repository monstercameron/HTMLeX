import { startServer } from './app.js';
import { serverLogger } from './serverLogger.js';

const port = process.env.PORT || 5500;

try {
  await startServer(port);
} catch (error) {
  serverLogger.fatal('server', 'Failed to start server.', error);
  process.exit(1);
}
