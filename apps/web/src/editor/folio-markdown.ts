import type { Parent, Root, RootContent } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { utf8ByteLength } from '@markdown-note-taker/contracts';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkStringify, { bullet: '-', fences: true });

const breaks = /\r\n|\r|\n/g;
const frontmatter =
  /^(?:\uFEFF)?(---|\+\+\+)[ \t]*(?:\r\n|\r|\n)[\s\S]*?(?:\r\n|\r|\n)\1[ \t]*(?=\r\n|\r|\n|$)/;
const opening =
  /^<details(?: (open))?>[ \t]*(?:\r\n|\r|\n)[ \t]*<summary>([^<\r\n]*)<\/summary>[ \t]*(?:\r\n|\r|\n)/i;
const closing = /^[ \t]*<\/details>[ \t]*$/i;
const alert =
  /^ {0,3}>[ \t]?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?=\r\n|\r|\n|$)/i;
const tagLikeBlock = /^ {0,3}<\/?[a-z][a-z\d-]*(?:[ \t/][^\r\n>]*?)?>/i;

export const alerts = [
  'NOTE',
  'TIP',
  'IMPORTANT',
  'WARNING',
  'CAUTION',
] as const;
export type Alert = (typeof alerts)[number];

interface Span {
  start: number;
  end: number;
  raw: string;
}
export type FolioBlock = Span &
  (
    | { kind: 'markdown'; node: RootContent }
    | { kind: 'details'; summary: string; open: boolean; body: string }
    | { kind: 'alert'; variant: Alert; body: string }
    | { kind: 'literal' | 'blank' }
  );
export interface FolioDocument {
  source: string;
  blocks: FolioBlock[];
  newline: string;
}

function span(source: string, start: number, end: number): Span {
  return { start, end, raw: source.slice(start, end) };
}

function decodeSummary(value: string) {
  const entities: Record<string, string> = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
  };
  return value.replace(
    /&(?:lt|gt|amp|quot|#39);/g,
    (entity) => entities[entity]!,
  );
}

export function detailsSource(
  summary: string,
  body: string,
  open: boolean,
  newline: string,
) {
  const title = summary
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return [
    open ? '<details open>' : '<details>',
    '<summary>' + title + '</summary>',
    '',
    body,
    '',
    '</details>',
  ].join(newline);
}

export function alertSource(variant: Alert, body: string, newline: string) {
  if (!body) return '> [!' + variant + ']';
  const quoted = body
    .split(/(\r\n|\r|\n)/)
    .map((line, index) => (index % 2 ? line : line ? '> ' + line : '>'));
  return '> [!' + variant + ']' + newline + quoted.join('');
}

export function withinBudget(children: RootContent[]) {
  const pending = children.map((node) => ({
    node: node as RootContent | Parent['children'][number],
    depth: 0,
  }));
  let count = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (++count > 10_000 || depth > 32) return false;
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children)
        pending.push({ node: child, depth: depth + 1 });
    }
  }
  return true;
}

