import { serveStdio } from '@modelcontextprotocol/server/stdio';
import {
  DatabaseErrorCode,
  DatabaseInitializationError,
} from './database/errors.js';
import { createMcpServer } from './mcp/tools.js';
import { openExistingWorkspace } from './workspace/open.js';

try {
  const workspace = openExistingWorkspace();
  // Also release SQLite if stdin closes before the first protocol message.
  process.once('exit', workspace.close);
  const server = createMcpServer(workspace.service);
  server.server.onclose = workspace.close;
  const connection = serveStdio(() => server, {
    onerror: () => console.error('Workspace MCP transport error.'),
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void connection.close().catch(() => {
        console.error('Workspace MCP shutdown failed.');
        process.exitCode = 1;
      });
    });
  }
} catch (error) {
  if (error instanceof DatabaseInitializationError) {
    console.error(error.message);
    if (error.code === DatabaseErrorCode.DATABASE_UNAVAILABLE)
      console.error(
        'Start the web app once to initialize the selected workspace.',
      );
  } else {
    console.error('Workspace MCP startup failed.');
  }
  process.exitCode = 1;
}
