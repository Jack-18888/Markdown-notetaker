import { Node } from '@tiptap/core';
import type { Tokens } from 'marked';

const alignmentMarkers = {
  left: ':---',
  center: ':---:',
  right: '---:',
} as const;

function tableAlignment(value: unknown) {
  return value === 'left' || value === 'center' || value === 'right'
    ? value
    : null;
}

export const MarkdownTable = Node.create({
  name: 'markdownTable',
  group: 'block',
  content: 'markdownTableRow+',
  isolating: true,
  markdownTokenName: 'table',
  parseMarkdown(token, helpers) {
    const { header, rows } = token as Tokens.Table;
    return helpers.createNode(
      'markdownTable',
      {},
      [header, ...rows].map((row) =>
        helpers.createNode(
          'markdownTableRow',
          {},
          row.map((cell) =>
            helpers.createNode(
              'markdownTableCell',
              { header: cell.header, align: cell.align },
              helpers.parseInline(cell.tokens),
            ),
          ),
        ),
      ),
    );
  },
  renderMarkdown(node, helpers) {
    const [header, ...body] = node.content ?? [];
    const delimiter = header?.content?.map((cell) => {
      const align = tableAlignment(cell.attrs?.align);
      return align ? alignmentMarkers[align] : '---';
    });
    return [
      helpers.renderChildren(header ? [header] : []),
      `| ${delimiter?.join(' | ')} |`,
      helpers.renderChildren(body, '\n'),
    ]
      .filter(Boolean)
      .join('\n');
  },
  parseHTML() {
    return [{ tag: 'table' }];
  },
  renderHTML() {
    return [
      'div',
      {
        class: 'markdown-table',
        role: 'region',
        'aria-label': 'Markdown table',
        tabindex: 0,
      },
      ['table', ['tbody', 0]],
    ];
  },
  addKeyboardShortcuts() {
    return {
      Enter: () =>
        this.editor.isActive('markdownTableCell') &&
        this.editor.commands.setHardBreak(),
    };
  },
});

export const MarkdownTableRow = Node.create({
  name: 'markdownTableRow',
  content: 'markdownTableCell+',
  parseHTML() {
    return [{ tag: 'tr' }];
  },
  renderHTML() {
    return ['tr', 0];
  },
  renderMarkdown(node, helpers) {
    return `| ${helpers.renderChildren(node.content ?? [], ' | ')} |`;
  },
});

export const MarkdownTableCell = Node.create({
  name: 'markdownTableCell',
  content: 'inline*',
  isolating: true,
  addAttributes() {
    return {
      header: { default: false, rendered: false },
      align: {
        default: null,
        rendered: false,
        parseHTML: (element) => tableAlignment(element.style.textAlign),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'td' }, { tag: 'th', attrs: { header: true } }];
  },
  renderHTML({ node }) {
    const align = tableAlignment(node.attrs.align);
    return [
      node.attrs.header ? 'th' : 'td',
      {
        ...(node.attrs.header && { scope: 'col' }),
        ...(align && { style: `text-align: ${align}` }),
      },
      0,
    ];
  },
  renderMarkdown(node, helpers) {
    return helpers
      .renderChildren(node.content ?? [])
      .replace(/ {2}\n/g, '<br>')
      .replace(/\|/g, '\\|');
  },
});
