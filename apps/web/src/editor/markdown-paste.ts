import type { Ctx } from '@milkdown/kit/ctx';
import { remarkCtx, schemaCtx, serializerCtx } from '@milkdown/kit/core';
import { type Node, Slice } from '@milkdown/kit/prose/model';
import { type MarkdownNode, ParserState } from '@milkdown/kit/transformer';
import {
  isLocalImageUrl,
  utf8ByteLength,
} from '@markdown-note-taker/contracts';
import { normalizeCodeBlockLanguage } from './crepe-bridge.js';
import { isSafeLink } from './links.js';
import { roundTripDocument } from './markdown.js';
import { assessSource, editorLimits } from './source-policy.js';

export interface PasteParseOptions {
  allowTopLevelMermaid?: boolean;
}

interface SanitizeContext {
  depth: number;
  maxDepth: number;
  inSingleLine: boolean;
  insideLink: boolean;
  allowTopLevelMermaid: boolean;
  restSource: string;
}

const maxPasteDepth = Math.max(8, editorLimits.depth - 12);

const blockLevelParents = new Set(['root', 'blockquote', 'listItem']);

const semanticHtmlSelector = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'blockquote',
  'hr',
  'a[href]',
  'img',
  'strong',
  'em',
  'del',
  's',
  'strike',
  'u',
  'sub',
  'sup',
].join(',');

/**
 * Determine whether a clipboard paste payload should be parsed as Markdown text
 * rather than handled as ProseMirror/HTML or plain text.
 */
export function shouldParseClipboardAsMarkdown(
  clipboard: DataTransfer,
): string | null {
  if (clipboard.files.length) return null;
  const markdown = clipboard.getData('text/markdown');
  const plain = clipboard.getData('text/plain');
  const text = markdown || plain;
  if (!text) return null;
  if (markdown) return markdown;

  const html = clipboard.getData('text/html');
  if (!html) return text;
  if (html.includes('data-pm-slice')) return null;

  const vscodeData = clipboard.getData('vscode-editor-data');
  if (vscodeData) {
    try {
      const parsed = JSON.parse(vscodeData) as { mode?: unknown };
      if (typeof parsed.mode === 'string') {
        return parsed.mode === 'markdown' || parsed.mode === 'mdx'
          ? text
          : null;
      }
    } catch {
      // Fall back to HTML structural check when editor metadata is malformed.
    }
  }

  return hasSemanticHtml(html) ? null : text;
}

function hasSemanticHtml(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (doc.body.querySelector(semanticHtmlSelector)) return true;

  for (const el of doc.body.querySelectorAll('b')) {
    if (el.style.fontWeight !== 'normal') return true;
  }
  for (const el of doc.body.querySelectorAll('i')) {
    if (el.style.fontStyle !== 'normal') return true;
  }
  return false;
}

function splitFrontmatter(source: string): {
  frontmatter?: { lang: 'yaml' | 'toml'; value: string };
  body: string;
} {
  const tomlMatch = source.match(/^\+\+\+\n([\s\S]*?)\n\+\+\+[ \t]*(?:\n|$)/);
  const tomlBody = tomlMatch?.[1];
  if (tomlMatch && tomlBody !== undefined) {
    return {
      frontmatter: { lang: 'toml', value: tomlBody.trimEnd() },
      body: source.slice(tomlMatch[0].length),
    };
  }

  const yamlMatch = source.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  const inner = yamlMatch?.[1];
  if (yamlMatch && inner !== undefined) {
    // Distinguish YAML frontmatter from two thematic breaks around prose.
    if (
      inner.trim().length > 0 &&
      !inner.startsWith('\n') &&
      !inner.includes('\n\n') &&
      /^[a-zA-Z0-9_.-]+[ \t]*:/m.test(inner)
    ) {
      return {
        frontmatter: { lang: 'yaml', value: inner.trimEnd() },
        body: source.slice(yamlMatch[0].length),
      };
    }
  }

  return { body: source };
}

