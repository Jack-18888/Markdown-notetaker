import { Lexer, type Token, type Tokens } from 'marked';
import {
  isLocalImageUrl,
  utf8ByteLength,
} from '@markdown-note-taker/contracts';
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
  'image',
]);

function rawWithoutCodespans(token: Token): string {
  if (token.type === 'codespan') return 'x';
  const nested =
    'tokens' in token && Array.isArray(token.tokens) ? token.tokens : null;
  if (!nested?.length) return token.raw;

  let out = '';
  let pos = 0;
  for (const child of nested) {
    const idx = token.raw.indexOf(child.raw, pos);
    if (idx === -1) {
      out += rawWithoutCodespans(child);
      continue;
    }
    out += token.raw.slice(pos, idx) + rawWithoutCodespans(child);
    pos = idx + child.raw.length;
  }
  return out + token.raw.slice(pos);
}

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
    const pending: Array<{
      token: Token;
      depth: number;
      midLineStart?: boolean;
    }> = tokens.map((token) => ({ token, depth: 0 }));
    let count = 0;
    while (pending.length) {
      const { token, depth, midLineStart } = pending.pop()!;
      if (++count > editorLimits.tokens || depth > editorLimits.depth)
        return 'conversion-limit';
      // Milkdown uses an attribute-free, standalone <br /> for empty blocks.
      if (
        token.type === 'html' &&
        token.block &&
        /^<br \/>\s*$/.test(token.raw)
      )
        continue;
      if (!supportedTokens.has(token.type)) return 'unsupported';
      // Multi-word footnote definitions bypass Marked's link map; reject them explicitly
      // while excluding inline code spans that happen to start a line with [^label]: text.
      if (
        (token.type === 'paragraph' ||
          (token.type === 'text' &&
            'tokens' in token &&
            Array.isArray(token.tokens) &&
            Boolean(token.raw))) &&
        /^[ \t]{0,3}\[\^[^\]\s]+\]:/m.test(
          (midLineStart ? 'x ' : '') + rawWithoutCodespans(token),
        )
      )
        return 'unsupported';
      if (token.type === 'image' && !isLocalImageUrl(token.href))
        return 'unsupported';
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
      const taskItem = token.type === 'list_item' && Boolean(token.task);
      let afterCheckbox = false;
      for (const child of children) {
        const startsMidLine = afterCheckbox;
        afterCheckbox = taskItem && child.type === 'checkbox';
        pending.push({
          token: child,
          depth: depth + 1,
          midLineStart: startsMidLine,
        });
      }
    }
    return null;
  } catch {
    return 'conversion-failed';
  }
}
