import type {
  Folder,
  NoteMetadata,
  ParentId,
  ResourceId,
  TreeResponse,
} from '@markdown-note-taker/contracts';

export type Selection =
  { kind: 'folder'; id: ParentId } | { kind: 'note'; id: ResourceId };
export interface FolderContents {
  folders: Folder[];
  notes: NoteMetadata[];
}

const collator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});
function byLabel<T extends { id: string }>(label: (item: T) => string) {
  return (left: T, right: T) =>
    collator.compare(label(left), label(right)) ||
    (label(left) < label(right) ? -1 : label(left) > label(right) ? 1 : 0) ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

/** Validate hierarchy references once, then index without recursive traversal. */
export function indexTree(tree: TreeResponse) {
  const folders = new Map(tree.folders.map((folder) => [folder.id, folder]));
  const notes = new Map(tree.notes.map((note) => [note.id, note]));
  const fail = (): never => {
    throw new Error(
      'The workspace hierarchy is unavailable. Refresh to try again.',
    );
  };
  if (
    folders.size !== tree.folders.length ||
    notes.size !== tree.notes.length ||
    tree.notes.some((note) => folders.has(note.id))
  )
    fail();
  const resolved = new Set<ResourceId>();
  for (const folder of folders.values()) {
    const path = new Set<ResourceId>();
    let id: ParentId = folder.id;
    while (id !== null && !resolved.has(id)) {
      if (path.has(id)) fail();
      const current = folders.get(id);
      if (!current) return fail();
      path.add(id);
      id = current.parentId;
    }
    for (const id of path) resolved.add(id);
  }
  const contents = new Map<ParentId, FolderContents>([
    [null, { folders: [], notes: [] }],
  ]);
  for (const id of folders.keys()) contents.set(id, { folders: [], notes: [] });
  for (const folder of folders.values())
    contents.get(folder.parentId)!.folders.push(folder);
  for (const note of notes.values()) {
    const parent = contents.get(note.folderId);
    if (!parent) return fail();
    parent.notes.push(note);
  }
  for (const parent of contents.values()) {
    parent.folders.sort(byLabel((folder) => folder.name));
    parent.notes.sort(byLabel((note) => note.title));
  }
  return {
    folders,
    notes,
    contents,
    has(selection: Selection) {
      return selection.kind === 'folder'
        ? contents.has(selection.id)
        : notes.has(selection.id);
    },
    breadcrumbs(id: ParentId): Folder[] {
      const path: Folder[] = [];
      while (id !== null) {
        const folder = folders.get(id);
        if (!folder) return [];
        path.push(folder);
        id = folder.parentId;
      }
      return path.reverse();
    },
  };
}

export type WorkspaceTree = ReturnType<typeof indexTree>;
