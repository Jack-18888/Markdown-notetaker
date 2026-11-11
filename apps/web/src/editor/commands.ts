import type { ChainedCommands, Editor, Range } from '@tiptap/core';
import { isSafeLink } from './links.js';

export interface EditorCommand {
  id: string;
  label: string;
  keywords: string;
  apply(chain: ChainedCommands): ChainedCommands;
  active?(editor: Editor): boolean;
  allowed?(editor: Editor, range?: Range): boolean;
}

/** Shared by block controls and slash insertion; no HTML enters commands. */
export const blockCommands: readonly EditorCommand[] = [
  {
    id: 'paragraph',
    label: 'Text',
    keywords: 'paragraph plain',
    apply: (chain) => chain.setParagraph(),
    active: (editor) => editor.isActive('paragraph'),
  },
  ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
    id: `heading-${level}`,
    label: `Heading ${level}`,
    keywords: `h${level} title`,
    apply: (chain: ChainedCommands) => chain.toggleHeading({ level }),
    active: (editor: Editor) => editor.isActive('heading', { level }),
  })),
  {
    id: 'bullet-list',
    label: 'Bullet list',
    keywords: 'unordered bullets',
    apply: (chain) => chain.toggleBulletList(),
    active: (editor) => editor.isActive('bulletList'),
  },
  {
    id: 'ordered-list',
    label: 'Numbered list',
    keywords: 'ordered numbers',
    apply: (chain) => chain.toggleOrderedList(),
    active: (editor) => editor.isActive('orderedList'),
  },
  {
    id: 'task-list',
    label: 'Checklist',
    keywords: 'tasks todo checkbox',
    apply: (chain) => chain.toggleTaskList(),
    active: (editor) => editor.isActive('taskList'),
  },
  {
    id: 'blockquote',
    label: 'Quote',
    keywords: 'blockquote citation',
    apply: (chain) => chain.toggleBlockquote(),
    active: (editor) => editor.isActive('blockquote'),
  },
  {
    id: 'code-block',
    label: 'Code block',
    keywords: 'fence source',
    apply: (chain) => chain.toggleCodeBlock(),
    active: (editor) => editor.isActive('codeBlock'),
  },
  {
    id: 'horizontal-rule',
    label: 'Divider',
    keywords: 'horizontal rule separator',
    apply: (chain) => chain.setHorizontalRule(),
  },
  {
    id: 'mermaid',
    label: 'Mermaid diagram',
    keywords: 'flowchart sequence',
    // T06 deliberately falls back for diagrams nested inside containers.
    allowed: (editor, range) => {
      const { doc, selection } = editor.state;
      const $from = range ? doc.resolve(range.from) : selection.$from;
      const $to = range ? doc.resolve(range.to) : selection.$to;
      return (
        ($from.pos === 0 && $to.pos === doc.content.size) ||
        ($from.depth === 1 &&
          $to.depth === 1 &&
          $from.parent.type.name === 'paragraph')
      );
    },
    apply: (chain) =>
      chain.insertContent([
        { type: 'mermaid', attrs: { source: 'flowchart LR\n  A --> B' } },
        { type: 'paragraph' },
      ]),
  },
];

export const formatCommands: readonly EditorCommand[] = [
  {
    id: 'bold',
    label: 'Bold',
    keywords: '',
    apply: (chain) => chain.toggleBold(),
    active: (editor) => editor.isActive('bold'),
  },
  {
    id: 'italic',
    label: 'Italic',
    keywords: '',
    apply: (chain) => chain.toggleItalic(),
    active: (editor) => editor.isActive('italic'),
  },
  {
    id: 'strike',
    label: 'Strikethrough',
    keywords: '',
    apply: (chain) => chain.toggleStrike(),
    active: (editor) => editor.isActive('strike'),
  },
  {
    id: 'code',
    label: 'Inline code',
    keywords: '',
    apply: (chain) => chain.toggleCode(),
    active: (editor) => editor.isActive('code'),
  },
  { id: 'undo', label: 'Undo', keywords: '', apply: (chain) => chain.undo() },
  { id: 'redo', label: 'Redo', keywords: '', apply: (chain) => chain.redo() },
];

export function matchingBlocks(query: string): readonly EditorCommand[] {
  const term = query.trim().toLowerCase();
  return blockCommands.filter((command) =>
    `${command.label} ${command.keywords}`.toLowerCase().includes(term),
  );
}

function validRange(editor: Editor, range?: Range) {
  return (
    !range ||
    (Number.isInteger(range.from) &&
      Number.isInteger(range.to) &&
      range.from >= 0 &&
      range.from <= range.to &&
      range.to <= editor.state.doc.content.size)
  );
}

export function canRunCommand(
  editor: Editor,
  command: EditorCommand,
  range?: Range,
): boolean {
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    !validRange(editor, range) ||
    command.allowed?.(editor, range) === false
  )
    return false;
  let chain = editor.can().chain();
  if (range) chain = chain.deleteRange(range);
  return command.apply(chain).run();
}

export function runCommand(
  editor: Editor,
  command: EditorCommand,
  range?: Range,
): boolean {
  // Tiptap chains do not roll back failed commands. Preflight before removing a slash query.
  if (!canRunCommand(editor, command, range)) return false;
  let chain = editor.chain().focus();
  if (range) chain = chain.deleteRange(range);
  return command.apply(chain).run();
}

/** A null URL explicitly removes a link. Invalid input never changes selection or marks. */
export function setEditorLink(editor: Editor, href: string | null): boolean {
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    (href !== null && !isSafeLink(href))
  )
    return false;
  const apply = (chain: ChainedCommands) =>
    href === null
      ? chain.extendMarkRange('link').unsetLink()
      : chain.extendMarkRange('link').setLink({ href });
  if (!apply(editor.can().chain()).run()) return false;
  return apply(editor.chain().focus()).run();
}
