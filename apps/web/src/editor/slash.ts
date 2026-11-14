import type { EditorView } from '@milkdown/kit/prose/view';

export interface SlashQuery {
  range: { from: number; to: number };
  query: string;
}

/** A slash at the start of a paragraph; never interpret code, links, or selections. */
export function slashQuery(editor: EditorView): SlashQuery | null {
  const { selection } = editor.state;
  const { $from } = selection;
  if (
    !editor.editable ||
    !selection.empty ||
    $from.parent.type.name !== 'paragraph'
  )
    return null;
  let literal = false;
  $from.parent.forEach((node) => {
    literal ||= node.marks.some((mark) =>
      ['inlineCode', 'link'].includes(mark.type.name),
    );
  });
  if (literal) return null;
  const before = $from.parent.textBetween(
    0,
    $from.parentOffset,
    '\n',
    '\ufffc',
  );
  if (!/^\/[\p{L}\p{N} -]{0,40}$/u.test(before)) return null;
  return {
    range: { from: $from.start(), to: $from.pos },
    query: before.slice(1),
  };
}
