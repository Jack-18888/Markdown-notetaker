import {
  lift,
  setBlockType,
  toggleMark,
  wrapIn,
} from '@milkdown/kit/prose/commands';
import { redo, undo } from '@milkdown/kit/prose/history';
import type { Mark, Node } from '@milkdown/kit/prose/model';
import { liftListItem, wrapInList } from '@milkdown/kit/prose/schema-list';
import {
  addColumnAfter,
  addRowAfter,
  deleteColumn,
  deleteRow,
  isInTable,
  selectedRect,
} from '@milkdown/kit/prose/tables';
import {
  AllSelection,
  EditorState,
  Selection,
  TextSelection,
  type Command,
  type Transaction,
} from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { isSafeLink } from './links.js';

interface Range {
  from: number;
  to: number;
}
export interface EditorCommand {
  id: string;
  label: string;
  keywords: string;
  apply: Command;
  active?(editor: EditorView): boolean;
  topLevel?: boolean;
}

function inBlock(editor: EditorView, name: string, checked?: boolean) {
  const { $from } = textSelection(editor.state);
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === name)
      return checked === undefined || (node.attrs.checked != null) === checked;
  }
  return false;
}

function textSelection(state: EditorState) {
  const { selection, doc } = state;
  if (!(selection instanceof AllSelection)) return selection;
  const first = Selection.findFrom(doc.resolve(0), 1, true);
  const last = Selection.findFrom(doc.resolve(doc.content.size), -1, true);
  return first && last
    ? TextSelection.create(doc, first.from, last.to)
    : selection;
}

function applySteps(target: Transaction, changes: Transaction) {
  for (const step of changes.steps) target.step(step);
  target.setSelection(
    Selection.fromJSON(target.doc, changes.selection.toJSON()),
  );
  if (changes.storedMarksSet) target.setStoredMarks(changes.storedMarks);
}

function workingState(tr: Transaction) {
  return EditorState.create({
    doc: tr.doc,
    selection: tr.selection,
    storedMarks: tr.storedMarks,
  });
}

const plainText: Command = (state, dispatch) => {
  if (state.selection instanceof AllSelection) {
    const blocks: Node[] = [];
    const paragraph = state.schema.nodes.paragraph!;
    state.doc.descendants((node) => {
      if (node.isTextblock) {
        blocks.push(paragraph.create(null, node.content));
        return false;
      }
      if (
        node.type.name === 'list_item' ||
        node.type.name === 'blockquote' ||
        node.type.name === 'bullet_list' ||
        node.type.name === 'ordered_list'
      )
        return true;
      blocks.push(node);
      return false;
    });
    const tr = state.tr.replaceWith(0, state.doc.content.size, blocks);
    if (tr.doc.eq(state.doc)) return false;
    dispatch?.(tr.setSelection(new AllSelection(tr.doc)).scrollIntoView());
    return true;
  }
  const combined = state.tr.setSelection(textSelection(state));
  const apply = (command: Command) =>
    command(workingState(combined), (tr) => applySteps(combined, tr));
  const { paragraph, list_item: item } = state.schema.nodes;
  while (apply(liftListItem(item!)) || apply(lift)) {
    // Unwrap selected list items or quotes until the paragraphs can stand alone.
  }
  apply(setBlockType(paragraph!));
  if (!combined.docChanged) return false;
  dispatch?.(combined.scrollIntoView());
  return true;
};

function makeList(name: 'ordered_list' | 'bullet_list', task = false): Command {
  return (state, dispatch) =>
    wrapInList(state.schema.nodes[name]!)(
      workingState(state.tr.setSelection(textSelection(state))),
      (tr) => {
        tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (node, pos) => {
          if (node.type.name === 'list_item') {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              spread: false,
              checked: task ? false : null,
            });
          }
        });
        const combined = state.tr;
        applySteps(combined, tr);
        dispatch?.(combined.scrollIntoView());
      },
    );
}

