import { describe, expect, it } from 'vitest';
import { assessSource, editorLimits } from '../source-policy.js';

const unsupported = [
  ['HTML', '<img src=x onerror=alert(1)>'],
  ['inline HTML', '**before <script>alert(1)</script> after**'],
  ['HTML comments', 'before <!-- retain me --> after'],
  ['image', '![alt](https://example.com/image.png)'],
  ['nested image', '> - ![alt](https://example.com/image.png)'],
  ['table', '| A | B |\n| --- | --- |\n| x | y |'],
  ['frontmatter', '---\r\ntitle: Saved\r\n---\r\n# Body'],
  ['TOML', '+++\ntitle = "Saved"\n+++\nBody'],
  ['reference links', '[label][target]\n\n[target]: https://example.com'],
  ['unused definitions', 'Text\n\n[target]: https://example.com'],
  ['footnotes', 'Text[^1]\n\n[^1]: Details'],
  ['math', '$$\nx = y\n$$'],
  ['fence metadata', '```js title="keep me"\nconst x = 1\n```'],
  ['nested diagram', '> ```mermaid\n> A --> B\n> ```'],
  ['mixed task list', '- plain\n- [ ] task'],
  ['NUL', 'a\0b'],
] as const;

describe('source compatibility policy', () => {
  it.each(unsupported)('keeps %s outside rich conversion', (_name, source) => {
    expect(assessSource(source)).toBe('unsupported');
  });
  it.each([
    '[link](javascript:alert%281%29)',
    '[link](data:text/html,example)',
    '[link](vbscript:example)',
    '[link](//evil.example)',
    '[link](javascript&colon;example)',
    '[link](java&#x73;cript:example)',
  ])('rejects unsafe imported destination %#', (source) => {
    expect(assessSource(source)).toBe('unsafe-link');
  });
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
  ])('accepts supported source %# without interpreting code', (source) => {
    expect(assessSource(source)).toBeNull();
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
