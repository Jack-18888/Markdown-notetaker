import type { Editor, Range } from '@tiptap/core';

export interface SlashQuery {
  range: Range;
  query: string;
}

/** A slash at the start of a paragraph; never interpret code, links, or selections. */
export function slashQuery(editor: Editor): SlashQuery | null {
  const { selection } = editor.state;
  const { $from } = selection;
  if (
    !editor.isEditable ||
    !selection.empty ||
    $from.parent.type.name !== 'paragraph'
  )
    return null;
  if (
    $from.parent.content.content.some((node) =>
      node.marks.some((mark) => ['code', 'link'].includes(mark.type.name)),
    )
  )
    return null;
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
