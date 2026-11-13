import { Slice } from '@tiptap/pm/model';
import type { EditorProps } from '@tiptap/pm/view';
import { closeHistory } from '@tiptap/pm/history';
import { loadMarkdown } from './markdown.js';

const blockSyntax =
  /^ {0,3}(?:#{1,6}[ \t]|[-+*][ \t]|\d{1,9}[.)][ \t]|>|`{3}|~{3}|[-*_]{3,}[ \t]*\r?$|<a id=")/m;
const inlineSyntax = /\]\(|\*[^\s*]|_[^\s_]|~~|`|<br\s*\/?>| {2}\r?\n/i;
const tableOrSetext = /\n[ \t]*(?:[-=]{2,}[ \t]*$|\|)/m;

function editorCopyIsMarkdown(data: string): boolean {
  if (!data) return false;
  try {
    return JSON.parse(data)?.mode === 'markdown';
  } catch {
    return false;
  }
}

/** Rich HTML and code fields keep their ordinary clipboard behavior. */
export const pasteMarkdown: NonNullable<EditorProps['handlePaste']> = (
  view,
  event,
) => {
  const clipboard = event.clipboardData;
  const { state } = view;
  if (!clipboard || state.selection.$from.parent.type.spec.code) return false;
  const vscode = clipboard.getData('vscode-editor-data');
  const markdown = clipboard.getData('text/markdown');
  const explicit = markdown || editorCopyIsMarkdown(vscode);
  const source = markdown || clipboard.getData('text/plain');
  if (
    !source ||
    (!explicit &&
      (vscode ||
        clipboard.getData('text/html') ||
        ![blockSyntax, inlineSyntax, tableOrSetext].some((syntax) =>
          syntax.test(source),
        )))
  )
    return false;
  const loaded = loadMarkdown(source);
  if (loaded.mode !== 'rich') return false;
  const { content } = state.schema.nodeFromJSON(loaded.document);
  const first = content.firstChild;
  const insertion =
    content.childCount === 1 && first?.type.name === 'paragraph'
      ? first.content
      : content;
  if (!insertion.size) return false;
  const transaction = closeHistory(state.tr).replaceSelection(
    new Slice(insertion, 0, 0),
  );
  if (!transaction.docChanged) return false;
  view.dispatch(transaction.setMeta('uiEvent', 'paste').scrollIntoView());
  return true;
};