/** Positions index the original string, including CRLF and escaped characters. */
export function parseFolio(source: string): FolioDocument | null {
  if (utf8ByteLength(source) > 128 * 1024) return null;
  try {
    const prefix =
      frontmatter.exec(source)?.[0] ??
      (source.startsWith('\uFEFF') ? '\uFEFF' : '');
    const parsed = processor.parse(source.slice(prefix.length));
    if (!withinBudget(parsed.children)) return null;
    const blocks: FolioBlock[] = [];
    if (prefix)
      blocks.push({ ...span(source, 0, prefix.length), kind: 'literal' });
    const positioned = parsed.children.map((node) => ({
      ...span(
        source,
        node.position!.start.offset! + prefix.length,
        node.position!.end.offset! + prefix.length,
      ),
      node,
    }));
    for (let index = 0; index < positioned.length; index++) {
      const { node, ...range } = positioned[index]!;
      if (node.type === 'html') {
        const start = opening.exec(source.slice(range.start));
        if (start) {
          let depth = 1;
          const prefixEnd = range.start + start[0].length;
          let end = -1;
          let closeStart = -1;
          let last = index;
          for (; last < positioned.length; last++) {
            const candidate = positioned[last]!;
            if (candidate.node.type !== 'html') continue;
            const lines = candidate.raw.matchAll(/([^\r\n]+)(?:\r\n|\r|\n|$)/g);
            for (const line of lines) {
              const offset = candidate.start + line.index;
              if (offset < prefixEnd) continue;
              if (/^[ \t]*<details(?: open)?>[ \t]*$/i.test(line[1]!)) depth++;
              if (closing.test(line[1]!) && --depth === 0) {
                closeStart = offset;
                end = offset + line[1]!.length;
                break;
              }
            }
            if (end >= 0) break;
          }
          if (end >= 0 && !source.slice(end, positioned[last]!.end).trim()) {
            blocks.push({
              ...span(source, range.start, end),
              kind: 'details',
              summary: decodeSummary(start[2]!),
              open: Boolean(start[1]),
              body: source
                .slice(prefixEnd, closeStart)
                .replace(/^(?:\r\n|\r|\n)/, '')
                .replace(/(?:\r\n|\r|\n){1,2}$/, ''),
            });
            index = last;
            continue;
          }
        }
        blocks.push({
          ...range,
          kind: /^<br \/>[ \t]*$/.test(range.raw) ? 'blank' : 'literal',
        });
        continue;
      }
      if (node.type === 'paragraph' && tagLikeBlock.test(range.raw)) {
        blocks.push({ ...range, kind: 'literal' });
        continue;
      }
      const header = node.type === 'blockquote' ? alert.exec(range.raw) : null;
      if (header) {
        const body = range.raw
          .slice(header[0].length)
          .replace(/^(?:\r\n|\r|\n)/, '')
          .replace(/^ {0,3}>[ \t]?/gm, '');
        blocks.push({
          ...range,
          kind: 'alert',
          variant: header[1]!.toUpperCase() as Alert,
          body,
        });
      } else {
        blocks.push({ ...range, kind: 'markdown', node });
      }
    }
    return { source, blocks, newline: source.match(breaks)?.[0] ?? '\n' };
  } catch {
    return null;
  }
}

export function writeNode(node: RootContent, newline: string) {
  const root: Root = { type: 'root', children: [node] };
  const written = processor.stringify(root);
  const result = written.replace(/\n$/, '');
  const converted = processor.parse(result).children;
  if (converted.length !== 1 || converted[0]!.type !== node.type)
    throw new Error('The changed block cannot be represented as Markdown.');
  return result.replaceAll('\n', newline);
}

/** Replace a block without regenerating any of its neighbors. */
export function replaceBlock(
  document: FolioDocument,
  index: number,
  raw: string,
) {
  const { source, blocks, newline } = document;
  const previous = blocks[index - 1];
  const next = blocks[index + 1];
  const block = blocks[index];
  const start = block?.start ?? source.length;
  const end = block?.end ?? source.length;
  const before = source.slice(0, start);
  const after = source.slice(end);
  const expected = [
    ...blocks.slice(0, index).map((entry) => entry.raw),
    ...(parseFolio(raw)?.blocks.map((entry) => entry.raw) ?? []),
    ...blocks.slice(index + 1).map((entry) => entry.raw),
  ];
  const joins = [
    before + (block || !previous ? '' : newline.repeat(2)) + raw + after,
    before +
      (previous ? newline.repeat(2) : '') +
      raw +
      (next ? newline.repeat(2) : '') +
      after,
  ];
  for (const candidate of joins) {
    const parsed = parseFolio(candidate);
    if (
      parsed?.blocks.length === expected.length &&
      parsed.blocks.every((entry, position) => entry.raw === expected[position])
    )
      return candidate;
  }
  throw new Error('The changed block would alter adjacent Markdown.');
}

