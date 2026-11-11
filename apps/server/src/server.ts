import type { Server } from 'node:http';
import { createApp } from './app.js';
import { openWorkspace, type WorkspaceOptions } from './workspace/open.js';
import { checkFrontendAssets, frontendDirectory } from './config.js';

interface ServerOptions extends WorkspaceOptions {
  port: number;
  serveWeb?: boolean;
  webDirectory?: string;
}

/** Keep HTTP and database lifetimes together, including failed port binding. */
export function startServer({
  port,
  serveWeb = false,
  webDirectory = frontendDirectory,
  ...workspaceOptions
}: ServerOptions) {
  if (serveWeb) checkFrontendAssets(webDirectory);
  const workspace = openWorkspace(workspaceOptions);
  let server: Server;
  try {
    server = createApp({
      workspace: workspace.service,
      serveWeb,
      webDirectory,
    }).listen(port, '127.0.0.1');
  } catch (error) {
    workspace.close();
    throw error;
  }
  server.once('error', () => {
    workspace.close();
  });

  let closing: Promise<void> | undefined;
  return {
    server,
    close(): Promise<void> {
      return (closing ??= new Promise((resolve, reject) => {
        server.close((error: NodeJS.ErrnoException | undefined) => {
          try {
            workspace.close();
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
