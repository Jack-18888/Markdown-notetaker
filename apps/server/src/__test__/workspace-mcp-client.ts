import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

export function workspaceMcpClient(
  dataDirectory: string,
  {
    mode = 'legacy',
    args = [],
    built = false,
  }: { mode?: 'auto' | 'legacy'; args?: string[]; built?: boolean } = {},
) {
  const entry = built
    ? [fileURLToPath(new URL('../../dist/mcp.js', import.meta.url))]
    : ['--import', 'tsx', fileURLToPath(new URL('../mcp.ts', import.meta.url))];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [...entry, ...args],
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
