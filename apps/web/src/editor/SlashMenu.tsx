import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { EditorView } from '@milkdown/kit/prose/view';
import { canRunCommand, matchingBlocks, runCommand } from './commands.js';
import { slashQuery } from './slash.js';
import { useEditorTransaction } from './useEditorTransaction.js';
import './slash-menu.css';

export default function SlashMenu({ editor }: { editor: EditorView }) {
  const state = useEditorTransaction(editor);
  const id = useId();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [choice, setChoice] = useState({ key: '', index: 0 });
  const [focused, setFocused] = useState(() => editor.hasFocus());
  const menu = useRef<HTMLDivElement>(null);
  const query = slashQuery(editor);
  const key = query
    ? `${query.range.from}:${query.range.to}:${query.query}`
    : '';
  useEffect(() => {
    if (!slashQuery(editor)) setDismissed(null);
  }, [editor, state]);
  const commands = useMemo(
    () =>
      query
        ? matchingBlocks(query.query).filter((command) =>
            canRunCommand(editor, command, query.range),
          )
        : [],
    [editor, query],
  );
  const open = !!query && focused && key !== dismissed;
  const index =
    choice.key === key
      ? Math.min(choice.index, Math.max(0, commands.length - 1))
      : 0;

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const element = menu.current;
      if (!element) return;
      const caret = editor.coordsAtPos(editor.state.selection.from);
      const height = element.offsetHeight;
      const below = caret.bottom + 8;
      element.style.left = `${Math.max(12, Math.min(caret.left, window.innerWidth - element.offsetWidth - 12))}px`;
      element.style.top = `${Math.max(12, Math.min(below + height <= window.innerHeight - 12 ? below : caret.top - height - 8, window.innerHeight - height - 12))}px`;
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [editor, open, key]);

  useEffect(() => {
    const focus = () => {
      setFocused(true);
    };
    const blur = () => {
      setFocused(false);
    };
    editor.dom.addEventListener('focus', focus);
    editor.dom.addEventListener('blur', blur);
    return () => {
      editor.dom.removeEventListener('focus', focus);
      editor.dom.removeEventListener('blur', blur);
    };
  }, [editor]);
  useEffect(() => {
    if (!open) return;
    const dom = editor.dom;
    dom.setAttribute('aria-controls', id);
    if (commands.length)
      dom.setAttribute('aria-activedescendant', `${id}-${index}`);
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === 'Escape') setDismissed(key);
        else if (event.key === 'Enter') {
          if (
            commands[index] &&
            query &&
            runCommand(editor, commands[index], query.range)
          )
            setDismissed(key);
        } else if (commands.length) {
          setChoice({
            key,
            index:
              (index + (event.key === 'ArrowDown' ? 1 : -1) + commands.length) %
              commands.length,
          });
        }
      }
    };
    // Capture before ProseMirror handles Enter/arrow keys.
    dom.addEventListener('keydown', onKey, true);
    const outside = (event: PointerEvent) => {
      if (
        !menu.current?.contains(event.target as Node) &&
        !dom.contains(event.target as Node)
      )
        setDismissed(key);
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      dom.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', outside);
      dom.removeAttribute('aria-controls');
      dom.removeAttribute('aria-activedescendant');
    };
  }, [editor, open, id, key, index, commands, query]);
  useEffect(() => {
    menu.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [key, index, open]);

  if (!open || !query) return null;
  return (
    <div ref={menu} className="slash-menu">
      <p className="workspace-eyebrow">Insert a block</p>
      <div id={id} role="listbox" aria-label="Insert block">
        {commands.map((command, item) => (
          <div
            key={command.id}
            id={`${id}-${item}`}
            role="option"
            aria-selected={item === index}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (runCommand(editor, command, query.range)) setDismissed(key);
            }}
          >
            {command.label}
          </div>
        ))}
      </div>
      {!commands.length && (
        <p role="status">No matching blocks. Keep typing or press Escape.</p>
      )}
      <p className="slash-hint">
        ↑ ↓ to choose · Enter to insert · Esc to close
      </p>
    </div>
  );
}
