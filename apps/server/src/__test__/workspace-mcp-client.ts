import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

export function workspaceMcpClient(
  dataDirectory: string,
  mode: 'auto' | 'legacy' = 'legacy',
) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      '--import',
      'tsx',
      fileURLToPath(new URL('../mcp.ts', import.meta.url)),
    ],
    env: { DATA_DIR: dataDirectory },
    stderr: 'pipe',
  });
  let diagnostics = '';
  transport.stderr?.on(
    'data',
    (chunk: Buffer) => (diagnostics += chunk.toString()),
  );
  const client = new Client(
    { name: 'workspace-integration-test', version: '1.0.0' },
    { versionNegotiation: { mode } },
  );
  return {
    client,
    connect: () => client.connect(transport),
    close: () => client.close(),
    get diagnostics() {
      return diagnostics;
    },
  };
}
