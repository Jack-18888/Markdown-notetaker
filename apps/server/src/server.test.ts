import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { startServer } from './server.js';
import {
  seedWorkspace,
  temporaryWorkspace,
} from '../test/temporary-workspace.js';

const running: ReturnType<typeof startServer>[] = [];
const workspaces: ReturnType<typeof temporaryWorkspace>[] = [];
afterEach(async () => {
  for (const runtime of running.splice(0)) await runtime.close();
  for (const temporary of workspaces.splice(0)) temporary.cleanup();
});

describe('server database lifecycle', () => {
  it('initializes before serving and reopens saved data after shutdown', async () => {
    const temporary = temporaryWorkspace();
    workspaces.push(temporary);
    const initial = temporary.open();
    seedWorkspace(initial);
    initial.close();
    const runtime = startServer({
      port: 0,
      dataDirectory: temporary.dataDirectory,
    });
    running.push(runtime);
    await once(runtime.server, 'listening');
    const address = runtime.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected a TCP listener.');
    expect(address.address).toBe('127.0.0.1');
    expect(
      (await fetch(`http://127.0.0.1:${address.port}/api/health`)).status,
    ).toBe(200);
    await runtime.close();
    await runtime.close();
    expect(runtime.server.listening).toBe(false);
    expect(temporary.open().prepare('SELECT title FROM notes').get()).toEqual({
      title: 'Example',
    });
  });

  it('rejects startup before opening HTTP when persistence is unavailable', () => {
    const temporary = temporaryWorkspace();
    workspaces.push(temporary);
    expect(() =>
      startServer({
        port: 0,
        dataDirectory: temporary.dataDirectory,
        busyTimeoutMs: -1,
      }),
    ).toThrow();
  });

  it('handles an occupied port and still permits database reopening', async () => {
    const first = temporaryWorkspace();
    const second = temporaryWorkspace();
    workspaces.push(first, second);
    const primary = startServer({
      port: 0,
      dataDirectory: first.dataDirectory,
    });
    running.push(primary);
    await once(primary.server, 'listening');
    const address = primary.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected a TCP listener.');
    const conflicting = startServer({
      port: address.port,
      dataDirectory: second.dataDirectory,
    });
    running.push(conflicting);
    await expect(once(conflicting.server, 'listening')).rejects.toMatchObject({
      code: 'EADDRINUSE',
    });
    await conflicting.close();
    expect(second.open().pragma('user_version', { simple: true })).toBe(2);
  });
});
