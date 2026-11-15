import { useEffect, useRef, useState } from 'react';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { SaveCoordinator } from '../workspace/SaveCoordinator.js';
import { openEditor } from './extensions.js';
import EditorToolbar from './EditorToolbar.js';
import SlashMenu from './SlashMenu.js';
import SourceFallback from './SourceFallback.js';
import type { FallbackReason } from './source-policy.js';
import '@milkdown/crepe/theme/classic.css';
import '@milkdown/crepe/theme/common/prosemirror.css';
import '@milkdown/crepe/theme/common/placeholder.css';
import '@milkdown/crepe/theme/common/table.css';
import '../workspace/note-preview.css';
import './note-editor.css';

export default function NoteEditor({
  source,
  session,
}: {
  source: string;
  session: SaveCoordinator;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<EditorView>();
  const [reason, setReason] = useState<FallbackReason>();
  useEffect(() => {
    let active = true;
    let capture:
      | ((
          node: EditorView['state']['doc'],
        ) => Parameters<SaveCoordinator['setBody']>[0])
      | undefined;
    const instance = openEditor({
      root: host.current!,
      source,
      interactive: true,
      onTransaction(view, previous) {
        if (!active) return;
        if (capture && !previous.doc.eq(view.state.doc))
          session.setBody(capture(view.state.doc));
      },
    });
    void instance.ready.then(
      (result) => {
        if (!active || !result) return;
        if (!('view' in result)) {
          instance.close();
          setReason(result.loaded.reason);
          return;
        }
        const { loaded, view } = result;
        capture = (node) => ({ node, serialize: () => loaded.serialize(node) });
        session.attachBody(capture(view.state.doc));
        setView(view);
      },
      () => {
        if (active) {
          instance.close();
          setReason('conversion-failed');
        }
      },
    );
    return () => {
      active = false;
      instance.close();
    };
  }, [session, source]);

  if (reason)
    return <SourceFallback document={{ mode: 'source', source, reason }} />;
  return (
    <section aria-label="Note writing">
      {view && <EditorToolbar editor={view} />}
      {view ? (
        <p id="writing-help" className="writing-help">
          Type / at the start of a paragraph to insert a block. Changes save
          automatically.
        </p>
      ) : (
        <p role="status">Preparing note…</p>
      )}
      <div className="note-body note-editor" ref={host} hidden={!view} />
      {view && <SlashMenu editor={view} />}
    </section>
  );
}
