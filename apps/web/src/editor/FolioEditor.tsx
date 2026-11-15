import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { Definition, FootnoteDefinition, RootContent } from 'mdast';
import type { SaveCoordinator } from '../workspace/SaveCoordinator.js';
import {
  parseFolio,
  renameFootnotes,
  type FolioDocument,
} from './folio-markdown.js';
import { normalizedSource, reconcileSource } from './source-text.js';
import { FolioRich } from './FolioRich.js';
import { Literal } from './FolioBlocks.js';
import type { References } from './FolioInline.js';

type Mode = 'editor' | 'markdown';
const HISTORY_LIMIT = 100;

function readReferences(document: FolioDocument | null) {
  const links = new Map<string, Definition>();
  const footnotes = new Map<string, FootnoteDefinition>();
  const pending: RootContent[] = (document?.blocks ?? [])
    .flatMap((block) => (block.kind === 'markdown' ? [block.node] : []))
    .reverse();
  while (pending.length) {
    const node = pending.pop()!;
    if (node.type === 'definition' && !links.has(node.identifier))
      links.set(node.identifier, node);
    if (node.type === 'footnoteDefinition' && !footnotes.has(node.identifier))
      footnotes.set(node.identifier, node);
    if ('children' in node)
      for (let index = node.children.length - 1; index >= 0; index--)
        pending.push(node.children[index]!);
  }
  return { links, footnotes };
}

