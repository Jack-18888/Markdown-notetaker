export const supportedFixtures = [
  ['paragraphs', 'First paragraph.\n\nSecond paragraph.'],
  [
    'headings',
    '# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six',
  ],
  ['marks', '**bold** *italic* ~~strike~~ `literal <script>`'],
  ['nested marks', '**bold and *italic* text**'],
  ['links', '[Example](https://example.com/path "Title") and [jump](#section)'],
  ['lists', '- one\n- two\n  - nested\n\n3. third\n4. fourth'],
  ['tasks', '- [ ] pending\n- [x] done\n  - [ ] nested'],
  ['quotes', '> Quoted **text**\n>\n> > Nested quote'],
  ['rules', 'Above\n\n---\n\nBelow'],
  ['table', '| A | B |\n| --- | --- |\n| x | y |'],
  ['hard breaks', 'one  \ntwo'],
  ['literal code', '````text\n<script>alert(1)</script>\n```\n````'],
  ['Mermaid', '```mermaid\nflowchart LR\n  A --> B\n```'],
  ['invalid diagram', '```mermaid\nnot a valid diagram <script>\n```'],
  [
    'multiple diagrams',
    '```mermaid\nA --> B\n```\n\nBetween\n\n```mermaid\nsequenceDiagram\nA->>B: Hi\n```',
  ],
] as const;

export const unsupportedFixtures = [
  ['HTML', '<img src=x onerror=alert(1)>'],
  ['inline HTML', '**before <script>alert(1)</script> after**'],
  ['HTML comments', 'before <!-- retain me --> after'],
  ['image', '![alt](https://example.com/image.png)'],
  ['nested image', '> - ![alt](https://example.com/image.png)'],
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

export const unsafeLinkFixtures = [
  '[link](javascript:alert%281%29)',
  '[link](data:text/html,example)',
  '[link](vbscript:example)',
  '[link](//evil.example)',
  '[link](javascript&colon;example)',
  '[link](java&#x73;cript:example)',
] as const;
