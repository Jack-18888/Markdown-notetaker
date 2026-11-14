import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startServer } from '../server.js';
import {
  fixtureIds,
  seedWorkspace,
  temporaryWorkspace,
} from './temporary-workspace.js';

const running: ReturnType<typeof startServer>[] = [];
const workspaces: ReturnType<typeof temporaryWorkspace>[] = [];
afterEach(async () => {
  for (const runtime of running.splice(0)) await runtime.close();
  for (const temporary of workspaces.splice(0)) temporary.cleanup();
});

describe('server database lifecycle', () => {
  it('retains HTTP-created notes across a production-mode server restart', async () => {
    const temporary = temporaryWorkspace();
    workspaces.push(temporary);
    const content = '# Persisted\r\n\r\n```mermaid\nA --> B\n```\n';
    const webDirectory = join(temporary.directory, 'web');
    mkdirSync(join(webDirectory, 'assets'), { recursive: true });
    writeFileSync(
      join(webDirectory, 'index.html'),
      '<!doctype html><title>Temporary frontend</title>',
    );
    const launch = async () => {
      const runtime = startServer({
        port: 0,
        serveWeb: true,
        webDirectory,
        dataDirectory: temporary.dataDirectory,
      });
      running.push(runtime);
      await once(runtime.server, 'listening');
      const address = runtime.server.address();
      if (!address || typeof address === 'string')
        throw new Error('Expected a TCP listener.');
      return { runtime, origin: `http://127.0.0.1:${address.port}` };
    };
    const first = await launch();
    const created = await fetch(`${first.origin}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: first.origin },
      body: JSON.stringify({ title: 'Persisted', folderId: null, content }),
    });
    expect(created.status).toBe(201);
    const note = (await created.json()) as { id: string; content: string };
    expect(note.content).toBe(content);
    await first.runtime.close();
    const second = await launch();
    const result = await fetch(`${second.origin}/api/notes/${note.id}`);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual(note);
    const denied = await fetch(`${second.origin}/api/notes/${note.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:5173',
      },
      body: JSON.stringify({ expectedRevision: 1 }),
    });
    expect(denied.status).toBe(403);
    expect((await fetch(`${second.origin}/api/notes/${note.id}`)).status).toBe(
      200,
    );
  });

  it('initializes before serving and reopens saved data after shutdown', async () => {
    const temporary = temporaryWorkspace();
    workspaces.push(temporary);
    const initial = temporary.open();
    const content = seedWorkspace(initial);
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
    const note = await fetch(
      `http://127.0.0.1:${address.port}/api/notes/${fixtureIds.note}`,
    );
    expect(note.status).toBe(200);
    expect(await note.json()).toMatchObject({ id: fixtureIds.note, content });
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
    expect(second.open().pragma('user_version', { simple: true })).toBe(3);
  });
});
