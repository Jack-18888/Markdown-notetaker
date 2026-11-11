import type {
  Folder,
  NoteMetadata,
  ParentId,
  ResourceId,
} from '@markdown-note-taker/contracts';
import type { WorkspaceTree } from './tree.js';

export type ResourceTarget =
  { kind: 'folder'; value: Folder } | { kind: 'note'; value: NoteMetadata };
export type NameAction =
  | { kind: 'create'; resource: 'folder' | 'note'; parentId: ParentId }
  | { kind: 'rename'; target: ResourceTarget };
export type LifecycleAction =
  NameAction | { kind: 'move' | 'delete'; target: ResourceTarget };

export function subtreeFolders(tree: WorkspaceTree, id: ResourceId) {
  const found = new Set<ResourceId>();
  const pending = [id];
  while (pending.length) {
    const current = pending.pop()!;
    if (found.has(current)) continue;
    found.add(current);
    for (const folder of tree.contents.get(current)?.folders ?? [])
      pending.push(folder.id);
  }
  return found;
}

export function deletionCounts(tree: WorkspaceTree, id: ResourceId) {
  const folders = subtreeFolders(tree, id);
  let notes = 0;
  for (const folderId of folders)
    notes += tree.contents.get(folderId)?.notes.length ?? 0;
  return { folders: folders.size - 1, notes };
}

export function moveChoices(tree: WorkspaceTree, movingFolderId?: ResourceId) {
  const blocked = movingFolderId
    ? subtreeFolders(tree, movingFolderId)
    : new Set<ResourceId>();
  const choices: { id: ParentId; label: string }[] = [
    { id: null, label: 'Workspace' },
  ];
  const pending = [...tree.contents.get(null)!.folders].reverse();
  while (pending.length) {
    const folder = pending.pop()!;
    if (blocked.has(folder.id)) continue;
    choices.push({
      id: folder.id,
      label:
        'Workspace / ' +
        tree
          .breadcrumbs(folder.id)
          .map((parent) => parent.name)
          .join(' / '),
    });
    const children = tree.contents.get(folder.id)!.folders;
    for (let index = children.length - 1; index >= 0; index--)
      pending.push(children[index]!);
  }
  const counts = new Map<string, number>();
  for (const choice of choices)
    counts.set(choice.label, (counts.get(choice.label) ?? 0) + 1);
  const ordinals = new Map<string, number>();
  return choices.map((choice) => {
    const ordinal = (ordinals.get(choice.label) ?? 0) + 1;
    ordinals.set(choice.label, ordinal);
    return {
      ...choice,
      label:
        counts.get(choice.label)! > 1
          ? `${choice.label} (${ordinal})`
          : choice.label,
    };
  });
}
