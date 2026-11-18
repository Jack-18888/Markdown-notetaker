// @vitest-environment happy-dom
import { AllSelection, TextSelection } from '@milkdown/kit/prose/state';
import { afterEach, describe, expect, it } from 'vitest';
import { open } from './editor-fixture.js';
import { shouldParseClipboardAsMarkdown } from '../markdown-paste.js';
import { assessSource } from '../source-policy.js';

const folioWelcomeSample = `# Welcome to Folio

Folio is a distraction-free workspace that blends **fluid block editing** with clean, portable \`Markdown\`. Every block you write here serializes cleanly to standard GitHub-Flavored Markdown—switch between **Editor** and **Markdown** in the top bar at any time.

> [!TIP]
> **Quick tip:** Type \`/\` on any empty line to open the slash command palette, or highlight any text to reveal the floating formatting toolbar.

## Core Editing Mechanics

- [x] Type \`# \`, \`## \`, or \`### \` for instant headings
- [x] Use \`- \`, \`1. \`, or \`[] \` to start lists and checklists
- [ ] Hover any block and drag the **6-dot handle** to reorder paragraphs or sections
- [ ] Export this page as a \`.md\` file or print cleanly to PDF from the top-right menu

## Keyboard & Markdown Shortcuts

| Trigger | Block Type | Keyboard / Action |
| --- | --- | --- |
| \`/\` | Slash Command Menu | Arrow keys + Enter to insert |
| \`# \` / \`## \` | Heading 1 / Heading 2 | Space after hashes |
| \`[] \` | To-Do Checklist | Click checkbox or Space |
| \`\`\`\` \` | Code Block | Syntax highlighting + Copy |
| \`> \` | Blockquote | Editorial pull quote |
| \`---\` | Horizontal Divider | Clean section break |

<details>
<summary>How bidirectional Markdown sync works</summary>

hbdvhjqnqj
</details>

### Syntax-Highlighted Code Example

\`\`\`typescript
interface DocumentSnapshot {
  id: string;
  title: string;
  updatedAt: number;
}

export function formatSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "untitled";
}
\`\`\`

> Writing tools should disappear behind your thoughts—structured enough to organize complex specs, quiet enough for long-form prose.`;

function createClipboardData(
  entries: Record<string, string>,
  files: File[] = [],
): DataTransfer {
  return {
    files: files as unknown as FileList,
    types: Object.keys(entries),
    getData: (type: string) => entries[type] ?? '',
  } as unknown as DataTransfer;
}

function dispatchPaste(
  target: HTMLElement,
  entries: Record<string, string>,
  files: File[] = [],
) {
  const event = new Event('paste', {
    bubbles: true,
    cancelable: true,
  }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: createClipboardData(entries, files),
  });
  target.dispatchEvent(event);
  return event;
}

async function openRich(
  source: string,
  options: { interactive?: boolean } = {},
) {
  const editor = await open(source, options);
  if (editor.loaded.mode !== 'rich' || !('view' in editor)) {
    editor.close();
    throw new Error(`Expected rich mode, received ${editor.loaded.mode}`);
  }
  return editor;
}

async function openAndPaste(
  markdown: string,
  entries?: Record<string, string>,
  options: { interactive?: boolean } = {},
) {
  const editor = await openRich('', options);
  try {
    const event = dispatchPaste(
      editor.view.dom,
      entries ?? { 'text/plain': markdown },
    );
    expect(event.defaultPrevented).toBe(true);

    const serialized = editor.loaded.serialize(editor.view.state.doc);
    const reopened = await openRich(serialized, options);
    try {
      expect(reopened.view.state.doc.toJSON()).toEqual(
        editor.view.state.doc.toJSON(),
      );
      expect(reopened.loaded.serialize(reopened.view.state.doc)).toBe(
        serialized,
      );
    } finally {
      reopened.close();
    }

    return { editor, serialized };
  } catch (error) {
    editor.close();
    throw error;
  }
}

