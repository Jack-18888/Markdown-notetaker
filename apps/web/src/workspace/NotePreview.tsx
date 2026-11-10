import { useEffect, useMemo, useRef } from 'react';
import { Editor } from '@tiptap/core';
import { editorExtensions } from '../editor/extensions.js';
import { loadMarkdown } from '../editor/markdown.js';
import SourceFallback from '../editor/SourceFallback.js';
import './note-preview.css';

export default function NotePreview({ source }: { source: string }) {
  const host = useRef<HTMLDivElement>(null);
  const document = useMemo(() => loadMarkdown(source), [source]);
  useEffect(() => {
    if (document.mode !== 'rich' || !host.current) return;
    const editor = new Editor({
      element: host.current,
      extensions: editorExtensions(),
      content: document.document,
      editable: false,
      editorProps: {
        attributes: { role: 'document', 'aria-label': 'Note content' },
      },
    });
    for (const input of editor.view.dom.querySelectorAll('input'))
      input.disabled = true;
    return () => editor.destroy();
  }, [document]);
  return document.mode === 'source' ? (
    <SourceFallback document={document} />
  ) : (
    <div className="note-body" ref={host} />
  );
}
