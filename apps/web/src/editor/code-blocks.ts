import { Node } from '@tiptap/core';
import CodeBlock from '@tiptap/extension-code-block';

/** Always choose a delimiter longer than any run inside the source. */
export function fencedSource(source: string, language = ''): string {
  let longest = 2;
  for (const [run] of source.matchAll(/`+/g))
    longest = Math.max(longest, run.length);
  const fence = '`'.repeat(longest + 1);
  // A final CR must not merge with the separator into a CRLF and disappear.
  const separator = source.endsWith('\r') ? '\r' : '\n';
  return `${fence}${language}\n${source}${separator}${fence}`;
}

/** Plain source only. Diagram rendering and source editing belong to later UI work. */
export const MermaidBlock = Node.create({
  name: 'mermaid',
  group: 'block',
  atom: true,
  code: true,
  addAttributes() {
    return { source: { default: '', rendered: false } };
  },
  // Do not promote pasted HTML into a trusted diagram node.
  parseHTML() {
    return [];
  },
  renderHTML({ node }) {
    return ['pre', { 'data-mermaid': '' }, ['code', {}, node.attrs.source]];
  },
  renderMarkdown(node) {
    return fencedSource(node.attrs?.source ?? '', 'mermaid');
  },
});

export const SourceCodeBlock = CodeBlock.extend({
  parseMarkdown(token, helpers) {
    if (token.lang === 'mermaid')
      return helpers.createNode('mermaid', { source: token.text ?? '' });
    return helpers.createNode(
      'codeBlock',
      { language: token.lang || null },
      token.text ? [helpers.createTextNode(token.text)] : [],
    );
  },
  renderMarkdown(node) {
    const source = (node.content ?? [])
      .map((child) => child.text ?? '')
      .join('');
    return fencedSource(source, node.attrs?.language ?? '');
  },
});
