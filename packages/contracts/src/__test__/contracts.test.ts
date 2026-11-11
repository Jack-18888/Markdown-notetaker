import { describe, expect, it } from 'vitest';
import {
  ApiErrorCode,
  createFolderRequestSchema,
  createNoteRequestSchema,
  deleteNoteRequestSchema,
  errorDefinitions,
  errorResponseSchema,
  expectedRevisionSchema,
  folderSchema,
  limits,
  nameSchema,
  noteDetailSchema,
  noteMetadataSchema,
  parentIdSchema,
  resourceIdSchema,
  resourceParamsSchema,
  revisionSchema,
  timestampSchema,
  treeResponseSchema,
  updateFolderRequestSchema,
  updateNoteRequestSchema,
} from '@markdown-note-taker/contracts';

const id = '123e4567-e89b-42d3-a456-426614174000';
const otherId = '123e4567-e89b-42d3-a456-426614174001';
const timestamp = '2026-11-07T12:00:00.000Z';
const folder = {
  id,
  name: 'Project',
  parentId: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const note = {
  id: otherId,
  title: 'Example',
  folderId: id,
  revision: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe('names and identifiers', () => {
  it.each([
    'Project notes',
    'same name',
    'A / B',
    '\u00e9',
    '\u{1f4dd}'.repeat(limits.nameCharacters),
  ])('accepts a valid name (%#)', (name) => {
    expect(nameSchema.parse(name)).toBe(name);
  });

  it.each([
    '',
    ' ',
    ' surrounding',
    'surrounding ',
    'line\nbreak',
    'tab\there',
    'nul\u0000',
    'del\u007f',
    'control\u0085',
    '\ud800',
    '\udfff',
    'x'.repeat(limits.nameCharacters + 1),
    '\u{1f4dd}'.repeat(limits.nameCharacters + 1),
    null,
    1,
  ])('rejects an invalid name (%#)', (name) => {
    expect(nameSchema.safeParse(name).success).toBe(false);
  });

  it('uses canonical UUID v4 identifiers and explicit null roots', () => {
    expect(resourceIdSchema.parse(id)).toBe(id);
    expect(parentIdSchema.parse(null)).toBeNull();
    expect(resourceParamsSchema.parse({ id })).toEqual({ id });
    expect(
      createFolderRequestSchema.parse({ name: 'Project', parentId: null })
        .parentId,
    ).toBeNull();
    expect(
      createNoteRequestSchema.parse({ title: 'Example', folderId: null })
        .folderId,
    ).toBeNull();
  });

  it.each([
    '',
    'root',
    id.toUpperCase(),
    id.replace('-42d3-', '-12d3-'),
    undefined,
    1,
    {},
  ])('rejects invalid identifiers and implicit roots (%#)', (value) => {
    expect(resourceIdSchema.safeParse(value).success).toBe(false);
    expect(parentIdSchema.safeParse(value).success).toBe(false);
    expect(
      createFolderRequestSchema.safeParse({ name: 'Project', parentId: value })
        .success,
    ).toBe(false);
  });

  it('preserves Unicode names without normalization', () => {
    expect(nameSchema.parse('\u00e9')).not.toBe(nameSchema.parse('e\u0301'));
  });

  it('validates timestamp format and UTC millisecond precision', () => {
    expect(timestampSchema.parse(timestamp)).toBe(timestamp);
    for (const value of [
      '2026-11-07',
      '2026-02-30T12:00:00.000Z',
      '2026-11-07T12:00:00Z',
      '2026-11-07T12:00:00.000+01:00',
    ]) {
      expect(timestampSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe('requests and revisions', () => {
  it('supports combined title/body/location writes with an expected revision', () => {
    const body = {
      expectedRevision: 1,
      title: 'Renamed',
      folderId: null,
      content: '',
    };
    expect(updateNoteRequestSchema.parse(body)).toEqual(body);
    expect(
      updateNoteRequestSchema.parse({ expectedRevision: 2, folderId: id }),
    ).toEqual({ expectedRevision: 2, folderId: id });
    expect(updateFolderRequestSchema.parse({ parentId: null })).toEqual({
      parentId: null,
    });
    expect(deleteNoteRequestSchema.parse({ expectedRevision: 1 })).toEqual({
      expectedRevision: 1,
    });
  });

  it.each([
    undefined,
    null,
    0,
    -1,
    1.5,
    '1',
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    Infinity,
  ])(
    'rejects missing, coerced, or unsafe revisions (%#)',
    (expectedRevision) => {
      expect(
        updateNoteRequestSchema.safeParse({ title: 'Name', expectedRevision })
          .success,
      ).toBe(false);
      expect(
        deleteNoteRequestSchema.safeParse({ expectedRevision }).success,
      ).toBe(false);
    },
  );

  it('bounds revisions without integer overflow and rejects empty patches', () => {
    expect(revisionSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(expectedRevisionSchema.parse(Number.MAX_SAFE_INTEGER - 1)).toBe(
      Number.MAX_SAFE_INTEGER - 1,
    );
    expect(
      expectedRevisionSchema.safeParse(Number.MAX_SAFE_INTEGER).success,
    ).toBe(false);
    expect(
      updateNoteRequestSchema.safeParse({ expectedRevision: 1 }).success,
    ).toBe(false);
    expect(updateFolderRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects missing roots, non-string content, and server-owned/unknown fields', () => {
    for (const body of [
      { title: 'Name' },
      { title: 'Name', folderId: '' },
      { title: 'Name', folderId: null, content: {} },
      { title: 'Name', folderId: null, revision: 10 },
      { title: 'Name', folderId: null, id },
    ]) {
      expect(createNoteRequestSchema.safeParse(body).success).toBe(false);
    }
    expect(
      updateNoteRequestSchema.safeParse({
        expectedRevision: 1,
        title: 'Name',
        revision: 2,
      }).success,
    ).toBe(false);
    expect(
      updateFolderRequestSchema.safeParse({
        parentId: null,
        updatedAt: timestamp,
      }).success,
    ).toBe(false);
    expect(resourceParamsSchema.safeParse({ id, other: true }).success).toBe(
      false,
    );
    expect(
      deleteNoteRequestSchema.safeParse({
        expectedRevision: 1,
        content: '',
      }).success,
    ).toBe(false);
  });
});

describe('responses, errors, and route registry', () => {
  it('separates tree metadata from note bodies', () => {
    const detail = { ...note, content: '' };
    expect(folderSchema.parse(folder)).toEqual(folder);
    expect(noteMetadataSchema.parse(note)).toEqual(note);
    expect(noteDetailSchema.parse(detail)).toEqual(detail);
    expect(
      treeResponseSchema.parse({ folders: [folder], notes: [note] }),
    ).toEqual({ folders: [folder], notes: [note] });
    expect(
      treeResponseSchema.safeParse({ folders: [], notes: [detail] }).success,
    ).toBe(false);
    expect(noteDetailSchema.safeParse(note).success).toBe(false);
  });

  it.each(Object.values(ApiErrorCode))(
    'validates the fixed %s error envelope',
    (code) => {
      const definition = errorDefinitions[code];
      const conflict =
        code === ApiErrorCode.REVISION_CONFLICT
          ? { noteId: id, expectedRevision: 1, currentRevision: 2 }
          : {};
      const body = {
        error: { code, message: definition.message, ...conflict },
      };
      expect(errorResponseSchema.parse(body)).toEqual(body);
      expect(definition.status).toBeGreaterThanOrEqual(400);
      expect(
        errorResponseSchema.safeParse({
          error: {
            ...body.error,
            message: 'SQL or note content must not appear here',
          },
        }).success,
      ).toBe(false);
    },
  );

  it('requires differing conflict revisions and excludes content/unknown error details', () => {
    const conflict = {
      code: 'REVISION_CONFLICT',
      message: errorDefinitions[ApiErrorCode.REVISION_CONFLICT].message,
      noteId: id,
      expectedRevision: 1,
      currentRevision: 2,
    };
    expect(
      errorResponseSchema.safeParse({
        error: { ...conflict, currentRevision: 1 },
      }).success,
    ).toBe(false);
    expect(
      errorResponseSchema.safeParse({
        error: { code: conflict.code, message: conflict.message },
      }).success,
    ).toBe(false);
    expect(
      errorResponseSchema.safeParse({
        error: { ...conflict, content: '' },
      }).success,
    ).toBe(false);
    expect(
      errorResponseSchema.safeParse({
        error: { code: 'UNKNOWN', message: 'Unknown' },
      }).success,
    ).toBe(false);
  });
});
