import { useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import type { SaveCoordinator } from '../workspace/SaveCoordinator.js';
import { editorExtensions } from './extensions.js';
import type { LoadedMarkdown } from './markdown.js';
import EditorToolbar from './EditorToolbar.js';
import SlashMenu from './SlashMenu.js';
import '../workspace/note-preview.css';
import './note-editor.css';

export default function NoteEditor({
  document,
  session,
}: {
  document: Extract<LoadedMarkdown, { mode: 'rich' }>;
  session: SaveCoordinator;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const baseline = useRef(document);
  useEffect(() => {
    const capture = (node: Node) => ({
      node,
      serialize: () => baseline.current.serialize(node.toJSON()),
    });
    const instance = new Editor({
      element: host.current!,
      extensions: editorExtensions({ diagramViews: true }),
      content: baseline.current.document,
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-label': 'Note content',
          'aria-multiline': 'true',
          'aria-describedby': 'writing-help',
        },
      },
      onUpdate: ({ editor }) => session.setBody(capture(editor.state.doc)),
    });
    session.attachBody(capture(instance.state.doc));
    setEditor(instance);
    return () => instance.destroy();
  }, [session]);
  return (
    <section aria-label="Note writing">
      {editor && <EditorToolbar editor={editor} />}
      <p id="writing-help" className="visually-hidden">
        Start writing, or type / at the start of a paragraph to insert a block.
        Changes save automatically.
      </p>
      <div className="note-body note-editor" ref={host} />
      {editor && <SlashMenu editor={editor} />}
    </section>
  );
}
