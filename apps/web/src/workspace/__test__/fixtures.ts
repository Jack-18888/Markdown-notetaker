import type { Folder, NoteDetail } from '@markdown-note-taker/contracts';
export const ids = {
  folder: '123e4567-e89b-42d3-a456-426614174000',
  child: '123e4567-e89b-42d3-a456-426614174001',
  note: '123e4567-e89b-42d3-a456-426614174002',
  other: '123e4567-e89b-42d3-a456-426614174003',
};
const timestamp = '2026-11-09T12:00:00.000Z';
export const folder: Folder = {
  id: ids.folder,
  name: 'Folder',
  parentId: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
export const note: NoteDetail = {
  id: ids.note,
  title: 'Example',
  folderId: null,
  content: '# Source\r\n',
  revision: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};