export function moveBlock(document: FolioDocument, from: number, to: number) {
  const { blocks, source, newline } = document;
  const entries = blocks.map((block) => block.raw);
  const [entry] = entries.splice(from, 1);
  if (entry === undefined || to < 0 || to >= blocks.length) return source;
  entries.splice(to, 0, entry);
  const before = source.slice(0, blocks[0]!.start);
  const after = source.slice(blocks.at(-1)!.end);
  const candidate =
    before +
    entries
      .map((raw, index) => {
        const next = blocks[index + 1];
        return raw + (next ? source.slice(blocks[index]!.end, next.start) : '');
      })
      .join('') +
    after;
  for (const reordered of [
    candidate,
    before + entries.join(newline.repeat(2)) + after,
  ]) {
    const parsed = parseFolio(reordered);
    if (
      parsed?.blocks.length === entries.length &&
      parsed.blocks.every((block, index) => block.raw === entries[index])
    )
      return reordered;
  }
  throw new Error('The move would change how some blocks are parsed.');
}

export function codeSource(
  raw: string,
  value: string,
  language: string,
  newline: string,
  meta?: string | null,
) {
  const opening = /^ {0,3}([\x60~])\1{2,}/.exec(raw);
  const marker = opening?.[1] ?? '\x60';
  const runs = value.match(marker === '~' ? /~+/g : /\x60+/g) ?? [];
  const length = runs.reduce(
    (longest, run) => Math.max(longest, run.length + 1),
    3,
  );
  const fence = marker.repeat(length);
  return (
    fence +
    language +
    (meta ? ' ' + meta : '') +
    newline +
    value +
    newline +
    fence
  );
}

export function codeValue(block: FolioBlock, fallback: string) {
  const fence = /^([\x60~])\1{2,}[^\r\n]*(?:\r\n|\r|\n)/.exec(block.raw);
  if (!fence) return fallback;
  const close = new RegExp(
    '(?:\\r\\n|\\r|\\n) {0,3}' + fence[1] + '{3,}[ \\t]*$',
  );
  const rest = block.raw.slice(fence[0].length);
  return close.test(rest) ? rest.replace(close, '') : fallback;
}

export function renameFootnotes(
  document: FolioDocument,
  from: string,
  to: string,
) {
  if (!/^[\p{L}\p{N}_-]+$/u.test(to))
    throw new Error(
      'Use letters, numbers, underscores, or hyphens in a footnote label.',
    );
  const prefix =
    frontmatter.exec(document.source)?.[0].length ??
    (document.source.startsWith('\uFEFF') ? 1 : 0);
  const tree = processor.parse(document.source.slice(prefix));
  const pending = [...tree.children];
  const replacements: { start: number; end: number }[] = [];
  let definition = false;
  const target = to.toLowerCase();
  while (pending.length) {
    const node = pending.pop()!;
    if ('children' in node) pending.push(...node.children);
    if (node.type !== 'footnoteDefinition' && node.type !== 'footnoteReference')
      continue;
    if (node.identifier !== from) {
      if (node.identifier === target && node.type === 'footnoteDefinition')
        throw new Error('That footnote label is already in use.');
      continue;
    }
    definition ||= node.type === 'footnoteDefinition';
    const start = node.position!.start.offset! + prefix;
    const marker = /^\[\^(?:\\.|[^\]\\\r\n])+\]/u.exec(
      document.source.slice(start),
    );
    if (!marker)
      throw new Error('This footnote label could not be changed safely.');
    replacements.push({ start: start + 2, end: start + marker[0].length - 1 });
  }
  if (!definition) throw new Error('This footnote has no definition.');
  let source = document.source;
  for (const { start, end } of replacements.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, start) + to + source.slice(end);
  }
  return source;
}
