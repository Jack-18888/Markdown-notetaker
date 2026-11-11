import { useSyncExternalStore } from 'react';
import type { Editor } from '@tiptap/core';

/** Selection changes affect command availability even when the document is unchanged. */
export function useEditorTransaction(editor: Editor) {
  return useSyncExternalStore(
    (notify) => {
      editor.on('transaction', notify);
      return () => {
        editor.off('transaction', notify);
      };
    },
    () => editor.state,
  );
}
