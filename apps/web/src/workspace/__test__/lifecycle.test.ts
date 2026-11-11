import { describe, expect, it } from 'vitest';
import { deletionCounts, moveChoices } from '../lifecycle.js';
import { indexTree } from '../tree.js';
import { folder, ids, note } from './fixtures.js';

describe('lifecycle choices and impact', () => {
  it('excludes a moved folder and its descendants, retaining root and siblings', () => {
    const tree = indexTree({
      folders: [
        folder,
        { ...folder, id: ids.child, parentId: folder.id },
        { ...folder, id: ids.other, name: 'Sibling' },
      ],
      notes: [{ ...note, folderId: ids.child }],
    });
    expect(moveChoices(tree, folder.id).map((choice) => choice.id)).toEqual([
      null,
      ids.other,
    ]);
    expect(deletionCounts(tree, folder.id)).toEqual({ folders: 1, notes: 1 });
    expect(moveChoices(tree).map((choice) => choice.id)).toEqual([
      null,
      ids.folder,
      ids.child,
      ids.other,
    ]);
  });
  it('distinguishes duplicate destination paths without using names as identity', () => {
    const tree = indexTree({
      folders: [folder, { ...folder, id: ids.child }],
      notes: [],
    });
    expect(moveChoices(tree)).toEqual([
      { id: null, label: 'Workspace' },
      { id: ids.folder, label: 'Workspace / Folder (1)' },
      { id: ids.child, label: 'Workspace / Folder (2)' },
    ]);
  });
});
