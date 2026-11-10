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
  ['hard breaks', 'one  \ntwo'],
  ['literal code', '````text\n<script>alert(1)</script>\n```\n````'],
  ['Mermaid', '```mermaid\nflowchart LR\n  A --> B\n```'],
  ['invalid diagram', '```mermaid\nnot a valid diagram <script>\n```'],
  [
    'multiple diagrams',
    '```mermaid\nA --> B\n```\n\nBetween\n\n```mermaid\nsequenceDiagram\nA->>B: Hi\n```',
  ],
] as const;
