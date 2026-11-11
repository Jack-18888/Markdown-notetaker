import { expect, test } from '@playwright/test';
import { noteDetailSchema } from '@markdown-note-taker/contracts';

test('a late renderer import cannot attach the previous note preview after navigation', async ({
  page,
  request,
}) => {
  const notes = [];
  for (const [title, label] of [
    ['Delayed diagram', 'Previous'],
    ['Current diagram', 'Current'],
  ] as const)
    notes.push(
      noteDetailSchema.parse(
        await (
          await request.post('/api/notes', {
            data: {
              title,
              folderId: null,
              content: `\`\`\`mermaid\nflowchart LR\n ${label} --> Diagram\n\`\`\``,
            },
          })
        ).json(),
      ),
    );
  let release = () => {};
  let started = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await page.route(
      '**/node_modules/.vite/deps/mermaid.js*',
      async (route) => {
        started = true;
        await gate;
        await route.continue();
      },
    );
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Open note Delayed diagram', exact: true })
      .click();
    await expect.poll(() => started).toBe(true);
    await page
      .getByRole('navigation', { name: 'Workspace folders' })
      .getByRole('button', { name: 'Current diagram', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Current diagram', exact: true }),
    ).toBeVisible();
    release();
    const preview = page.getByRole('img', {
      name: 'Mermaid diagram preview',
      exact: true,
    });
    await expect(preview).toContainText('Current');
    await expect(preview).not.toContainText('Previous');
    await expect
      .poll(() => page.locator('[data-diagram-render]').count())
      .toBe(0);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
    for (const note of notes) {
      const saved = noteDetailSchema.parse(
        await (await request.get(`/api/notes/${note.id}`)).json(),
      );
      await request.delete(`/api/notes/${note.id}`, {
        data: { expectedRevision: saved.revision },
      });
    }
  }
});

test('rapid source edits and switching notes cannot publish an outdated diagram', async ({
  page,
  request,
}) => {
  const notes = [];
  for (const [title, content] of [
    ['Rapid diagram', '```mermaid\nflowchart LR\n Initial --> Diagram\n```'],
    ['Other diagram', '```mermaid\nflowchart LR\n Other --> Note\n```'],
  ] as const)
    notes.push(
      noteDetailSchema.parse(
        await (
          await request.post('/api/notes', {
            data: { title, folderId: null, content },
          })
        ).json(),
      ),
    );
  try {
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Open note Rapid diagram', exact: true })
      .click();
    const preview = page.getByRole('img', {
      name: 'Mermaid diagram preview',
      exact: true,
    });
    await expect(preview).toContainText('Initial');
    await page
      .getByRole('button', { name: 'Edit source', exact: true })
      .click();
    const source = page.getByRole('textbox', {
      name: 'Mermaid source',
      exact: true,
    });
    await source.fill('flowchart LR\n Obsolete --> Preview');
    await source.fill(
      'sequenceDiagram\n LatestActor->>FinalActor: Latest message',
    );
    await expect(preview).toContainText('LatestActor');
    await expect(preview).not.toContainText('Obsolete');
    await source.fill('flowchart LR\n Switching --> Away');
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Workspace folders' })
      .getByRole('button', { name: 'Other diagram', exact: true })
      .click();
    await expect(preview).toContainText('Other');
    await expect(preview).not.toContainText('Switching');
    await expect
      .poll(() => page.locator('[data-diagram-render]').count())
      .toBe(0);
  } finally {
    for (const note of notes) {
      const saved = noteDetailSchema.parse(
        await (await request.get(`/api/notes/${note.id}`)).json(),
      );
      await request.delete(`/api/notes/${note.id}`, {
        data: { expectedRevision: saved.revision },
      });
    }
  }
});

test('hostile diagram content stays inert and oversized source stays editable and saveable', async ({
  page,
  request,
}) => {
  const note = noteDetailSchema.parse(
    await (
      await request.post('/api/notes', {
        data: {
          title: 'Diagram safety',
          folderId: null,
          content: '```mermaid\nflowchart LR\n A --> B\n```',
        },
      })
    ).json(),
  );
  let dialogs = 0,
    external = 0;
  page.on('dialog', (dialog) => {
    dialogs++;
    void dialog.dismiss();
  });
  page.on('request', (request) => {
    if (request.url().includes('diagram.invalid')) external++;
  });
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Open note Diagram safety', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Edit source', exact: true })
      .click();
    const source = page.getByRole('textbox', {
      name: 'Mermaid source',
      exact: true,
    });
    await source.fill(
      '%%{init: {"securityLevel":"loose","flowchart":{"htmlLabels":true}}}%%\nflowchart LR\n A --> B',
    );
    await expect(
      page.getByText(
        'Diagram configuration and external styles are disabled. Its source is still editable.',
      ),
    ).toBeVisible();
    await source.fill(
      'flowchart LR\n A["<img src=https://diagram.invalid/image onerror=alert(1)>"] --> B\n click A "javascript:alert(1)"',
    );
    const diagram = page.getByRole('region', {
      name: 'Mermaid diagram',
      exact: true,
    });
    await expect(
      diagram.getByRole('img', {
        name: 'Mermaid diagram preview',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      diagram.locator(
        'img, image, a, script, foreignObject, iframe, [onload], [onerror]',
      ),
    ).toHaveCount(0);
    const oversized = 'flowchart LR\n A["' + 'x'.repeat(17 * 1024) + '"]';
    await source.fill(oversized);
    await expect(
      page.getByText(
        'This diagram is too large to preview. Its source is still editable.',
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    expect(
      noteDetailSchema.parse(
        await (await request.get(`/api/notes/${note.id}`)).json(),
      ).content,
    ).toContain(oversized);
    expect(dialogs).toBe(0);
    expect(external).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    const saved = noteDetailSchema.parse(
      await (await request.get(`/api/notes/${note.id}`)).json(),
    );
    await request.delete(`/api/notes/${note.id}`, {
      data: { expectedRevision: saved.revision },
    });
  }
});
