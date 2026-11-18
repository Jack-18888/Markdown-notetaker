import {
  isLocalImageUrl,
  markdownSchema,
} from '@markdown-note-taker/contracts';
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

export function checkDocument(document: Node) {
  const pending = [{ node: document, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (++count > editorLimits.tokens || depth > editorLimits.depth)
      throw new MarkdownConversionError();
    if (
      (node.type.name === 'mermaid' && depth !== 1) ||
      (node.type.name === 'image' && !isLocalImageUrl(node.attrs.src)) ||
      node.type.name === 'image_upload' ||
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

export function roundTripDocument(document: Node, ctx: Ctx): string {
  checkDocument(document);
  const serialize = ctx.get(serializerCtx);
  const last = document.lastChild;
  // Milkdown drops one trailing empty paragraph as a typing area. Supply
  // that extra paragraph only to the serializer so real blank lines survive.
  const snapshot =
    document.childCount > 1 &&
    last?.type.name === 'paragraph' &&
    !last.content.size
      ? document.copy(document.content.addToEnd(last))
      : document;
  const serialized = serialize(snapshot);
  const next = serialized.endsWith('\n') ? serialized.slice(0, -1) : serialized;
  if (
    !markdownSchema.safeParse(next).success ||
    assessSource(next) ||
    !parse(next, ctx).eq(document)
  )
    throw new MarkdownConversionError();
  return next;
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

export function loadMarkdown(source: string, ctx: Ctx): LoadedMarkdown {
  if (!markdownSchema.safeParse(source).success)
    return { mode: 'source', source, reason: 'invalid-content' };
  const reason = assessSource(source);
  if (reason) return { mode: 'source', source, reason };
  try {
    const baseline = parse(source, ctx);
    roundTripDocument(baseline, ctx);
    return {
      mode: 'rich',
      source,
      document: baseline,
      serialize(document) {
        try {
          return document.eq(baseline)
            ? source
            : roundTripDocument(document, ctx);
        } catch {
          throw new MarkdownConversionError();
        }
      },
    };
  } catch {
    return { mode: 'source', source, reason: 'conversion-failed' };
  }
}
