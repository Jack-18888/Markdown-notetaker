import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  updateFolder,
  updateNote,
} from '../api.js';
import { folder, note } from './fixtures.js';

afterEach(() => vi.unstubAllGlobals());
describe('lifecycle API contracts', () => {
  it('validates creates and sends explicit root destinations', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(folder, { status: 201 }))
      .mockResolvedValueOnce(Response.json(note, { status: 201 }));
    vi.stubGlobal('fetch', fetcher);
    await createFolder(folder.name, null, new AbortController().signal);
    await createNote(note.title, null, new AbortController().signal);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({
      name: folder.name,
      parentId: null,
    });
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({
      title: note.title,
      folderId: null,
    });
  });
  it('moves notes with a loaded revision and no content', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ ...note, folderId: folder.id, revision: 2 }),
      );
    vi.stubGlobal('fetch', fetcher);
    await updateNote(
      note.id,
      { expectedRevision: 1, folderId: folder.id },
      new AbortController().signal,
    );
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({
      expectedRevision: 1,
      folderId: folder.id,
    });
  });
  it('handles bodyless folder deletion and revision-checked note deletion', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(null, { status: 204 })),
      );
    vi.stubGlobal('fetch', fetcher);
    await deleteFolder(folder.id, new AbortController().signal);
    await deleteNote(note.id, 1, new AbortController().signal);
    expect(fetcher.mock.calls[0]![1]).not.toHaveProperty('body');
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({
      expectedRevision: 1,
    });
  });
  it('rejects invalid writes and mismatched update identities', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ ...folder, id: note.id }));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      createFolder(' padded ', null, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      updateFolder(
        folder.id,
        { name: 'Renamed' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
