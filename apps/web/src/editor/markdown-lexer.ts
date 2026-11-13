import { Marked, type MarkedExtension } from 'marked';

export const anchorId = /^[a-z][a-z\d_-]*$/i;

const safeHtml: MarkedExtension = {
  extensions: [
    {
      name: 'markdownAnchor',
      level: 'block',
      start: (source) => source.search(/^ {0,3}<a id="/m),
      tokenizer(source) {
        const match =
          /^ {0,3}<a id="([a-z][a-z\d_-]*)"><\/a>[ \t]*(?:\n|$)/i.exec(source);
        if (match)
          return { type: 'markdownAnchor', raw: match[0], id: match[1] };
      },
    },
    {
      name: 'markdownBreak',
      level: 'inline',
      tokenizer(source) {
        const match = /^<br\s*\/?>/i.exec(source);
        if (match) return { type: 'br', raw: match[0] };
      },
    },
  ],
};

/** Give each Tiptap manager a private Marked registry for its tokenizers. */
export function markdownLexer() {
  return new Marked(safeHtml);
}

const lexer = markdownLexer();

export function lexMarkdown(source: string) {
  return lexer.lexer(source);
}
