import DOMPurify from 'dompurify';
import { utf8ByteLength } from '@markdown-note-taker/contracts';

export const diagramLimits = {
  bytes: 16 * 1024,
  statements: 200,
  edges: 100,
} as const;

/** Preview limits do not constrain editing or persistence of the source. */
export function diagramIssue(source: string): string | null {
  if (!source.trim()) return 'Write Mermaid source to preview a diagram.';
  if (
    utf8ByteLength(source) > diagramLimits.bytes ||
    source.split(/\r\n|[\r\n;]/).length > diagramLimits.statements
  )
    return 'This diagram is too large to preview. Its source is still editable.';
  if (/%%\s*\{|^\s*---(?:\r\n|[\r\n])|@import|url\s*\(/i.test(source))
    return 'Diagram configuration and external styles are disabled. Its source is still editable.';
  return null;
}

export function sanitizeDiagram(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'script', 'a', 'image', 'iframe'],
    FORBID_ATTR: ['href', 'xlink:href'],
  });
}
