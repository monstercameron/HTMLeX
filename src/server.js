import { installProcessHandlers, startServer } from './app.js';
import { serverLogger } from './serverLogger.js';

function safeString(value, fallback = '') {
  try {
    return String(value ?? fallback);
  } catch {
    return fallback;
  }
}

function safeExit(exit, exitCode) {
  try {
    if (typeof exit === 'function') exit(exitCode);
  } catch {
    // Process shutdown should never throw back into startup handling.
  }
}

export async function runServer({
  port = safeString(process.env.PORT).trim() || 5500,
  exit = process.exit,
} = {}) {
  installProcessHandlers({ exit });

  try {
    await startServer(port);
  } catch (error) {
    serverLogger.fatal('server', 'Failed to start server.', error);
    safeExit(exit, 1);
  }
}

if (process.argv[1] === import.meta.filename) {
  await runServer();
}
