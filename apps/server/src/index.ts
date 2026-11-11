import { DatabaseInitializationError } from './database/errors.js';
import { startServer } from './server.js';
import { parsePort, RuntimeConfigurationError } from './config.js';

try {
  const port = parsePort();
  // Storage initialization and migrations finish before listening.
  const runtime = startServer({
    port,
    serveWeb: process.env.NODE_ENV === 'production',
  });
  runtime.server.once('listening', () =>
    console.info(`API listening at http://127.0.0.1:${port}`),
  );
  // Listener errors happen asynchronously, outside this try/catch.
  runtime.server.once('error', (error: NodeJS.ErrnoException) => {
    console.error(`Server failed to start (${error.code ?? 'unknown error'}).`);
    process.exitCode = 1;
  });

  // Drain HTTP requests, then close SQLite before exiting.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void runtime.close().then(
        () => process.exit(),
        () => {
          console.error('Server shutdown failed.');
          process.exit(1);
        },
      );
    });
  }
} catch (error) {
  // Log sanitized startup errors without exposing SQL or note contents.
  console.error(
    error instanceof DatabaseInitializationError ||
      error instanceof RuntimeConfigurationError
      ? error.message
      : 'Server startup failed.',
  );
  process.exitCode = 1;
}