export default function FolioEditor({
  source,
  session,
  toolbar,
}: {
  source: string;
  session: SaveCoordinator;
  toolbar: HTMLElement | null;
}) {
  const [draft, setDraft] = useState(source);
  const [mode, setMode] = useState<Mode>('editor');
  const [printing, setPrinting] = useState(false);
  const [issue, setIssue] = useState('');
  const [copy, setCopy] = useState('');
  const [reset, setReset] = useState(0);
  const exactDraft = useRef(draft);
  const failed = useRef(false);
  const history = useRef<{ undo: string[]; redo: string[] }>({
    undo: [],
    redo: [],
  });
  const paste = useRef<string>(undefined);
  const typing = useRef<{ field: Element; at: number } | null>(null);

  const parsed = useMemo(
    () => (mode === 'editor' || printing ? parseFolio(draft) : null),
    [draft, mode, printing],
  );
  const effectiveMode = mode === 'editor' && !parsed ? 'markdown' : mode;
  useEffect(() => {
    session.attachBody();
  }, [session]);

  useEffect(() => {
    const prepare = () => flushSync(() => setPrinting(true));
    const finish = () => setPrinting(false);
    window.addEventListener('beforeprint', prepare);
    window.addEventListener('afterprint', finish);
    return () => {
      window.removeEventListener('beforeprint', prepare);
      window.removeEventListener('afterprint', finish);
    };
  }, []);

  function commit(next: string) {
    if (next === exactDraft.current && !failed.current) return;
    if (failed.current) {
      failed.current = false;
      setIssue('');
    }
    exactDraft.current = next;
    setDraft(next);
    session.setBody(next);
  }

  function edit(next: string, groupTyping = false) {
    const previous = exactDraft.current;
    if (next !== previous) {
      const { undo, redo } = history.current;
      const field = document.activeElement;
      const textField =
        groupTyping && field instanceof HTMLElement && field.isContentEditable
          ? field
          : null;
      const prior = typing.current;
      const now = Date.now();
      if (
        !textField ||
        !prior ||
        prior.field !== textField ||
        now - prior.at > 550
      )
        undo.push(previous);
      typing.current = textField ? { field: textField, at: now } : null;
      if (undo.length > HISTORY_LIMIT) undo.shift();
      redo.length = 0;
    }
    commit(next);
  }

  function undoRedo(redo: boolean) {
    typing.current = null;
    if (failed.current) {
      if (!redo) {
        commit(exactDraft.current);
        setReset((value) => value + 1);
      }
      return;
    }
    const from = redo ? history.current.redo : history.current.undo;
    const to = redo ? history.current.undo : history.current.redo;
    const next = from.pop();
    if (next === undefined) return;
    to.push(exactDraft.current);
    commit(next);
  }

  function conversionFailed(message: string) {
    failed.current = true;
    setIssue(message);
    session.setBody({ error: message });
  }

  const { links, footnotes } = useMemo(() => readReferences(parsed), [parsed]);
  const references: References = {
    links,
    footnotes,
    renameFootnote(from, to) {
      if (!parsed) return;
      edit(renameFootnotes(parsed, from, to));
    },
  };

  const controls = (
    <div className="folio-note-controls no-print">
      <div
        className="folio-view-toggle"
        aria-label="Editor view mode"
        role="group"
      >
        <button
          type="button"
          aria-pressed={effectiveMode === 'editor'}
          onClick={() => setMode('editor')}
        >
          Editor
        </button>
        <button
          type="button"
          aria-pressed={effectiveMode === 'markdown'}
          aria-disabled={Boolean(issue)}
          onClick={() => {
            if (!failed.current) setMode('markdown');
          }}
        >
          Markdown
        </button>
      </div>
      <button
        type="button"
        className="quiet-button"
        disabled={!issue && history.current.undo.length === 0}
        onClick={() => undoRedo(false)}
      >
        Undo
      </button>
      <button
        type="button"
        className="quiet-button"
        disabled={Boolean(issue) || history.current.redo.length === 0}
        onClick={() => undoRedo(true)}
      >
        Redo
      </button>
      <button
        type="button"
        className="quiet-button"
        onClick={() => {
          flushSync(() => setPrinting(true));
          window.print();
          setPrinting(false);
        }}
      >
        Print
      </button>
    </div>
  );

  return (
    <>
      {toolbar ? createPortal(controls, toolbar) : controls}
      <section
        className="folio-writing no-print"
        aria-label="Note writing"
        onKeyDown={(event) => {
          const key = event.key.toLowerCase();
          if (
            !(event.ctrlKey || event.metaKey) ||
            !['z', 'y'].includes(key) ||
            event.defaultPrevented
          )
            return;
          event.preventDefault();
          undoRedo(key === 'y' || event.shiftKey);
        }}
      >
        {issue && (
          <p className="folio-feedback" role="alert">
            {issue}
          </p>
        )}
        {effectiveMode === 'markdown' ? (
          <div
            className="folio-source note-body"
            role="region"
            aria-label="Markdown source"
          >
            {mode === 'editor' && !parsed && (
              <p role="status">
                This note is available in Markdown view. Its rich preview is
                unavailable.
              </p>
            )}
            <div className="folio-source-bar">
              <span>Markdown source</span>
              <button
                className="quiet-button"
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(exactDraft.current).then(
                    () => setCopy('Copied'),
                    () => setCopy('Copy failed'),
                  );
                }}
              >
                Copy Markdown
              </button>
              {copy && <span role="status">{copy}</span>}
            </div>
            <textarea
              aria-label="Raw Markdown source"
              value={normalizedSource(draft)}
              spellCheck={false}
              onPaste={(event) => {
                paste.current = event.clipboardData.getData('text/plain');
              }}
              onChange={(event) => {
                edit(
                  reconcileSource(
                    exactDraft.current,
                    event.currentTarget.value,
                    paste.current,
                  ),
                );
                paste.current = undefined;
              }}
            />
          </div>
        ) : (
          parsed && (
            <div
              className="note-body note-editor editor-prose"
              role="group"
              aria-label="Note content"
            >
              <FolioRich
                key={reset}
                document={parsed}
                references={references}
                onChange={edit}
                onFailure={conversionFailed}
                onHistory={undoRedo}
              />
            </div>
          )
        )}
      </section>
      {printing && (
        <div className="folio-print-view editor-prose">
          {parsed ? (
            <FolioRich
              document={parsed}
              references={references}
              onChange={() => {}}
              readonly
              onHistory={() => {}}
            />
          ) : (
            <Literal source={draft} />
          )}
        </div>
      )}
    </>
  );
}
