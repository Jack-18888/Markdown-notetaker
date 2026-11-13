import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { MarkdownManager } from '@tiptap/markdown';
import { MermaidBlock, SourceCodeBlock } from './code-blocks.js';
import { isSafeLink } from './links.js';
import { MermaidEditorBlock } from './mermaid-node-view.js';
import { markdownLexer } from './markdown-lexer.js';
import {
  ImageParagraph,
  MarkdownAnchor,
  MarkdownImage,
} from './markdown-media.js';
import {
  MarkdownTable,
  MarkdownTableCell,
  MarkdownTableRow,
} from './markdown-table.js';

/** One extension set for compatibility checks and the mounted writing interface. */
export function editorExtensions({ diagramViews = false } = {}) {
  return [
    StarterKit.configure({
      codeBlock: false,
      paragraph: false,
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
    ImageParagraph,
    diagramViews ? MermaidEditorBlock : MermaidBlock,
    TaskList,
    TaskItem.configure({ nested: true }),
    MarkdownTable,
    MarkdownTableRow,
    MarkdownTableCell,
    MarkdownImage,
    MarkdownAnchor,
  ];
}

export function markdownManager() {
  return new MarkdownManager({
    extensions: editorExtensions(),
    // The manager uses the instance's lexer and registration methods. Its
    // declaration expects Marked 17's callable singleton rather than an instance.
    marked: markdownLexer() as unknown as MarkdownManager['instance'],
  });
}
