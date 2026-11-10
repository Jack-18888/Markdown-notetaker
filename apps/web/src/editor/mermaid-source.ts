import type { JSONContent } from '@tiptap/core';
import { editorLimits } from './source-policy.js';

/** Recover payload bytes before Marked normalizes line endings. Containers fall back. */
export function restoreMermaidSource(
  document: JSONContent,
  source: string,
): void {
  const sources: string[] = [];
  const lines = source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? [];
  let fence:
    | { marker: string; length: number; language: string; start: number }
    | undefined;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!.replace(/(?:\r\n|\r|\n)$/, '');
    if (fence) {
      if (
        new RegExp(`^ {0,3}${fence.marker}{${fence.length},}[ \\t]*$`).test(
          line,
        )
      ) {
        if (fence.language === 'mermaid')
          sources.push(
            lines
              .slice(fence.start, index)
              .join('')
              .replace(/(?:\r\n|\r|\n)$/, ''),
          );
        fence = undefined;
      }
    } else {
      const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (opening)
        fence = {
          marker: opening[1]![0]!,
          length: opening[1]!.length,
          language: opening[2]!.trim(),
          start: index + 1,
        };
    }
  }
  if (fence?.language === 'mermaid') throw new Error('Unclosed diagram fence.');
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