function extractTopLevelMermaidPayload(
  node: MarkdownNode,
  source: string,
): string | null {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (typeof start !== 'number' || typeof end !== 'number' || end <= start)
    return null;

  const rawSlice = source.slice(start, end);
  const match = rawSlice.match(
    /^[ \t]*(`{3,}|~{3,})[ \t]*mermaid\b[^\n]*\n([\s\S]*)\n[ \t]*([`~]+)[ \t]*$/,
  );
  if (!match) return null;
  const [, openFence, payload, closeFence] = match;
  if (
    !openFence ||
    payload === undefined ||
    !closeFence ||
    closeFence[0] !== openFence[0] ||
    closeFence.length < openFence.length
  )
    return null;

  return payload;
}

function splitInlineText(value: string, allowBreaks: boolean): MarkdownNode[] {
  if (!value) return [];
  if (!allowBreaks) {
    const collapsed = value.replace(/\r?\n+/g, ' ');
    return collapsed ? [{ type: 'text', value: collapsed }] : [];
  }

  // Keep boundary newlines as soft breaks until enclosing inline siblings are assembled.
  const parts = value.split(/\r?\n/);
  const out: MarkdownNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part) out.push({ type: 'text', value: part });
    if (i < parts.length - 1) {
      out.push({ type: 'break', data: { isInline: true } });
    }
  }
  return out;
}

const autolinkPattern = /(?:https?:\/\/|www\.)/i;

function htmlToBlockParagraphs(rawHtml: string): MarkdownNode[] {
  const trimmed = rawHtml.trim();
  if (!trimmed || /^<br\s*\/?>$/i.test(trimmed)) return [];
  if (autolinkPattern.test(trimmed)) {
    return [{ type: 'code', lang: 'html', value: trimmed }];
  }

  const chunks = trimmed.split(/\n[ \t]*\n+/);
  const paragraphs: MarkdownNode[] = [];
  for (const chunk of chunks) {
    const children: MarkdownNode[] = [];
    for (const line of chunk.split(/\r?\n/)) {
      if (!line.trim()) continue;
      if (children.length) children.push({ type: 'break' });
      children.push({ type: 'text', value: line });
    }
    if (children.length) {
      paragraphs.push({ type: 'paragraph', children });
    }
  }
  return paragraphs;
}

function isInlineSoftBreak(node: MarkdownNode | undefined): boolean {
  return Boolean(
    node?.type === 'break' &&
    (node.data as { isInline?: boolean } | undefined)?.isInline,
  );
}

function normalizeParagraphChildren(nodes: MarkdownNode[]): MarkdownNode[] {
  const cleaned: MarkdownNode[] = [];
  for (const node of nodes) {
    if (node.type === 'break') {
      const previous = cleaned[cleaned.length - 1];
      if (!previous) continue;
      if (previous.type === 'break') {
        if (isInlineSoftBreak(previous) && !isInlineSoftBreak(node)) {
          cleaned[cleaned.length - 1] = node;
        }
        continue;
      }
      cleaned.push(node);
      continue;
    }
    cleaned.push(node);
  }
  while (cleaned.length && cleaned[cleaned.length - 1]?.type === 'break') {
    cleaned.pop();
  }
  return cleaned;
}

function formatBlockedImageText(alt: unknown, url: unknown): string {
  const altText = typeof alt === 'string' ? alt : '';
  const urlText = typeof url === 'string' ? url : '';
  if (!urlText) return `![${altText}]`;
  if (urlText.startsWith('data:')) return `![${altText || 'image'}](data:...)`;
  return `![${altText}](${urlText})`;
}

