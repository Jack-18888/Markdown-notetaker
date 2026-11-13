import type { JSONContent } from '@tiptap/core';
import { lexMarkdown } from './markdown-lexer.js';
import { editorLimits } from './source-policy.js';

/** Recover only real top-level code tokens, mapped back to the original bytes. */
export function restoreMermaidSource(
  document: JSONContent,
  source: string,
): void {
  const sources: string[] = [];
  const normalized = source.replace(/\r\n|\r/g, '\n');
  const originalOffsets = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\r' && source[index + 1] === '\n') index++;
    originalOffsets.push(index + 1);
  }
  let offset = 0;
  for (const token of lexMarkdown(normalized)) {
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
  let index = 0;
  let count = 0;
  const pending = [document];
  while (pending.length) {
    if (++count > editorLimits.tokens)
      throw new Error('Document exceeds conversion limit.');
    const node = pending.pop()!;
    if (node.type === 'mermaid') {
      const source = sources[index++];
      if (source === undefined) throw new Error('Diagram source mismatch.');
      node.attrs = { ...node.attrs, source };
    }
    // Visit in document order, including diagrams inside allowed future containers.
    for (let child = (node.content?.length ?? 0) - 1; child >= 0; child--)
      pending.push(node.content![child]!);
  }
  if (index !== sources.length) throw new Error('Diagram source mismatch.');
}