describe('markdown paste resilience & feature compatibility', () => {
  const closers: Array<() => void> = [];

  afterEach(() => {
    while (closers.length) {
      closers.pop()?.();
    }
  });

  it('renders every supported block of the Folio sample cleanly alongside inert <details>', async () => {
    const { editor } = await openAndPaste(folioWelcomeSample, undefined, {
      interactive: true,
    });
    closers.push(editor.close);

    const dom = editor.view.dom;
    expect(dom.querySelector('h1')?.textContent).toBe('Welcome to Folio');
    const h2Texts = Array.from(dom.querySelectorAll('h2')).map(
      (el) => el.textContent,
    );
    expect(h2Texts).toEqual([
      'Core Editing Mechanics',
      'Keyboard & Markdown Shortcuts',
    ]);
    expect(dom.querySelector('h3')?.textContent).toBe(
      'Syntax-Highlighted Code Example',
    );

    expect(dom.querySelectorAll('strong').length).toBeGreaterThanOrEqual(4);
    expect(dom.querySelectorAll('blockquote')).toHaveLength(2);
    expect(dom.querySelectorAll('blockquote')[0]?.textContent).toContain(
      '[!TIP]',
    );
    expect(dom.querySelectorAll('blockquote')[1]?.textContent).toContain(
      'Writing tools should disappear behind your thoughts',
    );

    const checkboxes = Array.from(
      dom.querySelectorAll<HTMLInputElement>('.crepe-task-checkbox'),
    );
    expect(checkboxes).toHaveLength(4);
    expect(checkboxes.map((cb) => cb.checked)).toEqual([
      true,
      true,
      false,
      false,
    ]);

    const tableRows = Array.from(dom.querySelectorAll('table tr'));
    expect(tableRows).toHaveLength(7);
    expect(dom.querySelectorAll('table tr')[4]?.textContent).toContain('`');
    expect(dom.querySelectorAll('table tr')[4]?.textContent).toContain(
      'Code Block',
    );

    // Unsupported HTML elements must remain inert literal text, never live DOM nodes.
    expect(dom.querySelector('details')).toBeNull();
    expect(dom.querySelector('summary')).toBeNull();
    expect(dom.textContent).toContain('<details>');
    expect(dom.textContent).toContain(
      '<summary>How bidirectional Markdown sync works</summary>',
    );
    expect(dom.textContent).toContain('hbdvhjqnqj');
    expect(dom.textContent).toContain('</details>');

    // Code block content and language metadata must remain intact.
    expect(dom.textContent).toContain('interface DocumentSnapshot');
    expect(dom.textContent).toContain('export function formatSlug');
  });

  it('supports CommonMark and GFM features end-to-end across paste and reopen', async () => {
    const richDoc = [
      '# H1',
      '## H2',
      '### H3',
      '#### H4',
      '##### H5',
      '###### H6',
      '',
      'Setext Two',
      '---',
      '',
      'Inline **bold**, *italic*, ~~strike~~, `code`, ```` ``nested` `` ````, ***both***, and escaped \\*stars\\*.',
      '',
      'Links: [Safe](https://example.com/docs "Docs"), <https://auto.example.com>, [Local](note-2), [#anchor](#h2), and [Reference][ref].',
      '',
      '[ref]: https://reference.example.com "Reference"',
      '',
      '> Callout quote line 1',
      '>',
      '> > Nested quote line',
      '',
      '- Bullet one',
      '  1. Nested ordered',
      '  2. Nested second',
      '- Bullet two',
      '',
      '| Left | Center | Right |',
      '| :--- | :---: | ---: |',
      '| **A** | `pipe \\| here` | [link](https://example.com) |',
      '',
      '````markdown',
      '```js',
      'console.log("nested fence");',
      '```',
      '````',
      '',
      '    indented code line',
      '',
      '```mermaid',
      'graph TD',
      '  A --> B',
      '```',
      '',
      'Prices stay plain: $10 and $20.',
      '',
      '***',
      '',
      'Local image: ![diagram](/api/images/11111111-1111-4111-8111-111111111111)',
    ].join('\n');

    const { editor } = await openAndPaste(richDoc);
    closers.push(editor.close);

    const dom = editor.view.dom;
    expect(dom.querySelector('h1')?.textContent).toBe('H1');
    expect(dom.querySelectorAll('h2').length).toBe(2);
    expect(dom.querySelector('h6')?.textContent).toBe('H6');
    expect(dom.querySelector('del')?.textContent).toBe('strike');
    expect(
      dom.querySelectorAll('a[href="https://reference.example.com"]'),
    ).toHaveLength(1);
    expect(
      dom.querySelectorAll('a[href="https://example.com/docs"]'),
    ).toHaveLength(1);
    expect(dom.querySelector('blockquote blockquote')).not.toBeNull();
    expect(dom.querySelector('ul ol')).not.toBeNull();
    expect(dom.querySelectorAll('table tr')).toHaveLength(2);
    expect(dom.textContent).toContain('console.log("nested fence")');
    expect(dom.textContent).toContain('indented code line');
    expect(dom.textContent).toContain('Prices stay plain: $10 and $20.');
    expect(dom.querySelector('hr')).not.toBeNull();
    expect(
      dom.querySelector(
        'img[src="/api/images/11111111-1111-4111-8111-111111111111"]',
      ),
    ).not.toBeNull();
    expect(
      editor.view.state.doc.content.content.some(
        (node) => node.type.name === 'mermaid',
      ),
    ).toBe(true);
  });

  const isolationCases: Array<{
    name: string;
    unsupported: string;
    assertUnsupported: (dom: HTMLElement) => void;
  }> = [
    {
      name: 'block HTML details/div/table',
      unsupported:
        '<div>\n<p>Inside raw div</p>\n</div>\n\n<table><tr><td>raw cell</td></tr></table>',
      assertUnsupported(dom) {
        expect(dom.querySelectorAll('table')).toHaveLength(1);
        expect(dom.textContent).toContain('<div>');
        expect(dom.textContent).toContain('Inside raw div');
      },
    },
    {
      name: 'XSS script, iframe, svg, and inline HTML tags',
      unsupported:
        '<script>window.__xss = 1;</script>\n\nInline <b>bold tag</b> and <img src="https://evil.example/x.png" onerror="window.__xss=2"> and <iframe src="https://evil.example"></iframe>',
      assertUnsupported(dom) {
        expect(dom.querySelector('script')).toBeNull();
        expect(dom.querySelector('iframe')).toBeNull();
        expect(dom.querySelector('img[src*="evil.example"]')).toBeNull();
        expect(dom.textContent).toContain('<script>');
        expect(dom.textContent).toContain('<b>');
      },
    },
    {
      name: 'single and multi-line HTML comments',
      unsupported:
        '<!-- single line comment -->\n\n<!--\nmulti\n\nline comment\n-->\n\nInline <!-- inline --> text.',
      assertUnsupported(dom) {
        expect(dom.textContent).toContain('<!-- single line comment -->');
        expect(dom.textContent).toContain('<!--');
        expect(dom.textContent).toContain('Inline <!-- inline --> text.');
      },
    },
    {
      name: 'external, data, blob, and relative images alongside local images',
      unsupported:
        '![ext](https://example.com/pic.png) ![data](data:image/svg+xml,<svg/>) ![rel](./img.png) ![local](/api/images/22222222-2222-4222-8222-222222222222)',
      assertUnsupported(dom) {
        expect(dom.querySelectorAll('img')).toHaveLength(1);
        expect(
          dom.querySelector(
            'img[src="/api/images/22222222-2222-4222-8222-222222222222"]',
          ),
        ).not.toBeNull();
        expect(dom.textContent).toContain(
          '![ext](https://example.com/pic.png)',
        );
        expect(dom.textContent).toContain('![data](data:...)');
      },
    },
    {
      name: 'unsafe links directly and via reference definitions',
      unsupported:
        '[bad](javascript:alert(1)) <javascript:alert(2)> [data](data:text/html,hi) [refbad][evil] and [ok](https://safe.example.com).\n\n[evil]: javascript:alert(3)',
      assertUnsupported(dom) {
        const anchors = Array.from(dom.querySelectorAll('a'));
        expect(anchors.map((a) => a.getAttribute('href'))).toEqual([
          'https://safe.example.com',
        ]);
        expect(dom.textContent).toContain('bad');
        expect(dom.textContent).toContain('refbad');
      },
    },
    {
      name: 'GFM footnotes with multi-word definitions',
      unsupported:
        'Claim here[^1] and missing[^none].\n\n[^1]: Multi-word footnote body with **bold** text.',
      assertUnsupported(dom) {
        expect(dom.textContent).toContain('Claim here[^1]');
        expect(dom.textContent).toContain('[^1]:');
        expect(dom.textContent).toContain('Multi-word footnote body');
        expect(dom.querySelector('strong')?.textContent).toBe('bold');
      },
    },
    {
      name: 'YAML frontmatter metadata',
      unsupported: '---\ntitle: Sample Note\ntags: [draft, gfm]\n---',
      assertUnsupported(dom) {
        expect(dom.textContent).toContain('title: Sample Note');
        expect(dom.textContent).toContain('tags: [draft, gfm]');
      },
    },
    {
      name: 'TOML frontmatter metadata',
      unsupported: '+++\ntitle = "TOML Note"\ncount = 3\n+++',
      assertUnsupported(dom) {
        expect(dom.textContent).toContain('title = "TOML Note"');
      },
    },
    {
      name: 'code fence metadata and unusual language chars',
      unsupported:
        '```ts title="example.ts" {1-2}\nconst x = 1;\n```\n\n```lang:odd\nodd\n```',
      assertUnsupported(dom) {
        expect(dom.textContent).toContain('const x = 1;');
        expect(dom.textContent).toContain('odd');
      },
    },
    {
      name: 'ordered task lists and mixed bullet/task lists',
      unsupported:
        '1. [x] Step one\n2. [ ] Step two\n\n- [x] Checked\n- Plain sibling\n- [ ] Open',
      assertUnsupported(dom) {
        expect(dom.textContent).toContain('Step one');
        expect(dom.textContent).toContain('Step two');
        expect(dom.textContent).toContain('Plain sibling');
        expect(dom.querySelector('ol')?.textContent).toContain('Step one');
        expect(dom.querySelector('ol')?.textContent).toContain('Step two');
        expect(
          dom.querySelectorAll('ul li[data-item-type="task"]').length,
        ).toBeGreaterThanOrEqual(3);
      },
    },
    {
      name: 'nested mermaid inside blockquote',
      unsupported: '> ```mermaid\n> graph LR\n>   X --> Y\n> ```',
      assertUnsupported(dom) {
        expect(dom.querySelector('blockquote')?.textContent).toContain(
          'X --> Y',
        );
      },
    },
    {
      name: 'inline <br> inside table cells and paragraphs',
      unsupported:
        'Line one<br>Line two\n\n| Col1 | Col2 |\n| --- | --- |\n| Top<br />Bottom | Normal |',
      assertUnsupported(dom) {
        expect(dom.textContent).toContain('Line one');
        expect(dom.textContent).toContain('Line two');
        expect(dom.querySelector('table')?.textContent).toContain('Top Bottom');
      },
    },
    {
      name: 'UTF-8 BOM, NUL bytes, and CRLF line endings',
      unsupported: '\ufeffMiddle\0text\r\nwith\rCRLF\0.',
      assertUnsupported(dom) {
        expect(dom.textContent).toContain('Middletext');
        expect(dom.textContent).not.toContain('\0');
        expect(dom.textContent).not.toContain('\ufeff');
      },
    },
    {
      name: 'excessively deep nested blockquotes flattened safely',
      unsupported: `${'> '.repeat(40)}Deep quote text`,
      assertUnsupported(dom) {
        expect(dom.textContent).toContain('Deep quote text');
      },
    },
  ];

  for (const testCase of isolationCases) {
    it(`isolates ${testCase.name} without affecting surrounding blocks`, async () => {
      const prefix =
        testCase.unsupported.startsWith('---') ||
        testCase.unsupported.startsWith('+++')
          ? `${testCase.unsupported}\n\n# Before Heading\n\n- Keep bullet`
          : `# Before Heading\n\n- Keep bullet\n\n${testCase.unsupported}`;

      const full = [
        prefix,
        '',
        '## After Heading',
        '',
        '| Stay | Valid |',
        '| --- | --- |',
        '| **bold** | `ok` |',
        '',
        '```typescript',
        'const preserved = true;',
        '```',
      ].join('\n');

      const { editor } = await openAndPaste(full);
      closers.push(editor.close);

      const dom = editor.view.dom;
      expect(dom.querySelector('h1')?.textContent).toBe('Before Heading');
      expect(dom.querySelector('h2')?.textContent).toBe('After Heading');
      expect(dom.textContent).toContain('Keep bullet');
      expect(dom.textContent).toContain('const preserved = true;');
      const tables = Array.from(dom.querySelectorAll('table'));
      const trailingTable = tables[tables.length - 1];
      expect(trailingTable?.textContent).toContain('bold');
      expect(trailingTable?.textContent).toContain('ok');

      testCase.assertUnsupported(dom);
    });
  }

  it('degrades unclosed trailing mermaid fence at EOF without losing earlier blocks', async () => {
    const markdown = [
      '# Before Unclosed',
      '',
      'Valid **paragraph**.',
      '',
      '```mermaid',
      'graph TD',
      '  Unclosed --> End',
    ].join('\n');
    const { editor } = await openAndPaste(markdown);
    closers.push(editor.close);
    expect(editor.view.dom.querySelector('h1')?.textContent).toBe(
      'Before Unclosed',
    );
    expect(editor.view.dom.querySelector('strong')?.textContent).toBe(
      'paragraph',
    );
    expect(editor.view.dom.textContent).toContain('Unclosed --> End');
  });

  it('pasting top-level mermaid while cursor is inside a blockquote downgrades safely', async () => {
    const editor = await openRich('> Nested start');
    closers.push(editor.close);

    const endPos = editor.view.state.doc.content.size - 2;
    editor.view.dispatch(
      editor.view.state.tr.setSelection(
        TextSelection.create(editor.view.state.doc, endPos),
      ),
    );

    const event = dispatchPaste(editor.view.dom, {
      'text/plain': '```mermaid\ngraph TD\n  A --> B\n```',
    });
    expect(event.defaultPrevented).toBe(true);
    const serialized = editor.loaded.serialize(editor.view.state.doc);
    const reopened = await openRich(serialized);
    closers.push(reopened.close);
    expect(reopened.loaded.mode).toBe('rich');
  });

  it('handles two thematic breaks around prose without frontmatter confusion', async () => {
    const { editor } = await openAndPaste('---\n\n# Middle Title\n\n---');
    closers.push(editor.close);
    expect(editor.view.dom.querySelectorAll('hr')).toHaveLength(2);
    expect(editor.view.dom.querySelector('h1')?.textContent).toBe(
      'Middle Title',
    );
  });

  it('detects when clipboard text/html is non-semantic vs semantic or internal', async () => {
    expect(
      shouldParseClipboardAsMarkdown(
        createClipboardData({
          'text/plain': '# Title\n\nBody',
          'text/html': '<pre><code># Title\n\nBody</code></pre>',
        }),
      ),
    ).toBe('# Title\n\nBody');

    expect(
      shouldParseClipboardAsMarkdown(
        createClipboardData({
          'text/plain': '# Heading',
          'text/html':
            '<meta charset="utf-8"><div><span style="color:#000"># Heading</span></div>',
        }),
      ),
    ).toBe('# Heading');

    expect(
      shouldParseClipboardAsMarkdown(
        createClipboardData({
          'text/plain': '**bold**',
          'text/html': '<div># Title</div>',
          'vscode-editor-data': JSON.stringify({ mode: 'markdown' }),
        }),
      ),
    ).toBe('**bold**');

    expect(
      shouldParseClipboardAsMarkdown(
        createClipboardData({
          'text/plain': 'const x = 1;',
          'text/html': '<div>const x = 1;</div>',
          'vscode-editor-data': JSON.stringify({ mode: 'typescript' }),
        }),
      ),
    ).toBeNull();

    expect(
      shouldParseClipboardAsMarkdown(
        createClipboardData({
          'text/plain': 'Copied',
          'text/html': '<p data-pm-slice="1 1 []">Copied</p>',
        }),
      ),
    ).toBeNull();

    expect(
      shouldParseClipboardAsMarkdown(
        createClipboardData({
          'text/plain': 'Title\nBold',
          'text/html': '<h1>Title</h1><p><strong>Bold</strong></p>',
        }),
      ),
    ).toBeNull();

    expect(
      shouldParseClipboardAsMarkdown(
        createClipboardData({
          'text/markdown': '# Explicit MIME',
          'text/plain': 'fallback',
          'text/html': '<h1>Fallback</h1>',
        }),
      ),
    ).toBe('# Explicit MIME');
  });

  it('pastes Markdown copied from <pre> or styled spans and inserts inline markdown smoothly', async () => {
    const editor = await openRich('Hello  world');
    closers.push(editor.close);

    editor.view.dispatch(
      editor.view.state.tr.setSelection(
        TextSelection.create(editor.view.state.doc, 7),
      ),
    );
    const event = dispatchPaste(editor.view.dom, {
      'text/plain': '**styled**',
      'text/html': '<pre><span>**styled**</span></pre>',
    });
    expect(event.defaultPrevented).toBe(true);
    expect(editor.view.dom.querySelectorAll('p')).toHaveLength(1);
    expect(editor.view.dom.querySelector('strong')?.textContent).toBe('styled');
    expect(editor.view.dom.textContent).toBe('Hello styled world');
  });

  it('keeps code block paste literal without converting Markdown syntax', async () => {
    const editor = await openRich('```ts\nconst a = 1;\n```');
    closers.push(editor.close);

    const codeNode = editor.view.state.doc.firstChild!;
    const endInsideCode = 1 + codeNode.content.size;
    editor.view.dispatch(
      editor.view.state.tr.setSelection(
        TextSelection.create(editor.view.state.doc, endInsideCode),
      ),
    );
    dispatchPaste(editor.view.dom, {
      'text/plain': '# comment',
    });
    expect(editor.view.dom.querySelector('h1')).toBeNull();
    expect(editor.view.state.doc.firstChild?.type.name).toBe('code_block');
    expect(editor.view.state.doc.firstChild?.textContent).toContain(
      '# comment',
    );
  });

  it('replaces whole document selection cleanly on paste', async () => {
    const editor = await openRich('Old text');
    closers.push(editor.close);

    editor.view.dispatch(
      editor.view.state.tr.setSelection(
        new AllSelection(editor.view.state.doc),
      ),
    );
    const event = dispatchPaste(editor.view.dom, {
      'text/plain': '# New Title\n\n<details>\n\nBody\n\n</details>',
    });
    expect(event.defaultPrevented).toBe(true);
    expect(editor.view.dom.querySelector('h1')?.textContent).toBe('New Title');
    expect(editor.view.dom.textContent).not.toContain('Old text');
  });

  it('handles non-1 ordered list start, GitHub alerts, math delimiters, and YAML comments', async () => {
    const markdown = [
      '---',
      '# yaml header comment',
      'title: Math and Alerts',
      '---',
      '',
      '3. Third item',
      '4. Fourth item',
      '',
      '> [!NOTE]',
      '> Important **note**.',
      '',
      '> [!WARNING]',
      '> Caution details.',
      '',
      'Math inline $E = mc^2$ and currency $10 and $20.',
      '',
      '$$\nx = y\n$$',
      '',
      '```latex',
      '\\frac{1}{2}',
      '```',
    ].join('\n');

    const { editor, serialized } = await openAndPaste(markdown);
    closers.push(editor.close);

    const dom = editor.view.dom;
    expect(dom.textContent).toContain('title: Math and Alerts');
    const ol = dom.querySelector('ol');
    expect(ol?.getAttribute('start')).toBe('3');
    expect(ol?.textContent).toContain('Third item');
    expect(ol?.textContent).toContain('Fourth item');
    expect(dom.querySelectorAll('blockquote')).toHaveLength(2);
    expect(dom.textContent).toContain('[!NOTE]');
    expect(dom.textContent).toContain('[!WARNING]');
    expect(dom.textContent).toContain('$10 and $20');
    const inlineMath = dom.querySelector('span[data-type="math_inline"]');
    expect(inlineMath?.getAttribute('data-value')).toBe('E = mc^2');
    expect(serialized).toContain('$E = mc^2$');
    expect(serialized).toContain('```LaTeX\nx = y\n```');
    expect(serialized).toContain('```LaTeX\n\\frac{1}{2}\n```');
    const latexBlocks = editor.view.state.doc.content.content.filter(
      (node) =>
        node.type.name === 'code_block' && node.attrs.language === 'LaTeX',
    );
    expect(latexBlocks).toHaveLength(2);
    expect(latexBlocks.map((node) => node.textContent)).toEqual([
      'x = y',
      '\\frac{1}{2}',
    ]);
  });

  it('preserves supported inline and block math when pasted alongside unsupported HTML', async () => {
    const mixed = [
      '# Formula $E = mc^2$',
      '',
      'Energy $E = mc^2$ before HTML.',
      '',
      '| Item | Math |',
      '| --- | --- |',
      '| Sum | $a + b$ |',
      '',
      '<details>',
      '<summary>Hidden note</summary>',
      '</details>',
      '',
      '$$',
      'a^2 + b^2 = c^2',
      '$$',
    ].join('\n');

    const { editor, serialized } = await openAndPaste(mixed);
    closers.push(editor.close);

    const inlineMaths = Array.from(
      editor.view.dom.querySelectorAll('span[data-type="math_inline"]'),
    ).map((el) => el.getAttribute('data-value'));
    expect(inlineMaths).toEqual(['E = mc^2', 'E = mc^2', 'a + b']);
    expect(editor.view.dom.querySelector('details')).toBeNull();
    expect(editor.view.dom.textContent).toContain('<details>');
    expect(serialized).toContain('# Formula $E = mc^2$');
    expect(serialized).toContain('$E = mc^2$');
    expect(serialized).toContain('$a + b$');
    expect(serialized).toContain('```LaTeX\na^2 + b^2 = c^2\n```');
    expect(
      editor.view.state.doc.content.content.some(
        (node) =>
          node.type.name === 'code_block' &&
          node.attrs.language === 'LaTeX' &&
          node.textContent === 'a^2 + b^2 = c^2',
      ),
    ).toBe(true);
  });

  it('preserves soft line break separators adjacent to inline formatting and HTML', async () => {
    const mixedNewlines = [
      'Hello\n**world**',
      '',
      '**Hello**\nworld',
      '',
      '**First**\n**Second**',
      '',
      '<span>Before</span>\n**After**',
      '',
      'Setext\n**Title**\n===',
    ].join('\n');

    const { editor, serialized } = await openAndPaste(mixedNewlines);
    closers.push(editor.close);

    const dom = editor.view.dom;
    const paragraphs = Array.from(dom.querySelectorAll('p')).map(
      (p) => p.textContent,
    );
    expect(paragraphs).toEqual([
      'Hello world',
      'Hello world',
      'First Second',
      '<span>Before</span> After',
    ]);
    expect(dom.querySelector('h1')?.textContent).toBe('Setext Title');
    expect(serialized).toContain('Hello\n**world**');
    expect(serialized).toContain('**Hello**\nworld');
    expect(serialized).toContain('**First**\n**Second**');
    expect(serialized).toContain('# Setext **Title**');
  });

  it('falls back as whole paste without truncating when exceeding document node or token limits', async () => {
    const tokenEditor = await openRich('');
    closers.push(tokenEditor.close);
    const tooManyTokens = '**x** '.repeat(4000).trimEnd();
    dispatchPaste(tokenEditor.view.dom, {
      'text/plain': tooManyTokens,
    });
    expect(tokenEditor.view.dom.querySelectorAll('strong')).toHaveLength(0);
    expect(tokenEditor.view.state.doc.textContent).toBe(tooManyTokens);

    const paragraphEditor = await openRich('');
    closers.push(paragraphEditor.close);
    const tooManyParagraphs = 'p\n\n'.repeat(6000).trimEnd();
    dispatchPaste(paragraphEditor.view.dom, {
      'text/plain': tooManyParagraphs,
    });
    expect(paragraphEditor.view.state.doc.childCount).toBe(6000);
  }, 15_000);

  it('falls back without truncating when mixed unsupported and valid content exceeds node limits', async () => {
    const mixedEditor = await openRich('');
    closers.push(mixedEditor.close);
    const mixedOverflow = `<details>\nhi\n</details>\n\n${'p\n\n'.repeat(6000).trimEnd()}`;
    dispatchPaste(mixedEditor.view.dom, {
      'text/plain': mixedOverflow,
    });
    expect(mixedEditor.view.dom.querySelector('details')).toBeNull();
    expect(mixedEditor.view.state.doc.childCount).toBe(6003);
  }, 15_000);

  it('keeps interactive task checkboxes clickable after paste and updates serialized Markdown', async () => {
    const { editor } = await openAndPaste(
      '# Tasks\n\n- [ ] Incomplete\n- [x] Done',
      undefined,
      { interactive: true },
    );
    closers.push(editor.close);

    const checkboxes = Array.from(
      editor.view.dom.querySelectorAll<HTMLInputElement>(
        '.crepe-task-checkbox',
      ),
    );
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]?.checked).toBe(false);
    expect(checkboxes[1]?.checked).toBe(true);

    checkboxes[0]?.click();
    expect(checkboxes[0]?.checked).toBe(true);
    if (editor.loaded.mode !== 'rich') {
      throw new Error('Expected rich mode');
    }
    const saved = editor.loaded.serialize(editor.view.state.doc);
    expect(saved).toContain('- [x] Incomplete');
    expect(saved).toContain('- [x] Done');
  });

  it('survives a stressed document combining every supported and unsupported construct', async () => {
    const stressed = [
      '---',
      'title: Kitchen Sink',
      '---',
      '',
      '# Primary Heading',
      '',
      'Normal prose with **bold**, `code`, [safe](https://example.com), [unsafe](javascript:alert(1)), and footnote[^fn].',
      '',
      '[^fn]: Footnote **body** explanation.',
      '',
      '<details>',
      '<summary>Toggle</summary>',
      '',
      'Inside details',
      '</details>',
      '',
      '<!-- Multi\n\nline comment -->',
      '',
      '![remote](https://example.com/banner.png) ![local](/api/images/33333333-3333-4333-8333-333333333333)',
      '',
      '- [x] Task item',
      '- Plain item',
      '',
      '| Name | Value |',
      '| --- | --- |',
      '| A<br>B | **C** |',
      '',
      '```ts title="app.ts"',
      'const value: number = 42;',
      '```',
      '',
      '```mermaid',
      'graph LR',
      '  Start --> Finish',
      '```',
      '',
      '> ```mermaid',
      '> graph TD',
      '>   Nested --> Block',
      '> ```',
    ].join('\n');

    const { editor } = await openAndPaste(stressed, undefined, {
      interactive: true,
    });
    closers.push(editor.close);

    const dom = editor.view.dom;
    expect(dom.querySelector('h1')?.textContent).toBe('Primary Heading');
    expect(dom.querySelectorAll('a')).toHaveLength(1);
    expect(dom.querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com',
    );
    expect(dom.querySelectorAll('img')).toHaveLength(1);
    expect(
      dom.querySelector(
        'img[src="/api/images/33333333-3333-4333-8333-333333333333"]',
      ),
    ).not.toBeNull();
    expect(dom.querySelector('details')).toBeNull();
    expect(dom.textContent).toContain('Inside details');
    expect(dom.querySelectorAll('.crepe-task-checkbox')).toHaveLength(2);
    expect(dom.querySelector('table.children')?.textContent).toContain('A B');
    expect(dom.textContent).toContain('const value: number = 42;');
    expect(
      editor.view.state.doc.content.content.some(
        (node) =>
          node.type.name === 'mermaid' &&
          String(node.attrs.source).includes('Start --> Finish'),
      ),
    ).toBe(true);
    expect(dom.querySelector('[data-mermaid-editor]')).not.toBeNull();
    expect(dom.querySelector('blockquote')?.textContent).toContain(
      'Nested --> Block',
    );
  });

  it('recognizes Google Docs normal-weight <b> wrappers as plain markdown rather than semantic HTML', () => {
    expect(
      shouldParseClipboardAsMarkdown(
        createClipboardData({
          'text/plain': '# Docs Title\n\n**Bold** text',
          'text/html':
            '<b style="font-weight:normal"><span># Docs Title</span></b><p><span>**Bold** text</span></p>',
        }),
      ),
    ).toBe('# Docs Title\n\n**Bold** text');

    expect(
      shouldParseClipboardAsMarkdown(
        createClipboardData({
          'text/plain': 'Bold',
          'text/html': '<b style="font-weight:bold">Bold</b>',
        }),
      ),
    ).toBeNull();
  });

  it('classifies multi-word footnote definitions as unsupported in source-policy', () => {
    expect(
      assessSource('Here is a footnote[^1].\n\n[^1]: Multi word note.'),
    ).toBe('unsupported');
    expect(
      assessSource('```markdown\n[^1]: Code example only\n```'),
    ).toBeNull();
  });
});
