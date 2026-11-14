import { Lexer, type Token, type Tokens } from 'marked';
import { utf8ByteLength } from '@markdown-note-taker/contracts';
import { isSafeLink } from './links.js';

export const editorLimits = {
  sourceBytes: 128 * 1024,
  tokens: 10_000,
  depth: 32,
} as const;
export type FallbackReason =
  | 'unsupported'
  | 'unsafe-link'
  | 'conversion-limit'
  | 'invalid-content'
  | 'conversion-failed';

const supportedTokens = new Set([
  'space',
  'code',
  'heading',
  'hr',
  'blockquote',
  'list',
  'list_item',
  'paragraph',
  'text',
  'strong',
  'em',
  'del',
  'codespan',
  'br',
  'link',
  'escape',
  'checkbox',
  'table',
]);

/** Inspect tokens before handing external source to Milkdown. */
export function assessSource(source: string): FallbackReason | null {
  if (utf8ByteLength(source) > editorLimits.sourceBytes)
    return 'conversion-limit';
  if (source.includes('\0') || source.startsWith('\ufeff'))
    return 'unsupported';
  // YAML/TOML frontmatter is metadata, not a heading or a horizontal rule.
  if (/^(---|\+\+\+)\r?\n[\s\S]*?\r?\n\1[ \t]*(?:\r?\n|$)/.test(source))
    return 'unsupported';
  try {
    const tokens = Lexer.lex(source, { gfm: true });
    // Definitions are not represented in the rich schema, including unused ones.
    if (Object.keys(tokens.links).length) return 'unsupported';
    const pending = tokens.map((token) => ({ token, depth: 0 }));
    let count = 0;
    while (pending.length) {
      const { token, depth } = pending.pop()!;
      if (++count > editorLimits.tokens || depth > editorLimits.depth)
        return 'conversion-limit';
      // Milkdown uses an attribute-free, standalone <br /> for empty blocks.
      if (
        token.type === 'html' &&
        depth === 0 &&
        /^<br \/>\s*$/.test(token.raw)
      )
        continue;
      if (!supportedTokens.has(token.type)) return 'unsupported';
      if (token.type === 'link' && !isSafeLink(token.href))
        return 'unsafe-link';
      if (token.type === 'code') {
        if (token.lang && !/^[a-z\d_+#.-]+$/i.test(token.lang))
          return 'unsupported';
        // Exact original line endings can be recovered only for top-level fences.
        if (token.lang === 'mermaid' && depth > 0) return 'unsupported';
      }
      if (token.type === 'list') {
        const tasks = token.items.filter(
          (item: Tokens.ListItem) => item.task,
        ).length;
        if (tasks && (token.ordered || tasks !== token.items.length))
          return 'unsupported';
      }
      const children: Token[] =
        token.type === 'list'
          ? token.items
          : token.type === 'table'
            ? [token.header, ...token.rows].flatMap((row: Tokens.TableCell[]) =>
                row.map(({ tokens }) => ({ type: 'text', raw: '', tokens })),
              )
            : 'tokens' in token
              ? (token.tokens ?? [])
              : [];
      if (
        token.type === 'text' &&
        children.length === 0 &&
        /\$\$|\$[^$\n]+\$/.test(token.text ?? '')
      )
        return 'unsupported';
      for (const child of children)
        pending.push({ token: child, depth: depth + 1 });
    }
    return null;
  } catch {
    return 'conversion-failed';
  }
}