function insertBlock(name: string, attrs?: Record<string, unknown>): Command {
  return (state, dispatch) => {
    const { $from, $to } = state.selection;
    const wholeDocument =
      $from.pos <= 1 && $to.pos >= state.doc.content.size - 1;
    if (
      name === 'mermaid' &&
      !wholeDocument &&
      ($from.depth !== 1 ||
        $to.depth !== 1 ||
        $from.parent.type.name !== 'paragraph')
    )
      return false;
    const tr = state.tr.replaceSelectionWith(
      state.schema.nodes[name]!.create(attrs),
    );
    if (!tr.docChanged) return false;
    if (tr.selection.$from.parent.type.name !== 'paragraph') {
      const end = tr.selection.$from.depth
        ? tr.selection.$from.after(1)
        : tr.selection.to;
      tr.insert(end, state.schema.nodes.paragraph!.create());
      tr.setSelection(Selection.near(tr.doc.resolve(end + 1)));
    }
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

export const blockCommands: readonly EditorCommand[] = [
  {
    id: 'paragraph',
    label: 'Text',
    keywords: 'paragraph plain',
    apply: plainText,
    active: (view) =>
      view.state.selection.$from.depth === 1 && inBlock(view, 'paragraph'),
  },
  ...[1, 2, 3, 4, 5, 6].map((level): EditorCommand => ({
    id: `heading-${level}`,
    label: `Heading ${level}`,
    keywords: `h${level} title`,
    apply: (state, dispatch) =>
      setBlockType(state.schema.nodes.heading!, { level })(state, dispatch),
    active: (view) =>
      view.state.selection.$from.parent.type.name === 'heading' &&
      view.state.selection.$from.parent.attrs.level === level,
  })),
  {
    id: 'bullet-list',
    label: 'Bullet list',
    keywords: 'unordered bullets',
    apply: makeList('bullet_list'),
    active: (view) =>
      inBlock(view, 'bullet_list') && inBlock(view, 'list_item', false),
  },
  {
    id: 'ordered-list',
    label: 'Numbered list',
    keywords: 'ordered numbers',
    apply: makeList('ordered_list'),
    active: (view) => inBlock(view, 'ordered_list'),
  },
  {
    id: 'task-list',
    label: 'Checklist',
    keywords: 'tasks todo checkbox',
    apply: makeList('bullet_list', true),
    active: (view) => inBlock(view, 'list_item', true),
  },
  {
    id: 'blockquote',
    label: 'Quote',
    keywords: 'blockquote citation',
    apply: (state, dispatch) =>
      wrapIn(state.schema.nodes.blockquote!)(state, dispatch),
    active: (view) => inBlock(view, 'blockquote'),
  },
  {
    id: 'code-block',
    label: 'Code block',
    keywords: 'fence source',
    apply: (state, dispatch) =>
      setBlockType(state.schema.nodes.code_block!)(state, dispatch),
    active: (view) => inBlock(view, 'code_block'),
  },
  {
    id: 'horizontal-rule',
    label: 'Divider',
    keywords: 'horizontal rule separator',
    apply: insertBlock('hr'),
  },
  {
    id: 'mermaid',
    label: 'Mermaid diagram',
    keywords: 'flowchart sequence',
    topLevel: true,
    apply: insertBlock('mermaid', { source: 'flowchart LR\n  A --> B' }),
  },
  {
    id: 'table',
    label: 'Table',
    keywords: 'rows columns',
    apply: (state, dispatch) => {
      const {
        table,
        table_header_row: header,
        table_header: headCell,
        table_row: row,
        table_cell: cell,
      } = state.schema.nodes;
      const first = header!.create(
        null,
        Array.from({ length: 3 }, () => headCell!.createAndFill()!),
      );
      const rows = Array.from({ length: 2 }, () =>
        row!.create(
          null,
          Array.from({ length: 3 }, () => cell!.createAndFill()!),
        ),
      );
      const tr = state.tr.replaceSelectionWith(
        table!.create(null, [first, ...rows]),
      );
      if (!tr.docChanged) return false;
      const start = tr.mapping.map(state.selection.from, -1);
      const cellSelection = Selection.findFrom(tr.doc.resolve(start), 1, true);
      if (cellSelection) tr.setSelection(cellSelection);
      dispatch?.(tr.scrollIntoView());
      return true;
    },
    active: (view) => isInTable(view.state),
  },
];

export const tableCommands: readonly EditorCommand[] = [
  { id: 'row-add', label: 'Add row', keywords: '', apply: addRowAfter },
  {
    id: 'column-add',
    label: 'Add column',
    keywords: '',
    apply: addColumnAfter,
  },
  {
    id: 'row-delete',
    label: 'Delete row',
    keywords: '',
    apply: (state, dispatch) => {
      if (!isInTable(state)) return false;
      const { top, bottom, map } = selectedRect(state);
      return (
        top > 0 && bottom - top < map.height - 1 && deleteRow(state, dispatch)
      );
    },
  },
  {
    id: 'column-delete',
    label: 'Delete column',
    keywords: '',
    apply: deleteColumn,
  },
];

function selectedMarks(editor: EditorView, name: string): Mark | undefined {
  const { doc, selection, storedMarks } = editor.state;
  const { from, to, $from, empty } = selection;
  if (empty)
    return (storedMarks ?? $from.marks()).find(
      (mark) => mark.type.name === name,
    );
  let found: Mark | undefined;
  doc.nodesBetween(from, to, (node) => {
    found ??= node.marks.find((mark) => mark.type.name === name);
  });
  return found;
}

export const formatCommands: readonly EditorCommand[] = [
  ...[
    ['bold', 'Bold', 'strong'],
    ['italic', 'Italic', 'emphasis'],
    ['strike', 'Strikethrough', 'strike_through'],
    ['code', 'Inline code', 'inlineCode'],
  ].map(([id, label, name]): EditorCommand => ({
    id: id!,
    label: label!,
    keywords: '',
    apply: (state, dispatch) =>
      toggleMark(state.schema.marks[name!]!)(state, dispatch),
    active: (view) => !!selectedMarks(view, name!),
  })),
  { id: 'undo', label: 'Undo', keywords: '', apply: undo },
  { id: 'redo', label: 'Redo', keywords: '', apply: redo },
];

export function matchingBlocks(query: string) {
  const term = query.trim().toLowerCase();
  return blockCommands.filter((command) =>
    `${command.label} ${command.keywords}`.toLowerCase().includes(term),
  );
}

function execute(
  view: EditorView,
  command: EditorCommand,
  dispatch: boolean,
  range?: Range,
) {
  if (view.isDestroyed || !view.editable) return false;
  const { state } = view;
  if (!range)
    return command.apply(state, dispatch ? view.dispatch : undefined, view);
  if (
    !Number.isInteger(range.from) ||
    !Number.isInteger(range.to) ||
    range.from < 0 ||
    range.from > range.to ||
    range.to > state.doc.content.size
  )
    return false;
  if (command.topLevel && state.doc.resolve(range.from).depth !== 1)
    return false;
  const tr = state.tr.deleteRange(range.from, range.to);
  if (!command.apply(workingState(tr), (change) => applySteps(tr, change)))
    return false;
  if (dispatch) view.dispatch(tr.scrollIntoView());
  return true;
}

export function canRunCommand(
  view: EditorView,
  command: EditorCommand,
  range?: Range,
) {
  return execute(view, command, false, range);
}

export function runCommand(
  view: EditorView,
  command: EditorCommand,
  range?: Range,
) {
  if (!execute(view, command, true, range)) return false;
  view.focus();
  return true;
}

export function editorLink(view: EditorView) {
  return selectedMarks(view, 'link')?.attrs.href as string | undefined;
}

export function setEditorLink(view: EditorView, href: string | null) {
  if (
    view.isDestroyed ||
    !view.editable ||
    (href !== null && !isSafeLink(href))
  )
    return false;
  const { state } = view;
  const { $from } = state.selection;
  let { from, to } = state.selection;
  const link = state.schema.marks.link!;
  const existing = selectedMarks(view, 'link');
  if (existing && $from.sameParent(state.selection.$to)) {
    const spans: { from: number; to: number; linked: boolean }[] = [];
    $from.parent.forEach((node: Node, offset) => {
      const start = $from.start() + offset;
      spans.push({
        from: start,
        to: start + node.nodeSize,
        linked: existing.isInSet(node.marks) !== undefined,
      });
    });
    for (const span of spans.toReversed()) {
      if (span.linked && span.from < from && span.to >= from) from = span.from;
    }
    for (const span of spans) {
      if (span.linked && span.from <= to && span.to > to) to = span.to;
    }
  }
  if (from === to) return false;
  const tr = state.tr.removeMark(from, to, link);
  if (href !== null)
    tr.addMark(from, to, link.create({ href, title: existing?.attrs.title }));
  if (!tr.docChanged) return false;
  view.dispatch(tr.scrollIntoView());
  return true;
}
