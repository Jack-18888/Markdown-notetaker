import { useState } from 'react';
import { loadMarkdown } from '../editor/markdown.js';
import SourceFallback from '../editor/SourceFallback.js';
import NoteEditor from '../editor/NoteEditor.js';
import type { SaveCoordinator } from './SaveCoordinator.js';

export default function NoteContent({
  source,
  session,
}: {
  source: string;
  session: SaveCoordinator;
}) {
  const [document] = useState(() => loadMarkdown(source));
  return document.mode === 'source' ? (
    <SourceFallback document={document} />
  ) : (
    <NoteEditor document={document} session={session} />
  );
}
