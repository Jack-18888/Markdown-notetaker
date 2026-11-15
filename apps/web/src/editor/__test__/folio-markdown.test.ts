import { describe, expect, it } from 'vitest';
import {
  alertSource,
  alerts,
  codeSource,
  codeValue,
  detailsSource,
  moveBlock,
  parseFolio,
  renameFootnotes,
  replaceBlock,
  writeNode,
} from '../folio-markdown.js';
import { normalizedSource, reconcileSource } from '../source-text.js';
import {
  supportedFixtures,
  unsupportedFixtures,
  unsafeLinkFixtures,
} from './fixtures.js';

describe('Folio positioned conversion', () => {
  it.each(supportedFixtures)(
    'keeps the original source for %s',
    (_label, source) => {
      const parsed = parseFolio(source)!;
      expect(parsed.source).toBe(source);
      expect(replaceBlock(parsed, parsed.blocks.length, 'New paragraph')).toBe(
        source + '\n\nNew paragraph',
      );
    },
  );

  it.each([
    ...unsupportedFixtures.map(([, source]) => source),
    ...unsafeLinkFixtures,
  ])('retains original source when adding a block', (source) => {
    const parsed = parseFolio(source)!;
    expect(parsed.source).toBe(source);
    expect(replaceBlock(parsed, parsed.blocks.length, 'New paragraph')).toBe(
      source + parsed.newline.repeat(2) + 'New paragraph',
    );
  });

  it.each(alerts)(
    'parses and serializes a %s alert as a block with source',
    (variant) => {
      const body = '**Bold**\n\n- [ ] Item';
      const source = alertSource(variant, body, '\n');
      expect(parseFolio(source)?.blocks).toMatchObject([
        { kind: 'alert', variant, body, raw: source },
      ]);
    },
  );

  it('groups an editable details section and ignores closing tag text inside a fenced block', () => {
    const fence = '\x60'.repeat(3);
    const body = fence + 'html\r\n</details>\r\n' + fence + '\r\n\r\nBody';
    const source = detailsSource('A < B & C', body, false, '\r\n');
    expect(parseFolio(source)?.blocks).toMatchObject([
      { kind: 'details', summary: 'A < B & C', body },
    ]);
  });

  it('preserves original gaps, an opaque block, and mixed diagram line endings on a neighbor edit', () => {
    const fence = '\x60'.repeat(3);
    const diagram = 'flowchart LR\r\n A --> B  \n';
    const source =
      '# First \r\n\r\n<!-- comment -->\r\n\r\n' +
      fence +
      'mermaid\n' +
      diagram +
      '\n' +
      fence +
      '\r\n\r\nLast';
    const parsed = parseFolio(source)!;
    const edited = replaceBlock(
      parsed,
      3,
      writeNode(
        { type: 'paragraph', children: [{ type: 'text', value: 'Updated' }] },
        parsed.newline,
      ),
    );
    expect(edited).toBe(source.slice(0, -4) + 'Updated');
    expect(codeValue(parsed.blocks[2]!, '')).toBe(diagram);
  });

  it('chooses a fence long enough for embedded fences and leaves code entities literal', () => {
    const fence = '\x60'.repeat(3);
    const value = '  &#x20; type Name = string;\r\n' + fence;
    const source = codeSource('', value, 'typescript', '\n');
    expect(source.startsWith('\x60'.repeat(4))).toBe(true);
    const block = parseFolio(source)!.blocks[0]!;
    expect(codeValue(block, '')).toBe(value);
  });

  it('renames references and their definition atomically beside inline and fenced code', () => {
    const source =
      'A footnote[^tip] and another[^tip].\r\n\r\n[^tip]: Definition\r\n\r\n' +
      '\x60[^tip]\x60\r\n\r\n[^taken]: Other';
    const doc = parseFolio(source)!;
    expect(renameFootnotes(doc, 'tip', 'first')).toBe(
      source
        .replaceAll('[^tip]', '[^first]')
        .replace('\x60[^first]\x60', '\x60[^tip]\x60'),
    );
    expect(() => renameFootnotes(doc, 'tip', 'taken')).toThrow(
      'already in use',
    );
  });

  it('reorders original slices without regenerating the moved table or task block', () => {
    const source = 'First\r\n\r\n- [x] Task  \r\n\r\nLast';
    expect(moveBlock(parseFolio(source)!, 2, 0)).toBe(
      'Last\r\n\r\nFirst\r\n\r\n- [x] Task  ',
    );
  });

  it('leaves conversion of very large notes to Markdown view', () => {
    expect(parseFolio('é'.repeat(65_537))).toBeNull();
  });
});

it('maps textarea changes to the original line endings and keeps exact pasted endings', () => {
  const source = 'First\r\nSecond\rThird\nLast';
  expect(normalizedSource(source)).toBe('First\nSecond\nThird\nLast');
  expect(reconcileSource(source, 'First\nChanged\nThird\nLast')).toBe(
    'First\r\nChanged\rThird\nLast',
  );
  expect(reconcileSource('', 'A\nB\nC', 'A\r\nB\rC')).toBe('A\r\nB\rC');
});
