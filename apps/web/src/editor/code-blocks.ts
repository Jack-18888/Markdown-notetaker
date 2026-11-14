import { codeBlockSchema } from '@milkdown/kit/preset/commonmark';
import { $node } from '@milkdown/kit/utils';

/** Always choose a delimiter longer than any run inside the source. */
export function fencedSource(source: string, language: string): string {
  let longest = 2;
  for (const [run] of source.matchAll(/`+/g))
    longest = Math.max(longest, run.length);
  const fence = '`'.repeat(longest + 1);
  // A final CR must not merge with the separator into a CRLF and disappear.
  const separator = source.endsWith('\r') ? '\r' : '\n';
  return `${fence}${language}\n${source}${separator}${fence}`;
}

export const mermaidSchema = $node('mermaid', () => ({
  group: 'block',
  atom: true,
  code: true,
  attrs: { source: { default: '', validate: 'string' } },
  toDOM: (node) => [
    'pre',
    { 'data-mermaid': '' },
    ['code', {}, node.attrs.source],
  ],
  parseMarkdown: {
    match: (node) => node.type === 'mermaid',
    runner: (state, node, type) => {
      state.addNode(type, { source: node.value });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'mermaid',
    runner: (state, node) => {
      // A raw block here carries a fenced diagram, including its exact payload.
      state.addNode(
        'html',
        undefined,
        fencedSource(node.attrs.source, 'mermaid'),
      );
    },
  },
}));

export const literalCodeBlock = codeBlockSchema.extendSchema(
  (base) => (ctx) => {
    const spec = base(ctx);
    return {
      ...spec,
      parseMarkdown: {
        ...spec.parseMarkdown,
        match: (node) => node.type === 'code' && node.lang !== 'mermaid',
      },
    };
  },
);
