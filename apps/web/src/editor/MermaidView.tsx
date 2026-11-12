import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { renderDiagram, type DiagramResult } from './diagram-renderer.js';
import './mermaid-view.css';

const themeQuery = '(prefers-color-scheme: dark)';
const readTheme = () => window.matchMedia(themeQuery).matches;
const subscribeTheme = (notify: () => void) => {
  const media = window.matchMedia(themeQuery);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};

export default function MermaidView({
  source,
  onChange,
  onRemove,
  onHistory,
}: {
  source: string;
  onChange(source: string): void;
  onRemove(): void;
  onHistory(redo: boolean): void;
}) {
  const id = useId();
  const dark = useSyncExternalStore(subscribeTheme, readTheme);
  const [editing, setEditing] = useState(!source.trim());
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  const [view, setView] = useState<{
    source: string;
    dark: boolean;
    result: DiagramResult;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void renderDiagram(source, controller.signal).then((result) => {
        if (result && !controller.signal.aborted)
          setView({ source, dark, result });
      });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [source, dark]);
  const current =
    view?.source === source && view.dark === dark ? view.result : null;
  return (
    <section className="mermaid-block" aria-label="Mermaid diagram">
      <div className="mermaid-actions">
        <span className="workspace-eyebrow">Mermaid</span>
        <button
          type="button"
          aria-expanded={editing}
          aria-controls={id}
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? 'Hide source' : 'Edit source'}
        </button>
        <button type="button" onClick={onRemove}>
          Remove diagram
        </button>
      </div>
      {editing && (
        <div className="mermaid-source" id={id}>
          <label htmlFor={`${id}-input`}>Mermaid source</label>
          <textarea
            ref={input}
            id={`${id}-input`}
            value={source}
            rows={6}
            spellCheck={false}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                (event.ctrlKey || event.metaKey) &&
                ['z', 'y'].includes(event.key.toLowerCase())
              ) {
                event.preventDefault();
                onHistory(event.key.toLowerCase() === 'y' || event.shiftKey);
              }
            }}
          />
        </div>
      )}
      {current?.kind === 'ready' ? (
        <div
          className="mermaid-preview"
          role="img"
          aria-label="Mermaid diagram preview"
          tabIndex={0}
          dangerouslySetInnerHTML={{ __html: current.svg }}
        />
      ) : (
        <p className="mermaid-message" role="status">
          {current?.kind === 'message'
            ? current.message
            : 'Updating diagram preview…'}
        </p>
      )}
    </section>
  );
}
