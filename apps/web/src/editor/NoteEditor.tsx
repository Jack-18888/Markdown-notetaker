import { useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/core';
import type { NoteDetail } from '@markdown-note-taker/contracts';
import { updateNote, WorkspaceRequestError } from '../workspace/api.js';
import { editorExtensions } from './extensions.js';
import type { LoadedMarkdown } from './markdown.js';
import EditorToolbar from './EditorToolbar.js';
import SlashMenu from './SlashMenu.js';
import '../workspace/note-preview.css';
import './note-editor.css';

export default function NoteEditor({
  note,
  document,
  saveDisabled,
  onSaved,
  onDirtyChange,
  onSavingChange,
}: {
  note: NoteDetail;
  document: Extract<LoadedMarkdown, { mode: 'rich' }>;
  saveDisabled: boolean;
  onSaved(note: NoteDetail): void;
  onDirtyChange(dirty: boolean): void;
  onSavingChange(saving: boolean): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  const unconfirmedWrite = useRef(false);
  const baseline = useRef(document);
  const savedDocument = useRef(document.document);
  // A title save updates note/revision; it must not recreate this editor or its history.
  useEffect(() => {
    const instance = new Editor({
      element: host.current!,
      extensions: editorExtensions(),
      content: baseline.current.document,
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-label': 'Note content',
          'aria-multiline': 'true',
          'aria-describedby': 'writing-help',
        },
      },
      onUpdate: ({ editor }) => {
        const changed =
          unconfirmedWrite.current ||
          !editor.state.doc.eq(
            editor.schema.nodeFromJSON(savedDocument.current),
          );
        setDirty(changed);
        onDirtyChange(changed || !!request.current);
        setError('');
        setMessage('');
      },
    });
    setEditor(instance);
    return () => {
      request.current?.abort();
      instance.destroy();
      onDirtyChange(false);
      onSavingChange(false);
    };
  }, [onDirtyChange, onSavingChange]);

  async function save() {
    if (!editor || request.current || saveDisabled || !dirty) return;
    let content: string;
    const snapshot = editor.getJSON();
    try {
      content = baseline.current.serialize(snapshot);
    } catch {
      setError(
        'This edit cannot be saved safely. Your writing is still here; undo the last change and try again.',
      );
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    unconfirmedWrite.current = true;
    setPending(true);
    onSavingChange(true);
    onDirtyChange(true);
    setError('');
    setMessage('');
    try {
      const saved = await updateNote(
        note.id,
        { content, expectedRevision: note.revision },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      savedDocument.current = snapshot;
      unconfirmedWrite.current = false;
      onSaved(saved);
      const stillDirty = !editor.state.doc.eq(
        editor.schema.nodeFromJSON(snapshot),
      );
      setDirty(stillDirty);
      onDirtyChange(stillDirty);
      setMessage(
        stillDirty ? 'Saved. Newer changes are still pending.' : 'Saved.',
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof WorkspaceRequestError
            ? error.message
            : 'The note could not be saved. Your writing is still here.',
        );
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setPending(false);
        onSavingChange(false);
      }
    }
  }

  return (
    <section aria-label="Note writing">
      {editor && <EditorToolbar editor={editor} />}
      <p id="writing-help" className="writing-help">
        Start writing, or type / at the start of a paragraph to insert a block.
      </p>
      <div className="note-body note-editor" ref={host} />
      {editor && <SlashMenu editor={editor} />}
      <div className="body-save-row">
        <button
          type="button"
          className="dialog-primary"
          disabled={!dirty || pending || saveDisabled}
          onClick={() => {
            void save();
          }}
        >
          {pending ? 'Saving note…' : 'Save note'}
        </button>
        <p role={error ? 'alert' : 'status'}>
          {error ||
            (pending
              ? 'Saving…'
              : message || (dirty ? 'Unsaved writing' : 'All writing saved.'))}
        </p>
      </div>
    </section>
  );
}
