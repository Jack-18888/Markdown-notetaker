import { useState } from 'react';
import type { NoteDetail } from '@markdown-note-taker/contracts';
import { loadMarkdown } from '../editor/markdown.js';
import SourceFallback from '../editor/SourceFallback.js';
import NoteEditor from '../editor/NoteEditor.js';

export default function NoteContent(props: {
  note: NoteDetail;
  saveDisabled: boolean;
  onSaved(note: NoteDetail): void;
  onDirtyChange(dirty: boolean): void;
  onSavingChange(saving: boolean): void;
}) {
  const [document] = useState(() => loadMarkdown(props.note.content));
  return document.mode === 'source' ? (
    <SourceFallback document={document} />
  ) : (
    <NoteEditor {...props} document={document} />
  );
}
