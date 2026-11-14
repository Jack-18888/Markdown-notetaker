import { Lexer } from 'marked';

/** Recover only real top-level code tokens, mapped back to the original bytes. */
export function mermaidSources(source: string): string[] {
  const sources: string[] = [];
  const normalized = source.replace(/\r\n|\r/g, '\n');
  const originalOffsets = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\r' && source[index + 1] === '\n') index++;
    originalOffsets.push(index + 1);
  }
  let offset = 0;
  for (const token of Lexer.lex(normalized, { gfm: true })) {
    if (!normalized.startsWith(token.raw, offset))
      throw new Error('Token source mismatch.');
    const start = offset;
    offset += token.raw.length;
    if (token.type !== 'code' || token.lang !== 'mermaid') continue;
    const raw = source.slice(originalOffsets[start], originalOffsets[offset]);
    const lines = raw.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? [];
    const opening = /^ {0,3}(`{3,}|~{3,})[ \t]*mermaid[ \t]*$/.exec(
      lines[0]!.replace(/(?:\r\n|\r|\n)$/, ''),
    );
    if (!opening) throw new Error('Diagram fence mismatch.');
    const fence = opening[1]!;
    const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`);
    const end = lines.findIndex(
      (line, index) =>
        index > 0 && closing.test(line.replace(/(?:\r\n|\r|\n)$/, '')),
    );
    if (end < 0) throw new Error('Unclosed diagram fence.');
    sources.push(
      lines
        .slice(1, end)
        .join('')
        .replace(/(?:\r\n|\r|\n)$/, ''),
    );
  }
  if (offset !== normalized.length) throw new Error('Token source mismatch.');
  return sources;
}
