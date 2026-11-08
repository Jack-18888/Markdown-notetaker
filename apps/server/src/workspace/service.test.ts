import { afterEach, describe, expect, it } from 'vitest';
import {
  ApiErrorCode,
  errorResponseSchema,
  limits,
  noteDetailSchema,
  resourceIdSchema,
  treeResponseSchema,
} from '@markdown-note-taker/contracts';
import {
  fixtureIds,
  temporaryWorkspace,
} from '../../test/temporary-workspace.js';
import { WorkspaceError } from './errors.js';
import { createWorkspaceService } from './service.js';

type Workspace = ReturnType<typeof createWorkspaceService>;
const temporaryDirectories: ReturnType<typeof temporaryWorkspace>[] = [];
function setup() {
  const temporary = temporaryWorkspace();
  temporaryDirectories.push(temporary);
  const database = temporary.open();
  return { temporary, database, service: createWorkspaceService(database) };
}
afterEach(() => {
  for (const temporary of temporaryDirectories.splice(0)) temporary.cleanup();
});

function content(
  text = '# Fixture \u{1f4dd}\n\n**Markdown**\n<script>literal</script>\n',
) {
  return text;
}

function hierarchy(service: Workspace) {
  const root = service.createFolder({ name: 'Project', parentId: null });
  const child = service.createFolder({ name: 'Section', parentId: root.id });
  const nested = service.createFolder({ name: 'Details', parentId: child.id });
  const note = service.createNote({
    title: 'Example',
    folderId: nested.id,
    content: content(),
  });
  return { root, child, nested, note };
}

function state(service: Workspace) {
  const tree = service.listTree();
  return { tree, notes: tree.notes.map((note) => service.getNote(note.id)) };
}

function expectError<Result>(
  operation: () => Result,
  code: ApiErrorCode,
): WorkspaceError {
  try {
    operation();
  } catch (error) {
    if (!(error instanceof WorkspaceError)) throw error;
    expect(error.code).toBe(code);
    expect(errorResponseSchema.parse({ error: error.error })).toEqual({
      error: error.error,
    });
    return error;
  }
  throw new Error(`Expected ${code}.`);
}

