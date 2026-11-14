import { useSyncExternalStore } from 'react';
import type { EditorView } from '@milkdown/kit/prose/view';

const transactions = new WeakMap<EditorView, Set<() => void>>();

export function notifyEditorTransaction(view: EditorView) {
  for (const notify of transactions.get(view) ?? []) notify();
}

/** Selection changes affect command availability even when the document is unchanged. */
export function useEditorTransaction(editor: EditorView) {
  return useSyncExternalStore(
    (notify) => {
      let listeners = transactions.get(editor);
      if (!listeners) {
        listeners = new Set();
        transactions.set(editor, listeners);
      }
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => editor.state,
  );
}
