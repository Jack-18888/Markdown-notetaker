import { describe, expect, it } from 'vitest';
import { assessSource, editorLimits } from '../source-policy.js';
import { unsupportedFixtures, unsafeLinkFixtures } from './fixtures.js';

describe('source compatibility policy', () => {
  it.each(unsupportedFixtures)(
    'keeps %s outside rich conversion',
    (_name, source) => {
      expect(assessSource(source)).toBe('unsupported');
    },
  );
  it.each(unsafeLinkFixtures)(
    'rejects unsafe imported destination %#',
    (source) => {
      expect(assessSource(source)).toBe('unsafe-link');
    },
  );
  it.each(['One <br /> two', '> <br class="custom" />', '<br />\nText'])(
    'restricts empty paragraph markers to standalone, attribute-free blocks (%j)',
    (source) => {
      expect(assessSource(source)).toBe('unsupported');
    },
  );
  it.each([
    '',
    '# Heading\n\n**bold** *italic* ~~strike~~',
    '[safe](https://example.com/?a=1&b=2)',
    '3. first\n4. second',
    '- [ ] task\n- [x] done',
    '`<script>literal</script>`',
    '```html\n<script>alert(1)</script>\n```',
    '```text\n![literal](image.png)\n---\ntitle: literal\n---\n```',
    '```mermaid\nflowchart LR\n A --> B\n```',
    '- Calculate with `$x$`',
    '- **Calculate** with `$$x$$`',
    '> - Literal `$x$` inside a quote',
    '- Calculate with $x$',
    '> - Math $$x$$',
    '$$\nx = y\n$$',
    '`example\n[^1]: not a definition`',
    'See `example\n[^1]: not a definition` inline',
    '- `example\n[^1]: not a definition`',
    '- [x] `example\n[^1]: not a definition`',
    '> Line 1\n> `example\n> [^1]: not a definition`',
    '`code` [^1]: mid line text',
    '- [x] [^1]: mid line in task',
  ])('accepts supported source %#', (source) => {
    expect(assessSource(source)).toBeNull();
  });
  it.each([
    '[^1]: Multi word footnote definition',
    'Paragraph line\n[^1]: Multi word footnote definition',
    '> Quote line\n> [^1]: Multi word footnote definition',
    '- Item line\n  [^1]: Multi word footnote definition',
    '- [x] Task line\n  [^1]: Multi word footnote definition',
    '`code`\n[^1]: Multi word footnote definition',
  ])('rejects multi-word footnote definitions %#', (source) => {
    expect(assessSource(source)).toBe('unsupported');
  });
  it('bounds source bytes before tokenization', () => {
    expect(assessSource('é'.repeat(editorLimits.sourceBytes / 2))).toBeNull();
    expect(assessSource('é'.repeat(editorLimits.sourceBytes / 2) + 'a')).toBe(
      'conversion-limit',
    );
  });
  it('bounds token count and nesting', () => {
    expect(assessSource('**x** '.repeat(4000))).toBe('conversion-limit');
    expect(assessSource('> '.repeat(editorLimits.depth + 1) + 'nested')).toBe(
      'conversion-limit',
    );
  });
});
