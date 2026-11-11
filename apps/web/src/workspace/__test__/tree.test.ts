import { describe, expect, it } from 'vitest';
import { indexTree } from '../tree.js';
import { folder, ids, note } from './fixtures.js';

describe('workspace hierarchy index', () => {
  it('indexes root, nested content, numeric ordering, and duplicate labels by ID', () => {
    const folders = [
      folder,
      { ...folder, id: ids.child, parentId: folder.id },
      { ...folder, id: ids.other, name: 'Folder 2' },
    ];
    const tree = indexTree({
      folders,
      notes: [{ ...note, folderId: ids.child }],
    });
    expect(tree.contents.get(null)?.folders.map((folder) => folder.id)).toEqual(
      [ids.folder, ids.other],
    );
    expect(tree.breadcrumbs(ids.child).map((folder) => folder.id)).toEqual([
      ids.folder,
      ids.child,
    ]);
    expect(tree.contents.get(ids.child)?.notes[0]?.id).toBe(note.id);
    expect(tree.has({ kind: 'folder', id: null })).toBe(true);
    expect(tree.has({ kind: 'note', id: ids.other })).toBe(false);
    const ordered = indexTree({
      folders: [
        { ...folder, name: 'Folder 10' },
        { ...folder, id: ids.child, name: 'Folder 2' },
      ],
      notes: [],
    });
    expect(
      ordered.contents.get(null)?.folders.map((folder) => folder.name),
    ).toEqual(['Folder 2', 'Folder 10']);
  });
  it.each([
    { folders: [folder, folder], notes: [] },
    { folders: [folder], notes: [note, note] },
    { folders: [folder], notes: [{ ...note, id: folder.id }] },
    { folders: [{ ...folder, parentId: ids.child }], notes: [] },
    { folders: [{ ...folder, parentId: folder.id }], notes: [] },
    {
      folders: [
        { ...folder, parentId: ids.child },
        { ...folder, id: ids.child, parentId: folder.id },
      ],
      notes: [],
    },
    { folders: [], notes: [{ ...note, folderId: ids.folder }] },
  ])(
    'rejects inconsistent hierarchy %# instead of hiding entries or looping',
    (tree) => {
      expect(() => indexTree(tree)).toThrow('workspace hierarchy');
    },
  );
});
