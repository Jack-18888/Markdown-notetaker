import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiErrorCode, errorDefinitions } from '@markdown-note-taker/contracts';
import { getNote, getTree } from '../api.js';
import { ids, note } from './fixtures.js';

afterEach(() => vi.unstubAllGlobals());
describe('typed workspace client', () => {
  it('validates note detail and passes cancellation/no-cache options', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(note));
    vi.stubGlobal('fetch', fetcher);
    const { signal } = new AbortController();
    expect(await getNote(note.id, signal)).toEqual(note);
    expect(fetcher).toHaveBeenCalledWith(`/api/notes/${note.id}`, {
      signal,
      cache: 'no-store',
    });
  });
  it('rejects mismatched identities and malformed success shapes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...note, id: ids.other })),
    );
    await expect(
      getNote(note.id, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ folders: [], notes: [note] })),
    );
    await expect(getTree(new AbortController().signal)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
  it('accepts only public contract errors with their expected status', async () => {
    const body = {
      error: {
        code: ApiErrorCode.NOT_FOUND,
        message: errorDefinitions.NOT_FOUND.message,
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(body, { status: 404 })),
    );
    await expect(
      getNote(note.id, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: body.error.message });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(body, { status: 500 })),
    );
    await expect(getTree(new AbortController().signal)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
  it('sanitizes network and non-JSON failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('private diagnostic')),
    );
    await expect(getTree(new AbortController().signal)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Could not reach your local workspace. Try again.',
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('<html>private diagnostic</html>')),
    );
    await expect(getTree(new AbortController().signal)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});
