import { getSchema, type JSONContent } from '@tiptap/core';
import { markdownSchema } from '@markdown-note-taker/contracts';
import { editorExtensions, markdownManager } from './extensions.js';
import { isSafeLink } from './links.js';
import { restoreMermaidSource } from './mermaid-source.js';
import {
  assessSource,
  editorLimits,
  type FallbackReason,
} from './source-policy.js';

export class MarkdownConversionError extends Error {
  constructor() {
    super(
      'This edit cannot be converted safely. Keep the current document and original source.',
    );
  }
}

export type LoadedMarkdown =
  | { mode: 'source'; source: string; reason: FallbackReason }
  | {
      mode: 'rich';
      source: string;
      document: JSONContent;
      serialize(document: JSONContent): string;
    };

const schema = getSchema(editorExtensions());
const manager = markdownManager();

/** Bound work before recursive schema validation and serialization. */
function checkedDocument(document: JSONContent) {
  const pending = [{ node: document, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (++count > editorLimits.tokens || depth > editorLimits.depth)
      throw new MarkdownConversionError();
    if (node.type === 'mermaid' && typeof node.attrs?.source !== 'string')
      throw new MarkdownConversionError();
    if (
      node.type === 'codeBlock' &&
      node.attrs?.language &&
      (typeof node.attrs.language !== 'string' ||
        !/^[a-z\d_+#.-]+$/i.test(node.attrs.language))
    )
      throw new MarkdownConversionError();
    for (const mark of node.marks ?? []) {
      if (
        mark.type === 'link' &&
        (typeof mark.attrs?.href !== 'string' || !isSafeLink(mark.attrs.href))
      )
        throw new MarkdownConversionError();
    }
    if (
      count + pending.length + (node.content?.length ?? 0) >
      editorLimits.tokens
    )
      throw new MarkdownConversionError();
    for (const child of node.content ?? [])
      pending.push({ node: child, depth: depth + 1 });
  }
  const result = schema.nodeFromJSON(document);
  result.check();
  return result;
}

function parse(source: string) {
  const document = manager.parse(source);
  if (!document.content?.length) document.content = [{ type: 'paragraph' }];
  restoreMermaidSource(document, source);
  return checkedDocument(document);
}

/** Only this boundary may load saved/imported Markdown into the rich editor. */
export function loadMarkdown(source: string): LoadedMarkdown {
  if (!markdownSchema.safeParse(source).success)
    return { mode: 'source', source, reason: 'invalid-content' };
  const reason = assessSource(source);
  if (reason) return { mode: 'source', source, reason };
  try {
    const baseline = parse(source);
    // Reject a parser/serializer mismatch before exposing an editable document.
    const normalized = manager.serialize(baseline.toJSON());
    if (assessSource(normalized) || !parse(normalized).eq(baseline))
      throw new MarkdownConversionError();
    return {
      mode: 'rich',
      source,
      document: structuredClone(baseline.toJSON()),
      serialize(document) {
        try {
          const current = checkedDocument(document);
          if (current.eq(baseline)) return source;
          const next = manager.serialize(current.toJSON());
          if (
            !markdownSchema.safeParse(next).success ||
            assessSource(next) ||
            !parse(next).eq(current)
          )
            throw new MarkdownConversionError();
          return next;
        } catch {
          throw new MarkdownConversionError();
        }
      },
    };
  } catch {
    return { mode: 'source', source, reason: 'conversion-failed' };
  }
}
