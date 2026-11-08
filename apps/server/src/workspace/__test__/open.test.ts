import { afterEach, describe, expect, it } from 'vitest';
import { ApiErrorCode } from '@markdown-note-taker/contracts';
import { temporaryWorkspace } from '../../__test__/temporary-workspace.js';
import { openWorkspace } from '../open.js';
import type { Workspace } from '../types.js';

const directories: ReturnType<typeof temporaryWorkspace>[] = [];
const workspaces: Workspace[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) workspace.close();
  for (const temporary of directories.splice(0)) temporary.cleanup();
});

describe('workspace entry point', () => {
  it('persists service writes across closing and reopening', () => {
    const temporary = temporaryWorkspace();
    directories.push(temporary);
    const options = { dataDirectory: temporary.dataDirectory };
    const first = openWorkspace(options);
    workspaces.push(first);
    const folder = first.service.createFolder({
      name: 'Project',
      parentId: null,
    });
    const note = first.service.createNote({
      title: 'Saved',
      folderId: folder.id,
    });
    first.close();
    first.close();

    const reopened = openWorkspace(options);
    workspaces.push(reopened);
    expect(reopened.service.getNote(note.id)).toEqual({
      ...note,
      content: '',
    });
    expect(reopened.service.listTree().folders).toEqual([folder]);
  });

  it('keeps migration overrides outside the public workspace options', () => {
    const temporary = temporaryWorkspace();
    directories.push(temporary);
    const options = { dataDirectory: temporary.dataDirectory, migrations: [] };
    const workspace = openWorkspace(options);
    workspaces.push(workspace);
    expect(
      workspace.service.createNote({ title: 'Saved', folderId: null }),
    ).toMatchObject({
      title: 'Saved',
      revision: 1,
      content: '',
    });
  });

  it('releases its connection when service initialization fails', () => {
    const temporary = temporaryWorkspace();
    directories.push(temporary);
    const database = temporary.open();
    database.exec('DROP TABLE notes');
    database.close();
    expect(() =>
      openWorkspace({ dataDirectory: temporary.dataDirectory }),
    ).toThrow(expect.objectContaining({ code: ApiErrorCode.INTERNAL_ERROR }));
    // Windows permits deleting the fixture only after all connections close.
    expect(() => temporary.cleanup()).not.toThrow();
  });
});