function extractFallbackText(node: MarkdownNode): string {
  if (node.type === 'inlineMath' && typeof node.value === 'string') {
    return `$${node.value}$`;
  }
  if (node.type === 'math' && typeof node.value === 'string') {
    return `$$\n${node.value}\n$$`;
  }
  if (typeof node.value === 'string') return node.value;
  if (Array.isArray(node.children)) {
    return node.children
      .map((child) => extractFallbackText(child))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function sanitizeCodeNode(
  node: MarkdownNode,
  context: SanitizeContext,
): MarkdownNode {
  const rawLang = typeof node.lang === 'string' ? node.lang.trim() : '';
  const value = typeof node.value === 'string' ? node.value : '';

  if (
    rawLang === 'mermaid' &&
    context.allowTopLevelMermaid &&
    context.depth === 0
  ) {
    const payload = extractTopLevelMermaidPayload(node, context.restSource);
    if (payload !== null && !/^[ \t]*`{3,}/m.test(payload)) {
      return {
        type: 'mermaid',
        value: payload,
      };
    }
  }

  // Crepe's blockLatexSchema serializes any latex fence as $$...$$ which re-parses as LaTeX.
  let lang =
    rawLang.toLowerCase() === 'latex'
      ? 'LaTeX'
      : rawLang
        ? normalizeCodeBlockLanguage(rawLang)
        : '';
  if (lang === 'mermaid') lang = 'text';
  if (lang && !/^[a-z\d_+#.-]+$/i.test(lang)) {
    lang = lang.replace(/[^a-z\d_+#.-]/gi, '') || 'text';
  }

  return {
    type: 'code',
    lang: lang || undefined,
    value,
  };
}

function sanitizeListNode(
  node: MarkdownNode,
  context: SanitizeContext,
): MarkdownNode[] {
  const ordered = Boolean(node.ordered);
  const items = Array.isArray(node.children) ? node.children : [];
  if (context.depth + 2 >= context.maxDepth) {
    return flattenContainerChildren(items, context);
  }

  const sanitizedItems: MarkdownNode[] = [];
  const startOrder = typeof node.start === 'number' ? node.start : 1;
  for (const [index, rawItem] of items.entries()) {
    const itemChildren = sanitizeBlockNodes(
      Array.isArray(rawItem.children) ? rawItem.children : [],
      { ...context, depth: context.depth + 2 },
    );
    const blocks = itemChildren.length
      ? itemChildren
      : [{ type: 'paragraph', children: [] }];
    // Ensure a list item always begins with a paragraph so Milkdown's list_item
    // schema stays valid if its original first block dropped or transformed.
    const ensuredBlocks =
      blocks[0]?.type === 'paragraph'
        ? blocks
        : [{ type: 'paragraph', children: [] }, ...blocks];

    const sanitizedItem: MarkdownNode & { label?: number } = {
      ...rawItem,
      type: 'listItem',
      spread: rawItem.spread,
      checked: typeof rawItem.checked === 'boolean' ? rawItem.checked : null,
      children: ensuredBlocks,
    };
    if (ordered) {
      sanitizedItem.label = startOrder + index;
    } else {
      delete sanitizedItem.label;
    }
    sanitizedItems.push(sanitizedItem);
  }

  const taskCount = sanitizedItems.filter(
    (item) => typeof item.checked === 'boolean',
  ).length;

  if (taskCount > 0) {
    if (ordered) {
      for (const item of sanitizedItems) {
        if (typeof item.checked !== 'boolean') continue;
        const marker = item.checked ? '[x]' : '[ ]';
        item.checked = null;
        const firstParagraph = item.children?.[0];
        if (firstParagraph?.type === 'paragraph') {
          firstParagraph.children = [
            { type: 'inlineCode', value: marker },
            { type: 'text', value: ' ' },
            ...(firstParagraph.children ?? []),
          ];
        }
      }
    } else if (taskCount !== sanitizedItems.length) {
      for (const item of sanitizedItems) {
        if (typeof item.checked !== 'boolean') {
          item.checked = false;
        }
      }
    }
  }

  return [
    {
      type: 'list',
      ordered,
      start: ordered ? node.start : undefined,
      spread: node.spread,
      children: sanitizedItems,
    },
  ];
}

function flattenContainerChildren(
  items: MarkdownNode[],
  context: SanitizeContext,
): MarkdownNode[] {
  const flattened: MarkdownNode[] = [];
  for (const child of items) {
    if (child.type === 'listItem') {
      flattened.push(
        ...sanitizeBlockNodes(
          Array.isArray(child.children) ? child.children : [],
          context,
        ),
      );
    } else {
      flattened.push(...sanitizeBlockNode(child, context));
    }
  }
  return flattened;
}

function sanitizeInlineNode(
  node: MarkdownNode,
  context: SanitizeContext,
): MarkdownNode[] {
  const allowBreaks = !context.inSingleLine && !context.insideLink;

  switch (node.type) {
    case 'text': {
      const value = typeof node.value === 'string' ? node.value : '';
      return splitInlineText(value, allowBreaks);
    }
    case 'break': {
      if (!allowBreaks) return [{ type: 'text', value: ' ' }];
      const isInline = Boolean(
        (node.data as { isInline?: boolean } | undefined)?.isInline,
      );
      return [
        isInline
          ? { type: 'break', data: { isInline: true } }
          : { type: 'break' },
      ];
    }
    case 'inlineCode':
      return [
        {
          type: 'inlineCode',
          value:
            typeof node.value === 'string'
              ? node.value.replace(/\r?\n+/g, ' ')
              : '',
        },
      ];
    case 'inlineMath': {
      const value = typeof node.value === 'string' ? node.value : '';
      if (!value) return [];
      const normalizedValue = context.inSingleLine
        ? value.replace(/\r?\n+/g, ' ')
        : value;
      return normalizedValue
        ? [{ type: 'inlineMath', value: normalizedValue }]
        : [];
    }
    case 'html': {
      const raw = typeof node.value === 'string' ? node.value : '';
      if (/^<br\s*\/?>$/i.test(raw.trim())) {
        return allowBreaks
          ? [{ type: 'break' }]
          : [{ type: 'text', value: ' ' }];
      }
      if (autolinkPattern.test(raw)) {
        return [{ type: 'inlineCode', value: raw.replace(/\r?\n+/g, ' ') }];
      }
      return splitInlineText(raw, allowBreaks);
    }
    case 'strong':
    case 'emphasis':
    case 'delete': {
      const children = sanitizeInlineNodes(
        Array.isArray(node.children) ? node.children : [],
        context,
      );
      return children.length ? [{ type: node.type, children }] : [];
    }
    case 'link': {
      const url = typeof node.url === 'string' ? node.url : '';
      const children = sanitizeInlineNodes(
        Array.isArray(node.children) ? node.children : [],
        { ...context, insideLink: true },
      );
      if (!url || !isSafeLink(url)) {
        if (children.length) return children;
        return url ? [{ type: 'text', value: url }] : [];
      }
      const title =
        typeof node.title === 'string'
          ? node.title.replace(/\r?\n+/g, ' ')
          : undefined;
      return [
        {
          type: 'link',
          url,
          title,
          children: children.length ? children : [{ type: 'text', value: url }],
        },
      ];
    }
    case 'image': {
      const url = typeof node.url === 'string' ? node.url : '';
      if (isLocalImageUrl(url)) {
        return [
          {
            type: 'image',
            url,
            alt: typeof node.alt === 'string' ? node.alt : undefined,
            title:
              typeof node.title === 'string'
                ? node.title.replace(/\r?\n+/g, ' ')
                : undefined,
          },
        ];
      }
      return [
        {
          type: 'inlineCode',
          value: formatBlockedImageText(node.alt, url),
        },
      ];
    }
    case 'imageReference':
      return [
        {
          type: 'text',
          value: `![${typeof node.alt === 'string' ? node.alt : (node.label ?? node.identifier ?? '')}]`,
        },
      ];
    case 'linkReference': {
      const children = sanitizeInlineNodes(
        Array.isArray(node.children) ? node.children : [],
        context,
      );
      return children.length
        ? children
        : [
            {
              type: 'text',
              value: `[${node.label ?? node.identifier ?? ''}]`,
            },
          ];
    }
    case 'footnoteReference': {
      const label =
        typeof node.label === 'string'
          ? node.label
          : typeof node.identifier === 'string'
            ? node.identifier
            : 'note';
      return [{ type: 'text', value: `[^${label}]` }];
    }
    default: {
      const fallback = extractFallbackText(node);
      return splitInlineText(fallback, allowBreaks);
    }
  }
}

function sanitizeInlineNodes(
  nodes: MarkdownNode[],
  context: SanitizeContext,
): MarkdownNode[] {
  const out: MarkdownNode[] = [];
  for (const child of nodes) {
    out.push(...sanitizeInlineNode(child, context));
  }
  return out;
}

function sanitizeFootnoteDefinition(
  node: MarkdownNode,
  context: SanitizeContext,
): MarkdownNode[] {
  const label =
    typeof node.label === 'string'
      ? node.label
      : typeof node.identifier === 'string'
        ? node.identifier
        : 'note';
  const marker = `[^${label}]:`;
  const blocks = sanitizeBlockNodes(
    Array.isArray(node.children) ? node.children : [],
    context,
  );
  if (blocks[0]?.type === 'paragraph') {
    blocks[0] = {
      type: 'paragraph',
      children: normalizeParagraphChildren([
        { type: 'inlineCode', value: marker },
        { type: 'text', value: ' ' },
        ...(blocks[0].children ?? []),
      ]),
    };
    return blocks;
  }
  return [
    {
      type: 'paragraph',
      children: [{ type: 'inlineCode', value: marker }],
    },
    ...blocks,
  ];
}

function sanitizeTableNode(
  node: MarkdownNode,
  context: SanitizeContext,
): MarkdownNode[] {
  const rows = Array.isArray(node.children) ? node.children : [];
  const sanitizedRows: MarkdownNode[] = [];
  for (const row of rows) {
    if (row.type !== 'tableRow') continue;
    const cells = Array.isArray(row.children) ? row.children : [];
    sanitizedRows.push({
      type: 'tableRow',
      children: cells.map((cell) => ({
        type: 'tableCell',
        children: sanitizeInlineNodes(
          Array.isArray(cell.children) ? cell.children : [],
          { ...context, depth: context.depth + 2, inSingleLine: true },
        ),
      })),
    });
  }
  if (!sanitizedRows.length) return [];
  return [
    {
      type: 'table',
      align: node.align,
      children: sanitizedRows,
    },
  ];
}

function sanitizeBlockNode(
  node: MarkdownNode,
  context: SanitizeContext,
): MarkdownNode[] {
  switch (node.type) {
    case 'paragraph': {
      const rawChildren = Array.isArray(node.children) ? node.children : [];
      if (
        rawChildren.length === 1 &&
        rawChildren[0]?.type === 'html' &&
        typeof rawChildren[0].value === 'string' &&
        /^<br\s*\/?>\s*$/i.test(rawChildren[0].value)
      ) {
        return [{ type: 'paragraph', children: [] }];
      }
      const children = normalizeParagraphChildren(
        sanitizeInlineNodes(rawChildren, {
          ...context,
          depth: context.depth + 1,
          inSingleLine: false,
        }),
      );
      if (!children.length && rawChildren.length) return [];
      return [{ type: 'paragraph', children }];
    }
    case 'heading': {
      const rawDepth = typeof node.depth === 'number' ? node.depth : 1;
      const depth = Math.min(6, Math.max(1, rawDepth));
      const children = sanitizeInlineNodes(
        Array.isArray(node.children) ? node.children : [],
        { ...context, depth: context.depth + 1, inSingleLine: true },
      );
      return [{ type: 'heading', depth, children }];
    }
    case 'thematicBreak':
      return [{ type: 'thematicBreak' }];
    case 'blockquote': {
      const rawChildren = Array.isArray(node.children) ? node.children : [];
      if (context.depth + 1 >= context.maxDepth) {
        return sanitizeBlockNodes(rawChildren, context);
      }
      const children = sanitizeBlockNodes(rawChildren, {
        ...context,
        depth: context.depth + 1,
      });
      return [
        {
          type: 'blockquote',
          children: children.length
            ? children
            : [{ type: 'paragraph', children: [] }],
        },
      ];
    }
    case 'list':
      return sanitizeListNode(node, context);
    case 'code':
    case 'mermaid':
      return [sanitizeCodeNode(node, context)];
    case 'math':
      return [
        sanitizeCodeNode(
          {
            ...node,
            type: 'code',
            lang: 'LaTeX',
            value: typeof node.value === 'string' ? node.value : '',
          },
          context,
        ),
      ];
    case 'table':
      return sanitizeTableNode(node, context);
    case 'html': {
      const raw = typeof node.value === 'string' ? node.value : '';
      return htmlToBlockParagraphs(raw);
    }
    case 'footnoteDefinition':
      return sanitizeFootnoteDefinition(node, context);
    case 'definition':
    case 'yaml':
    case 'toml':
      return [];
    default: {
      if (Array.isArray(node.children) && node.children.length) {
        const hasBlockChild = node.children.some(
          (child) =>
            blockLevelParents.has(child.type) ||
            child.type === 'paragraph' ||
            child.type === 'heading' ||
            child.type === 'list' ||
            child.type === 'blockquote' ||
            child.type === 'code',
        );
        if (hasBlockChild) {
          return sanitizeBlockNodes(node.children, context);
        }
      }
      const fallback = extractFallbackText(node);
      return fallback ? htmlToBlockParagraphs(fallback) : [];
    }
  }
}

function sanitizeBlockNodes(
  nodes: MarkdownNode[],
  context: SanitizeContext,
): MarkdownNode[] {
  const out: MarkdownNode[] = [];
  for (const child of nodes) {
    out.push(...sanitizeBlockNode(child, context));
  }
  return out;
}

function blockToLiteralParagraphs(block: MarkdownNode): MarkdownNode[] {
  if (block.type === 'mermaid' || block.type === 'code') {
    const value = typeof block.value === 'string' ? block.value : '';
    return value ? [{ type: 'code', lang: 'text', value }] : [];
  }
  const text = extractFallbackText(block).trim();
  if (!text) return [];
  if (autolinkPattern.test(text)) {
    return [{ type: 'code', lang: 'text', value: text }];
  }
  return htmlToBlockParagraphs(text);
}

function parseAstToDoc(blocks: MarkdownNode[], ctx: Ctx): Node | null {
  if (!blocks.length) return null;
  try {
    const schema = ctx.get(schemaCtx);
    const parser = new ParserState(schema);
    parser.next({ type: 'root', children: blocks });
    return parser.toDoc();
  } catch {
    return null;
  }
}

function canRoundTrip(document: Node | null, ctx: Ctx): document is Node {
  if (!document) return false;
  try {
    roundTripDocument(document, ctx);
    return true;
  } catch {
    return false;
  }
}

function countDocumentNodes(document: Node, limit: number): number {
  let count = 1;
  if (count > limit) return count;
  document.descendants(() => {
    if (count > limit) return false;
    count++;
    return count <= limit;
  });
  return count;
}

function trySerializeForPolicy(document: Node, ctx: Ctx): string | null {
  try {
    const serialize = ctx.get(serializerCtx);
    const last = document.lastChild;
    const snapshot =
      document.childCount > 1 &&
      last?.type.name === 'paragraph' &&
      !last.content.size
        ? document.copy(document.content.addToEnd(last))
        : document;
    const serialized = serialize(snapshot);
    return serialized.endsWith('\n') ? serialized.slice(0, -1) : serialized;
  } catch {
    return null;
  }
}

function isAggregateLimitFailure(document: Node | null, ctx: Ctx): boolean {
  if (!document) return false;
  if (countDocumentNodes(document, editorLimits.tokens) > editorLimits.tokens) {
    return true;
  }
  const next = trySerializeForPolicy(document, ctx);
  if (next === null) return false;
  return (
    utf8ByteLength(next) > editorLimits.sourceBytes ||
    assessSource(next) === 'conversion-limit'
  );
}

function isolateFailingBlocks(blocks: MarkdownNode[], ctx: Ctx): Node | null {
  const recovered: MarkdownNode[] = [];
  for (const block of blocks) {
    const candidate = parseAstToDoc([block], ctx);
    if (canRoundTrip(candidate, ctx)) {
      recovered.push(block);
      continue;
    }

    const literalBlocks = blockToLiteralParagraphs(block);
    for (const literal of literalBlocks) {
      const literalDoc = parseAstToDoc([literal], ctx);
      if (canRoundTrip(literalDoc, ctx)) {
        recovered.push(literal);
      }
    }
  }

  const combined = parseAstToDoc(recovered, ctx);
  if (canRoundTrip(combined, ctx)) return combined;
  if (!combined || isAggregateLimitFailure(combined, ctx)) return null;

  // Guard against multi-block interaction edge cases by testing incrementally.
  const safeBlocks: MarkdownNode[] = [];
  for (const block of recovered) {
    const nextBlocks = [...safeBlocks, block];
    const nextDoc = parseAstToDoc(nextBlocks, ctx);
    if (isAggregateLimitFailure(nextDoc, ctx)) return null;
    if (canRoundTrip(nextDoc, ctx)) {
      safeBlocks.push(block);
      continue;
    }
    const literals = blockToLiteralParagraphs(block);
    for (const literal of literals) {
      const literalDoc = parseAstToDoc([...safeBlocks, literal], ctx);
      if (isAggregateLimitFailure(literalDoc, ctx)) return null;
      if (canRoundTrip(literalDoc, ctx)) {
        safeBlocks.push(literal);
      }
    }
  }

  const finalDoc = parseAstToDoc(safeBlocks, ctx);
  if (isAggregateLimitFailure(finalDoc, ctx)) return null;
  return canRoundTrip(finalDoc, ctx) ? finalDoc : null;
}

/**
 * Parse clipboard Markdown into a safe ProseMirror slice, isolating or converting
 * unsupported constructs without dropping supported blocks around them.
 */
export function parseMarkdownPaste(
  source: string,
  ctx: Ctx,
  options: PasteParseOptions = {},
): Slice | null {
  const normalized = source
    .replaceAll('\ufeff', '')
    .replaceAll('\0', '')
    .replace(/\r\n?/g, '\n');
  if (!normalized || utf8ByteLength(normalized) > editorLimits.sourceBytes)
    return null;

  const { frontmatter, body } = splitFrontmatter(normalized);
  const remark = ctx.get(remarkCtx);
  const tree = remark.runSync(remark.parse(body), body) as MarkdownNode;
  const rawBlocks = (tree.children as MarkdownNode[] | undefined) ?? [];

  const sanitizedBlocks: MarkdownNode[] = [];
  if (frontmatter) {
    sanitizedBlocks.push(
      sanitizeCodeNode(
        {
          type: 'code',
          lang: frontmatter.lang,
          value: frontmatter.value,
        },
        {
          depth: 0,
          maxDepth: maxPasteDepth,
          inSingleLine: false,
          insideLink: false,
          allowTopLevelMermaid: false,
          restSource: body,
        },
      ),
    );
  }

  sanitizedBlocks.push(
    ...sanitizeBlockNodes(rawBlocks, {
      depth: 0,
      maxDepth: maxPasteDepth,
      inSingleLine: false,
      insideLink: false,
      allowTopLevelMermaid: options.allowTopLevelMermaid ?? true,
      restSource: body,
    }),
  );

  if (!sanitizedBlocks.length) return null;

  let document = parseAstToDoc(sanitizedBlocks, ctx);
  if (!canRoundTrip(document, ctx)) {
    if (isAggregateLimitFailure(document, ctx)) return null;
    document = isolateFailingBlocks(sanitizedBlocks, ctx);
  }
  if (!document || !document.childCount) return null;

  const only = document.firstChild;
  return document.childCount === 1 && only?.type.name === 'paragraph'
    ? new Slice(only.content, 0, 0)
    : new Slice(document.content, 0, 0);
}
