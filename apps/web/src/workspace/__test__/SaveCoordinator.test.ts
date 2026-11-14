import { Schema } from '@milkdown/kit/prose/model';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ApiErrorCode,
  type NoteDetail,
  type UpdateNoteRequest,
} from '@markdown-note-taker/contracts';
import { SaveCoordinator, saveDelay } from '../SaveCoordinator.js';
import { WorkspaceRequestError } from '../api.js';
import { note } from './fixtures.js';

afterEach(() => vi.useRealTimers());
const schema = new Schema({ nodes: { doc: { content: 'text*' }, text: {} } });
const body = (text: string, serialize = () => text) => ({
  node: schema.node('doc', null, text ? schema.text(text) : undefined),
  serialize,
});
function setup() {
  vi.useFakeTimers();
  let saved = note;
  const write = vi.fn(async (_id: string, input: UpdateNoteRequest) => {
    saved = {
      ...saved,
      title: input.title ?? saved.title,
      content: input.content ?? saved.content,
      folderId: input.folderId === undefined ? saved.folderId : input.folderId,
      revision: saved.revision + 1,
    };
    return saved;
  });
  const coordinator = new SaveCoordinator(note, write);
  coordinator.attachBody(body(note.content));
  return { coordinator, write };
}

it('waits for the quiet interval after an autosave response when newer typing is still recent', async () => {
  const { coordinator, write } = setup();
  let finish!: (note: NoteDetail) => void;
  write.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  coordinator.setBody(body('First'));
  await vi.advanceTimersByTimeAsync(saveDelay);
  coordinator.setBody(body('Latest'));
  finish({ ...note, content: 'First', revision: 2 });
  await vi.advanceTimersByTimeAsync(saveDelay - 1);
  expect(write).toHaveBeenCalledOnce();
  expect(coordinator.getSnapshot()).toMatchObject({
    status: 'pending',
    dirty: true,
  });
  await vi.advanceTimersByTimeAsync(1);
  expect(write.mock.calls[1]?.[1]).toEqual({
    expectedRevision: 2,
    content: 'Latest',
  });
  coordinator.dispose();
});

it('keeps an ambiguous failed write dirty even after undo, until a revision-checked retry acknowledges it', async () => {
  const { coordinator, write } = setup();
  write.mockRejectedValueOnce(
    new WorkspaceRequestError(
      'NETWORK_ERROR',
      'Could not reach the workspace.',
    ),
  );
  coordinator.setBody(body('Unconfirmed'));
  await coordinator.flush();
  coordinator.setBody(body(note.content));
  expect(coordinator.getSnapshot().dirty).toBe(true);
  await coordinator.flush();
  expect(write.mock.calls[1]?.[1]).toEqual({
    title: note.title,
    expectedRevision: 1,
  });
  expect(coordinator.getSnapshot().dirty).toBe(false);
  coordinator.dispose();
});

it('debounces both drafts, serializes only the submitted body, and omits untouched source', async () => {
  const { coordinator, write } = setup();
  const serialize = vi.fn(() => 'Body draft');
  coordinator.setTitle('First title');
  await vi.advanceTimersByTimeAsync(500);
  coordinator.setTitle('Latest title');
  coordinator.setBody(body('Body draft', serialize));
  await vi.advanceTimersByTimeAsync(saveDelay - 1);
  expect(write).not.toHaveBeenCalled();
  expect(serialize).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(write).toHaveBeenCalledOnce();
  expect(write.mock.calls[0]?.[1]).toEqual({
    title: 'Latest title',
    content: 'Body draft',
    expectedRevision: 1,
  });
  expect(coordinator.getSnapshot().dirty).toBe(false);
  coordinator.setTitle('Only a title');
  await coordinator.flush();
  expect(write.mock.calls[1]?.[1]).toEqual({
    title: 'Only a title',
    expectedRevision: 2,
  });
  coordinator.dispose();
});

it('shares a flush and drains edits made during a write using its acknowledged revision', async () => {
  const { coordinator, write } = setup();
  let finish!: (note: NoteDetail) => void;
  write.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  coordinator.setBody(body('First'));
  const flushed = coordinator.flush();
  expect(coordinator.flush()).toBe(flushed);
  await vi.advanceTimersByTimeAsync(0);
  coordinator.setBody(body('Newest'));
  coordinator.setTitle('New title');
  await vi.advanceTimersByTimeAsync(2000);
  expect(write).toHaveBeenCalledOnce();
  finish({ ...note, content: 'First', revision: 2 });
  await flushed;
  expect(write.mock.calls[1]?.[1]).toEqual({
    content: 'Newest',
    title: 'New title',
    expectedRevision: 2,
  });
  expect(coordinator.getSnapshot()).toMatchObject({
    dirty: false,
    note: { content: 'Newest', title: 'New title' },
  });
  coordinator.dispose();
});

it('retains failed snapshots, stops automatic retries, and retries explicitly', async () => {
  const { coordinator, write } = setup();
  write.mockRejectedValueOnce(new Error('private diagnostic'));
  coordinator.setBody(body('Retained'));
  await vi.advanceTimersByTimeAsync(saveDelay);
  expect(coordinator.getSnapshot()).toMatchObject({
    status: 'error',
    dirty: true,
  });
  expect(coordinator.getSnapshot().message).not.toContain('private diagnostic');
  await vi.advanceTimersByTimeAsync(5000);
  expect(write).toHaveBeenCalledOnce();
  expect(await coordinator.flush()).not.toBeNull();
  expect(coordinator.getSnapshot().dirty).toBe(false);
  coordinator.dispose();
});

it.each([ApiErrorCode.REVISION_CONFLICT, ApiErrorCode.NOT_FOUND])(
  'stops writes after %s while retaining recovery source',
  async (code) => {
    const { coordinator, write } = setup();
    write.mockRejectedValueOnce(
      new WorkspaceRequestError(code, 'The note changed.'),
    );
    coordinator.setBody(body('Local copy'));
    expect(await coordinator.flush()).toBeNull();
    coordinator.setBody(body('More local changes'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(await coordinator.flush()).toBeNull();
    expect(write).toHaveBeenCalledOnce();
    expect(coordinator.localContent()).toBe('More local changes');
    coordinator.dispose();
  },
);

it('blocks invalid names and conversion before sending a request and recovers after correction', async () => {
  const { coordinator, write } = setup();
  coordinator.setTitle(' padded ');
  expect(await coordinator.flush()).toBeNull();
  coordinator.setTitle(note.title);
  coordinator.setBody(
    body('Unsafe conversion', () => {
      throw new Error('private source');
    }),
  );
  expect(await coordinator.flush()).toBeNull();
  expect(write).not.toHaveBeenCalled();
  coordinator.setBody(body(note.content));
  expect(coordinator.getSnapshot().dirty).toBe(false);
  coordinator.dispose();
});

it('ignores late responses and cancels debounce work after disposal', async () => {
  const { coordinator, write } = setup();
  let finish!: (note: NoteDetail) => void;
  write.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  coordinator.setTitle('Retired draft');
  const promise = coordinator.flush();
  await vi.advanceTimersByTimeAsync(0);
  coordinator.dispose();
  finish({ ...note, title: 'Retired draft', revision: 2 });
  expect(await promise).toBeNull();
  expect(coordinator.getSnapshot().note).toBe(note);
  await vi.advanceTimersByTimeAsync(5000);
  expect(write).toHaveBeenCalledOnce();
});