describe('workspace persistence services', () => {
  it('starts empty and creates blank Markdown notes', () => {
    const { service } = setup();
    expect(service.listTree()).toEqual({ folders: [], notes: [] });
    const folder = service.createFolder({ name: 'Project', parentId: null });
    const first = service.createNote({ title: 'Blank', folderId: null });
    const second = service.createNote({ title: 'Blank', folderId: null });
    expect(resourceIdSchema.parse(folder.id)).toBe(folder.id);
    expect(first.id).not.toBe(second.id);
    expect(noteDetailSchema.parse(first)).toEqual(first);
    expect(first).toMatchObject({ folderId: null, revision: 1, content: '' });
    first.content = '# Local change';
    expect(service.getNote(first.id).content).toBe('');
    expect(second.content).toBe('');
  });

  it('moves and renames a note across three folder levels and back to root', () => {
    const { service, database, temporary } = setup();
    const { root, child, nested, note } = hierarchy(service);
    let current = note;
    for (const folderId of [child.id, root.id, null, nested.id, null]) {
      const before = current;
      current = service.updateNote(note.id, {
        expectedRevision: before.revision,
        folderId,
        title: 'Renamed',
      });
      expect(current).toMatchObject({
        title: 'Renamed',
        folderId,
        revision: before.revision + 1,
        createdAt: note.createdAt,
        content: note.content,
      });
      expect(service.getNote(note.id)).toEqual(current);
    }
    const before = state(service);
    database.close();
    expect(state(createWorkspaceService(temporary.open()))).toEqual(before);
  });

  it('moves a populated folder and preserves descendant locations and content', () => {
    const { service } = setup();
    const { root, child, nested, note } = hierarchy(service);
    const destination = service.createFolder({
      name: 'Other project',
      parentId: null,
    });
    const moved = service.updateFolder(child.id, {
      name: 'Moved section',
      parentId: destination.id,
    });
    expect(moved).toMatchObject({
      id: child.id,
      name: 'Moved section',
      parentId: destination.id,
      createdAt: child.createdAt,
    });
    expect(service.getNote(note.id)).toEqual(note);
    expect(
      service.listTree().folders.find((folder) => folder.id === nested.id)
        ?.parentId,
    ).toBe(child.id);
    expect(
      service.updateFolder(child.id, { parentId: null }).parentId,
    ).toBeNull();
    expect(
      service.listTree().folders.find((folder) => folder.id === root.id),
    ).toEqual(root);
  });

  it('returns only metadata for navigation and folder-deletion confirmation', () => {
    const { service } = setup();
    hierarchy(service);
    const tree = service.listTree();
    expect(treeResponseSchema.parse(tree)).toEqual(tree);
    expect(tree.folders).toHaveLength(3);
    expect(tree.notes).toHaveLength(1);
    expect(tree.notes[0]).not.toHaveProperty('content');
  });

  it('keeps duplicate labels and SQL-like text as ordinary parameter values', () => {
    const { service } = setup();
    const title = "O'Reilly'); DROP TABLE notes; --";
    const first = service.createFolder({ name: title, parentId: null });
    const second = service.createFolder({ name: title, parentId: null });
    const note = service.createNote({ title, folderId: first.id });
    expect(first.id).not.toBe(second.id);
    expect(service.getNote(note.id).title).toBe(title);
    expect(service.listTree().folders).toHaveLength(2);
  });

  it('rejects cyclic moves without applying a simultaneous rename', () => {
    const { service } = setup();
    const { root, child, nested } = hierarchy(service);
    const before = state(service);
    for (const parentId of [root.id, child.id, nested.id]) {
      expectError(
        () =>
          service.updateFolder(root.id, { parentId, name: 'Must not save' }),
        ApiErrorCode.HIERARCHY_CONFLICT,
      );
      expect(state(service)).toEqual(before);
    }
  });

  it('rejects missing and note-valued destinations without changing data', () => {
    const { service } = setup();
    const { root, note } = hierarchy(service);
    const before = state(service);
    for (const destination of [fixtureIds.missing, note.id]) {
      expectError(
        () => service.createFolder({ name: 'Invalid', parentId: destination }),
        ApiErrorCode.HIERARCHY_CONFLICT,
      );
      expectError(
        () => service.createNote({ title: 'Invalid', folderId: destination }),
        ApiErrorCode.HIERARCHY_CONFLICT,
      );
      expectError(
        () =>
          service.updateFolder(root.id, {
            name: 'Invalid',
            parentId: destination,
          }),
        ApiErrorCode.HIERARCHY_CONFLICT,
      );
      expectError(
        () =>
          service.updateNote(note.id, {
            title: 'Invalid',
            folderId: destination,
            expectedRevision: 1,
          }),
        ApiErrorCode.HIERARCHY_CONFLICT,
      );
      expect(state(service)).toEqual(before);
    }
  });

  it('terminates and rejects an externally corrupted destination cycle', () => {
    const { service, database } = setup();
    const { root, nested, note } = hierarchy(service);
    database
      .prepare('UPDATE folders SET parent_id = ? WHERE id = ?')
      .run(nested.id, root.id);
    const before = service.listTree();
    expectError(
      () =>
        service.updateNote(note.id, { folderId: root.id, expectedRevision: 1 }),
      ApiErrorCode.HIERARCHY_CONFLICT,
    );
    expectError(
      () => service.deleteFolder(root.id),
      ApiErrorCode.HIERARCHY_CONFLICT,
    );
    expect(service.listTree()).toEqual(before);
  });

  it('distinguishes missing targets from invalid destinations', () => {
    const { service } = setup();
    expectError(
      () => service.getNote(fixtureIds.missing),
      ApiErrorCode.NOT_FOUND,
    );
    expectError(
      () =>
        service.updateNote(fixtureIds.missing, {
          title: 'Missing',
          expectedRevision: 1,
        }),
      ApiErrorCode.NOT_FOUND,
    );
    expectError(
      () => service.deleteNote(fixtureIds.missing, { expectedRevision: 1 }),
      ApiErrorCode.NOT_FOUND,
    );
    expectError(
      () => service.updateFolder(fixtureIds.missing, { name: 'Missing' }),
      ApiErrorCode.NOT_FOUND,
    );
    expectError(
      () => service.deleteFolder(fixtureIds.missing),
      ApiErrorCode.NOT_FOUND,
    );
  });

  it.each([
    {
      name: 'empty title',
      input: { title: '', folderId: null },
      code: ApiErrorCode.INVALID_INPUT,
    },
    {
      name: 'implicit root',
      input: { title: 'Example' },
      code: ApiErrorCode.INVALID_INPUT,
    },
    {
      name: 'malformed destination',
      input: { title: 'Example', folderId: 'root' },
      code: ApiErrorCode.INVALID_INPUT,
    },
    {
      name: 'null content',
      input: { title: 'Example', folderId: null, content: null },
      code: ApiErrorCode.INVALID_INPUT,
    },
    {
      name: 'old JSON envelope',
      input: {
        title: 'Example',
        folderId: null,
        content: { schemaVersion: 1, content: { type: 'doc' } },
      },
      code: ApiErrorCode.INVALID_INPUT,
    },
    {
      name: 'malformed Unicode',
      input: { title: 'Example', folderId: null, content: '\ud800' },
      code: ApiErrorCode.INVALID_INPUT,
    },
    {
      name: 'oversized Markdown',
      input: {
        title: 'Example',
        folderId: null,
        content: 'x'.repeat(limits.markdownBytes + 1),
      },
      code: ApiErrorCode.PAYLOAD_TOO_LARGE,
    },
  ] as const)(
    'rejects $name before creating a partial note',
    ({ input, code }) => {
      const { service } = setup();
      expectError(
        // @ts-expect-error Deliberately malformed requests must fail at runtime.
        () => service.createNote(input),
        code,
      );
      expect(service.listTree()).toEqual({ folders: [], notes: [] });
    },
  );

  it('rejects invalid patches and identities without mutating saved notes', () => {
    const { service } = setup();
    const { root, note } = hierarchy(service);
    const before = state(service);
    expectError(
      () => service.updateNote(note.id, { expectedRevision: 1 }),
      ApiErrorCode.INVALID_INPUT,
    );
    expectError(
      () =>
        // @ts-expect-error Revisions must be numbers, even for external callers.
        service.updateNote(note.id, { title: 'Rename', expectedRevision: '1' }),
      ApiErrorCode.INVALID_INPUT,
    );
    expectError(
      () =>
        service.updateNote(note.id, {
          title: 'Rename',
          expectedRevision: 1,
          // @ts-expect-error Clients cannot supply the saved revision field.
          revision: 10,
        }),
      ApiErrorCode.INVALID_INPUT,
    );
    expectError(
      () => service.updateFolder(root.id, {}),
      ApiErrorCode.INVALID_INPUT,
    );
    expectError(
      // @ts-expect-error The virtual root has no deletable folder ID.
      () => service.deleteFolder(null),
      ApiErrorCode.INVALID_INPUT,
    );
    expectError(() => service.getNote('invalid'), ApiErrorCode.INVALID_INPUT);
    expect(state(service)).toEqual(before);
  });

  it('rejects invalid note content patches without changing metadata or revision', () => {
    const { service, database, temporary } = setup();
    const { root, note } = hierarchy(service);
    const before = state(service);
    const storedRows = database.prepare('SELECT * FROM notes').all();
    const cases = [
      { content: null, code: ApiErrorCode.INVALID_INPUT },
      { content: 12, code: ApiErrorCode.INVALID_INPUT },
      {
        content: { schemaVersion: 1, content: { type: 'doc' } },
        code: ApiErrorCode.INVALID_INPUT,
      },
      { content: '\ud800', code: ApiErrorCode.INVALID_INPUT },
      {
        content: 'x'.repeat(limits.markdownBytes + 1),
        code: ApiErrorCode.PAYLOAD_TOO_LARGE,
      },
    ] as const;
    for (const testCase of cases) {
      expectError(
        () =>
          service.updateNote(note.id, {
            expectedRevision: note.revision,
            title: 'Must not save',
            folderId: root.id,
            // @ts-expect-error Invalid content must also fail at runtime.
            content: testCase.content,
          }),
        testCase.code,
      );
      expect(state(service)).toEqual(before);
      expect(database.prepare('SELECT * FROM notes').all()).toEqual(storedRows);
    }
    database.close();
    expect(state(createWorkspaceService(temporary.open()))).toEqual(before);
  });

  it('commits combined note changes and preserves omitted fields', () => {
    const { service } = setup();
    const { root, note } = hierarchy(service);
    const updated = service.updateNote(note.id, {
      expectedRevision: 1,
      title: 'Updated',
      folderId: root.id,
      content: content('new text'),
    });
    expect(updated).toMatchObject({
      title: 'Updated',
      folderId: root.id,
      revision: 2,
      createdAt: note.createdAt,
      content: content('new text'),
    });
    const renamed = service.updateNote(note.id, {
      expectedRevision: 2,
      title: 'Only title',
    });
    expect(renamed).toMatchObject({
      title: 'Only title',
      folderId: root.id,
      revision: 3,
      content: updated.content,
    });
    expect(
      service.updateNote(note.id, { expectedRevision: 3, title: 'Only title' })
        .revision,
    ).toBe(4);
  });

  it('returns committed state and exactly one winner for two loaded revisions', () => {
    const { service: first, temporary, database } = setup();
    const note = first.createNote({ title: 'Example', folderId: null });
    const second = createWorkspaceService(temporary.open());
    const firstLoaded = first.getNote(note.id);
    const secondLoaded = second.getNote(note.id);
    const submitted = {
      expectedRevision: secondLoaded.revision,
      title: 'Losing title',
      content: content('local pending text'),
    };
    const localCopy = structuredClone(submitted);
    const saved = first.updateNote(note.id, {
      expectedRevision: firstLoaded.revision,
      folderId: null,
      title: 'Winner',
      content: content('saved text'),
    });
    const error = expectError(
      () => second.updateNote(note.id, submitted),
      ApiErrorCode.REVISION_CONFLICT,
    );
    expect(error.error).toMatchObject({
      noteId: note.id,
      expectedRevision: 1,
      currentRevision: 2,
    });
    expect(submitted).toEqual(localCopy);
    expect(second.getNote(note.id)).toEqual(saved);
    database.close();
    expect(createWorkspaceService(temporary.open()).getNote(note.id)).toEqual(
      saved,
    );
  });

  it('detects stale note deletion and deletes only the confirmed revision', () => {
    const { service } = setup();
    const note = service.createNote({ title: 'Example', folderId: null });
    const updated = service.updateNote(note.id, {
      expectedRevision: 1,
      content: content('new text'),
    });
    expectError(
      () => service.deleteNote(note.id, { expectedRevision: 1 }),
      ApiErrorCode.REVISION_CONFLICT,
    );
    expect(service.getNote(note.id)).toEqual(updated);
    service.deleteNote(note.id, { expectedRevision: 2 });
    expectError(() => service.getNote(note.id), ApiErrorCode.NOT_FOUND);
  });

  it('deletes an entire subtree while preserving siblings across reopen', () => {
    const { service, temporary, database } = setup();
    const { root, child, note } = hierarchy(service);
    const sibling = service.createFolder({
      name: 'Sibling',
      parentId: root.id,
    });
    const siblingNote = service.createNote({
      title: 'Keep',
      folderId: sibling.id,
      content: content('keep'),
    });
    const rootNote = service.createNote({ title: 'Root', folderId: null });
    service.deleteFolder(child.id);
    expectError(() => service.getNote(note.id), ApiErrorCode.NOT_FOUND);
    expect(
      service
        .listTree()
        .folders.map((folder) => folder.id)
        .sort(),
    ).toEqual([root.id, sibling.id].sort());
    expect(service.getNote(siblingNote.id)).toEqual(siblingNote);
    expect(service.getNote(rootNote.id)).toEqual(rootNote);
    const before = state(service);
    database.close();
    expect(state(createWorkspaceService(temporary.open()))).toEqual(before);
  });

  it('rolls back a failed subtree deletion, including already visited descendants', () => {
    const { service, database, temporary } = setup();
    const { root } = hierarchy(service);
    service.createNote({ title: 'Another', folderId: root.id });
    const before = state(service);
    database.exec(
      "CREATE TRIGGER fail_note_delete BEFORE DELETE ON notes BEGIN SELECT RAISE(ABORT, 'fixture delete failure'); END;",
    );
    const error = expectError(
      () => service.deleteFolder(root.id),
      ApiErrorCode.INTERNAL_ERROR,
    );
    expect(error.message).not.toContain('fixture delete failure');
    expect(state(service)).toEqual(before);
    expect(state(createWorkspaceService(temporary.open()))).toEqual(before);
  });

  it.each(['ABORT', 'IGNORE'] as const)(
    'rejects an unsuccessful folder update (%s)',
    (mode) => {
      const { service, database } = setup();
      const { root, child } = hierarchy(service);
      const before = state(service);
      const raise =
        mode === 'IGNORE'
          ? 'RAISE(IGNORE)'
          : "RAISE(ABORT, 'fixture update failure')";
      database.exec(
        `CREATE TRIGGER fail_folder_update BEFORE UPDATE ON folders BEGIN SELECT ${raise}; END;`,
      );
      expectError(
        () =>
          service.updateFolder(child.id, { name: 'Changed', parentId: null }),
        ApiErrorCode.INTERNAL_ERROR,
      );
      expect(state(service)).toEqual(before);
      expect(service.listTree().folders).toContainEqual(root);
    },
  );

  it('rolls back failed note saves without leaking SQL or local content', () => {
    const { service, database } = setup();
    const { root, note } = hierarchy(service);
    const before = state(service);
    database.exec(
      "CREATE TRIGGER fail_note_update BEFORE UPDATE ON notes BEGIN SELECT RAISE(ABORT, 'fixture update failure'); END;",
    );
    const error = expectError(
      () =>
        service.updateNote(note.id, {
          expectedRevision: 1,
          title: 'private title',
          folderId: root.id,
          content: content('private body'),
        }),
      ApiErrorCode.INTERNAL_ERROR,
    );
    expect(JSON.stringify(error.error)).not.toMatch(
      /fixture update failure|private title|private body/,
    );
    expect(state(service)).toEqual(before);
  });

  it('preserves raw Markdown bytes, empty content, and whitespace across reopen', () => {
    const { service, database, temporary } = setup();
    const raw =
      '\ufeff# Heading\r\n\r\n**bold**  \r\n\tindent\r\n<script>literal</script>\r\n\r\n\u{1f4dd}\u0000\n';
    const note = service.createNote({
      title: 'Source',
      folderId: null,
      content: raw,
    });
    expect(service.getNote(note.id).content).toBe(raw);
    const cleared = service.updateNote(note.id, {
      expectedRevision: 1,
      content: '',
    });
    expect(cleared.content).toBe('');
    const restored = service.updateNote(note.id, {
      expectedRevision: 2,
      content: raw,
    });
    database.close();
    expect(createWorkspaceService(temporary.open()).getNote(note.id)).toEqual(
      restored,
    );
  });
});
