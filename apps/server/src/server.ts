import type { Server } from 'node:http';
import { createApp } from './app.js';
import { openDatabase, type DatabaseOptions } from './database/open.js';

interface ServerOptions extends DatabaseOptions {
  port: number;
  serveWeb?: boolean;
}

/** Keep HTTP and database lifetimes together, including failed port binding. */
export function startServer({
  port,
  serveWeb = false,
  ...databaseOptions
}: ServerOptions) {
  const database = openDatabase(databaseOptions);
  let server: Server;
  try {
    server = createApp({ serveWeb }).listen(port, '127.0.0.1');
  } catch (error) {
    database.close();
    throw error;
  }
  server.once('error', () => {
    if (database.open) database.close();
  });

  let closing: Promise<void> | undefined;
  return {
    server,
    close(): Promise<void> {
      return (closing ??= new Promise((resolve, reject) => {
        server.close((error: NodeJS.ErrnoException | undefined) => {
          try {
            if (database.open) database.close();
          } catch {
            reject(new Error('Database shutdown failed.'));
            return;
          }
          if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
          else resolve();
        });
      }));
    },
  };
}
