import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Markdown, MarkdownManager } from '@tiptap/markdown';
import { MermaidBlock, SourceCodeBlock } from './code-blocks.js';
import { isSafeLink } from './links.js';
import { MermaidEditorBlock } from './mermaid-node-view.js';

/** One extension set for compatibility checks and the mounted writing interface. */
export function editorExtensions({ diagramViews = false } = {}) {
  return [
    StarterKit.configure({
      codeBlock: false,
      underline: false,
      trailingNode: false,
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        isAllowedUri: isSafeLink,
      },
    }),
    SourceCodeBlock,
    diagramViews ? MermaidEditorBlock : MermaidBlock,
    TaskList,
    TaskItem.configure({ nested: true }),
    Markdown,
  ];
}

export function markdownManager() {
  return new MarkdownManager({ extensions: editorExtensions() });
}
