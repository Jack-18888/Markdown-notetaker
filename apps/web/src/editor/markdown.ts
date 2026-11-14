import { markdownSchema } from '@markdown-note-taker/contracts';
import type { Ctx } from '@milkdown/kit/ctx';
import { remarkCtx, schemaCtx, serializerCtx } from '@milkdown/kit/core';
import type { Node } from '@milkdown/kit/prose/model';
import { ParserState, type MarkdownNode } from '@milkdown/kit/transformer';
import { isSafeLink } from './links.js';
import { mermaidSources } from './mermaid-source.js';
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
      document: Node;
      serialize(document: Node): string;
    };

function checkDocument(document: Node) {
  const pending = [{ node: document, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (++count > editorLimits.tokens || depth > editorLimits.depth)
      throw new MarkdownConversionError();
    if (
      (node.type.name === 'mermaid' && depth !== 1) ||
      node.type.name === 'image' ||
      node.type.name.startsWith('footnote') ||
      node.type.name.includes('html')
    )
      throw new MarkdownConversionError();
    if (
      node.type.name === 'code_block' &&
      node.attrs.language &&
      (!/^[a-z\d_+#.-]+$/i.test(node.attrs.language) ||
        node.attrs.language === 'mermaid')
    )
      throw new MarkdownConversionError();
    for (const mark of node.marks) {
      if (mark.type.name === 'link' && !isSafeLink(mark.attrs.href))
        throw new MarkdownConversionError();
    }
    if (count + pending.length + node.childCount > editorLimits.tokens)
      throw new MarkdownConversionError();
    node.forEach((child) => pending.push({ node: child, depth: depth + 1 }));
  }
  document.check();
}

function parse(source: string, ctx: Ctx) {
  const schema = ctx.get(schemaCtx);
  const remark = ctx.get(remarkCtx);
  const tree = remark.runSync(remark.parse(source), source) as MarkdownNode;
  const children = (tree.children as MarkdownNode[] | undefined) ?? [];
  const diagrams = mermaidSources(source);
  let index = 0;
  for (const block of children) {
    if (block.type === 'code' && block.lang === 'mermaid') {
      const payload = diagrams[index++];
      if (payload === undefined) throw new MarkdownConversionError();
      block.type = 'mermaid';
      block.value = payload;
    }
  }
  if (index !== diagrams.length) throw new MarkdownConversionError();
  // Use a fresh parser for each input, including when a prior parse throws.
  const parser = new ParserState(schema);
  parser.next(tree);
  const document = parser.toDoc() || schema.topNodeType.createAndFill()!;
  if (children.length && document.childCount !== children.length)
    throw new MarkdownConversionError();
  checkDocument(document);
  return document;
}

/** Skip the final typing paragraph, which has no Markdown representation. */
function comparable(document: Node) {
  return document.childCount > 1 &&
    document.lastChild?.type.name === 'paragraph' &&
    !document.lastChild.content.size
    ? document.cut(0, document.content.size - document.lastChild.nodeSize)
    : document;
}

export function loadMarkdown(source: string, ctx: Ctx): LoadedMarkdown {
  if (!markdownSchema.safeParse(source).success)
    return { mode: 'source', source, reason: 'invalid-content' };
  const reason = assessSource(source);
  if (reason) return { mode: 'source', source, reason };
  try {
    const baseline = parse(source, ctx);
    const serialize = ctx.get(serializerCtx);
    const roundTrip = (document: Node) => {
      checkDocument(document);
      const serialized = serialize(document);
      const next = serialized.endsWith('\n')
        ? serialized.slice(0, -1)
        : serialized;
      if (
        !markdownSchema.safeParse(next).success ||
        assessSource(next) ||
        !comparable(parse(next, ctx)).eq(comparable(document))
      )
        throw new MarkdownConversionError();
      return next;
    };
    roundTrip(baseline);
    return {
      mode: 'rich',
      source,
      document: baseline,
      serialize(document) {
        try {
          return comparable(document).eq(comparable(baseline))
            ? source
            : roundTrip(document);
        } catch {
          throw new MarkdownConversionError();
        }
      },
    };
  } catch {
    return { mode: 'source', source, reason: 'conversion-failed' };
  }
}
