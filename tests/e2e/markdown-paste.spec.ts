import { expect, test } from './note-fixtures.js';

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

async function pasteClipboardEntries(
  page: import('@playwright/test').Page,
  entries: Record<string, string>,
) {
  const editor = page.getByRole('textbox', { name: 'Note content' });
  await editor.click();
  await page.evaluate((payload) => {
    const target = document.querySelector(
      '[role="textbox"][aria-label="Note content"]',
    );
    if (!target) throw new Error('Editor textbox not found');
    const data = new DataTransfer();
    for (const [type, value] of Object.entries(payload)) {
      data.setData(type, value);
    }
    const event = new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
  }, entries);
}

async function openNoteInUi(
  page: import('@playwright/test').Page,
  title: string,
) {
  await page
    .getByRole('button', { name: `Open note ${title}`, exact: true })
    .click();
}

test('pasting the Folio Markdown sample with <details> renders rich blocks, autosaves, and reloads cleanly', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Folio Paste Check', '');

  await page.goto('/');
  await openNoteInUi(page, note.title);

  const editor = page.getByRole('textbox', { name: 'Note content' });
  await expect(editor).toBeVisible();

  await pasteClipboardEntries(page, { 'text/plain': folioWelcomeSample });

  await expect(
    editor.getByRole('heading', { level: 1, name: 'Welcome to Folio' }),
  ).toBeVisible();
  await expect(
    editor.getByRole('heading', { level: 2, name: 'Core Editing Mechanics' }),
  ).toBeVisible();
  await expect(
    editor.getByRole('heading', {
      level: 2,
      name: 'Keyboard & Markdown Shortcuts',
    }),
  ).toBeVisible();
  await expect(
    editor.getByRole('heading', {
      level: 3,
      name: 'Syntax-Highlighted Code Example',
    }),
  ).toBeVisible();

  // Checkboxes work interactively and table rows preserve inline code backticks.
  const checkboxes = editor.locator('.crepe-task-checkbox');
  await expect(checkboxes).toHaveCount(4);
  await expect(checkboxes.nth(0)).toBeChecked();
  await expect(checkboxes.nth(2)).not.toBeChecked();
  await checkboxes.nth(2).click();
  await expect(checkboxes.nth(2)).toBeChecked();

  await expect(editor.locator('table.children tr')).toHaveCount(7);
  await expect(editor.locator('table.children tr').nth(4)).toContainText(
    'Code Block',
  );
  await expect(editor.locator('table.children tr').nth(4)).toContainText('`');

  // Unsupported <details> HTML stays inert literal text rather than DOM HTML elements.
  await expect(editor.locator('details')).toHaveCount(0);
  await expect(editor.locator('summary')).toHaveCount(0);
  await expect(editor).toContainText('<details>');
  await expect(editor).toContainText(
    '<summary>How bidirectional Markdown sync works</summary>',
  );
  await expect(editor).toContainText('hbdvhjqnqj');
  await expect(editor).toContainText('</details>');

  // Code block and blockquotes render intact.
  await expect(editor).toContainText('interface DocumentSnapshot');
  await expect(editor.locator('blockquote')).toHaveCount(2);

  // Confirm autosave persists converted content to the server.
  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toContain('# Welcome to Folio');
  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toContain('interface DocumentSnapshot');

  // Reloading reopens in rich mode with the edited checkbox preserved.
  await page.reload();
  await openNoteInUi(page, note.title);

  const reopenedEditor = page.getByRole('textbox', { name: 'Note content' });
  await expect(reopenedEditor).toBeVisible();
  await expect(
    reopenedEditor.getByRole('heading', { level: 1, name: 'Welcome to Folio' }),
  ).toBeVisible();
  await expect(
    reopenedEditor.locator('.crepe-task-checkbox').nth(2),
  ).toBeChecked();
  await expect(reopenedEditor).toContainText('hbdvhjqnqj');
});

test('pasting mixed unsupported and dangerous syntax isolates every unsupported construct safely in Chromium', async ({
  page,
  notes,
}) => {
  const blockedNetworkUrls: string[] = [];
  await page.route('https://blocked-paste.example/**', (route) => {
    blockedNetworkUrls.push(route.request().url());
    return route.abort();
  });

  const note = await notes.create('Isolation Security Paste', '');
  await page.goto('/');
  await openNoteInUi(page, note.title);

  const editor = page.getByRole('textbox', { name: 'Note content' });
  await expect(editor).toBeVisible();

  const mixed = [
    '---',
    'title: Mixed Paste',
    '---',
    '',
    '# Section One',
    '',
    '<script>window.__xssPaste = true;</script>',
    '',
    '<!-- Secret HTML comment -->',
    '',
    'Safe **prose** with [ok](https://example.com) and [xss](javascript:window.__xssPaste=2) plus [foot][^1].',
    '',
    '![Blocked Remote](https://blocked-paste.example/pixel.png) <img src="https://blocked-paste.example/tag.png" onerror="window.__xssPaste=3">',
    '',
    '[^1]: Multi-word footnote text stays inert.',
    '',
    '1. [x] First task item',
    '2. [ ] Second task item',
    '',
    '| Kept | Cell |',
    '| --- | --- |',
    '| A<br>B | **C** |',
    '',
    '```mermaid',
    'graph TD',
    '  PasteStart --> PasteDone',
    '```',
  ].join('\n');

  await pasteClipboardEntries(page, { 'text/plain': mixed });

  await expect(
    editor.getByRole('heading', { level: 1, name: 'Section One' }),
  ).toBeVisible();
  await expect(editor.locator('script')).toHaveCount(0);
  await expect(editor.locator('img')).toHaveCount(0);
  await expect(editor.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(editor.locator('a[href="https://example.com"]')).toHaveCount(1);
  await expect(editor).toContainText('title: Mixed Paste');
  await expect(editor).toContainText('Multi-word footnote text stays inert.');
  await expect(editor.locator('table.children')).toContainText('A B');
  await expect(editor.locator('[data-mermaid-editor]')).toHaveCount(1);

  expect(
    await page.evaluate(() => (window as { __xssPaste?: unknown }).__xssPaste),
  ).toBeUndefined();
  expect(blockedNetworkUrls).toEqual([]);

  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toContain('# Section One');

  await page.reload();
  await openNoteInUi(page, note.title);
  await expect(
    page
      .getByRole('textbox', { name: 'Note content' })
      .getByRole('heading', { level: 1, name: 'Section One' }),
  ).toBeVisible();
});

test('pastes Markdown copied from <pre> or VS Code styled wrappers as rich blocks', async ({
  page,
  notes,
}) => {
  const note = await notes.create('Wrapped Clipboard Markdown', '');
  await page.goto('/');
  await openNoteInUi(page, note.title);

  const editor = page.getByRole('textbox', { name: 'Note content' });
  await expect(editor).toBeVisible();

  await pasteClipboardEntries(page, {
    'text/plain': '## Copied From Code Box\n\n- **Bold item**\n- `code item`',
    'text/html':
      '<pre><span>## Copied From Code Box</span>\n<span>- **Bold item**</span></pre>',
    'vscode-editor-data': JSON.stringify({ mode: 'markdown' }),
  });

  await expect(
    editor.getByRole('heading', { level: 2, name: 'Copied From Code Box' }),
  ).toBeVisible();
  await expect(
    editor.locator('strong', { hasText: 'Bold item' }),
  ).toBeVisible();
  await expect(editor.locator('code', { hasText: 'code item' })).toBeVisible();
  await expect
    .poll(async () => (await notes.read(note.id)).content)
    .toContain('## Copied From Code Box');
});
