import { openActionDisclosure } from './workspace-controls.js';
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { pngImage } from '../../apps/server/src/__test__/image-fixture.js';
import { workspaceMcpClient } from '../../apps/server/src/__test__/workspace-mcp-client.js';
import {
  folderSchema,
  noteDetailSchema,
  treeResponseSchema,
  imageUploadResponseSchema,
} from '@markdown-note-taker/contracts';

const project = fileURLToPath(new URL('../../', import.meta.url));
const entry = join(project, 'apps/server/dist/index.js');
const temporaryDirectory = process.env.NOTE_TAKER_E2E_DATA_DIR!;
const dataDirectory = join(temporaryDirectory, 'workspace');

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected a local TCP port.');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function launch(directory = dataDirectory) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const npmCli = process.env.npm_execpath;
  if (!npmCli)
    throw new Error('Run npm run test:production to launch npm start.');
  const child = spawn(process.execPath, [npmCli, 'start'], {
    cwd: project,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      DATA_DIR: directory,
    },
    stdio: 'ignore',
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  let exited = false;
  const closed = new Promise<void>((resolve) => {
    child.once('exit', () => {
      exited = true;
      resolve();
    });
    child.once('error', () => {
      exited = true;
      resolve();
    });
  });
  const stop = async () => {
    if (!exited && child.pid) {
      if (process.platform === 'win32')
        spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      else process.kill(-child.pid, 'SIGTERM');
    }
    await closed;
  };
  try {
    await expect
      .poll(
        async () => {
          if (exited)
            throw new Error(
              'Built server exited before startup. Run npm run build first.',
            );
          try {
            return (
              await fetch(`${origin}/api/health`, {
                signal: AbortSignal.timeout(500),
              })
            ).status;
          } catch {
            return 0;
          }
        },
        { timeout: 15_000, intervals: [100, 200, 500] },
      )
      .toBe(200);
  } catch (error) {
    await stop();
    throw error;
  }
  return { origin, stop };
}

test('built MCP and browser saves reject stale revisions and preserve the browser draft', async ({
  page,
  request,
}) => {
  const directory = join(temporaryDirectory, 'mcp-browser');
  const runtime = await launch(directory);
  const mcp = workspaceMcpClient(directory, { args: ['--write'], built: true });
  try {
    const note = noteDetailSchema.parse(
      await (
        await request.post(`${runtime.origin}/api/notes`, {
          data: {
            title: 'Browser and agent',
            folderId: null,
            content: 'Original',
          },
        })
      ).json(),
    );
    await mcp.connect();
    const read = async () =>
      noteDetailSchema.parse(
        (
          await mcp.client.callTool({
            name: 'get_note',
            arguments: { id: note.id },
          })
        ).structuredContent,
      );
    const update = (expectedRevision: number, content: string) =>
      mcp.client.callTool({
        name: 'update_note',
        arguments: { id: note.id, expectedRevision, content },
      });
    const original = await read();
    await page.clock.install();
    await page.goto(runtime.origin);
    const openNote = page.getByRole('button', {
      name: `Open note ${note.title}`,
      exact: true,
    });
    await openNote.click();
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    const save = page.getByRole('button', { name: 'Save note', exact: true });
    await expect(body).toHaveText(original.content);
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await body.fill('First browser save');
    await save.click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();

    const stale = await update(original.revision, 'Stale agent draft');
    expect(stale.isError).toBe(true);
    expect(stale.structuredContent).toMatchObject({
      error: {
        code: 'REVISION_CONFLICT',
        noteId: note.id,
        expectedRevision: 1,
        currentRevision: 2,
      },
    });
    const afterBrowser = await read();
    expect(afterBrowser.content).toBe('First browser save');

    await body.fill('Keep pending browser draft');
    const committed = await update(
      afterBrowser.revision,
      'Agent saved summary',
    );
    expect(committed.structuredContent).toEqual({ id: note.id, revision: 3 });
    await save.click();
    const reload = page.getByRole('button', {
      name: 'Reload saved note',
      exact: true,
    });
    await expect(reload).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Save as new note', exact: true }),
    ).toBeVisible();
    await expect(body).toHaveText('Keep pending browser draft');
    expect(await read()).toMatchObject({
      revision: 3,
      content: 'Agent saved summary',
    });

    await reload.click();
    await page
      .getByRole('button', { name: 'Discard and reload', exact: true })
      .click();
    await expect(body).toHaveText('Agent saved summary');
    await page.clock.resume();
    await page.reload();
    await openNote.click();
    await expect(body).toHaveText('Agent saved summary');
  } finally {
    try {
      await mcp.close();
    } finally {
      await runtime.stop();
    }
  }
});

test('built assets support writing, diagrams, files, protected API, and restart durability without Vite', async ({
  page,
  request,
}) => {
  let runtime = await launch();
  let externalRequests = 0;
  page.on('request', (request) => {
    if (!request.url().startsWith(runtime.origin + '/')) externalRequests++;
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:\d+\/)/, (route) =>
    route.abort(),
  );
  try {
    let parentId: string | null = null;
    for (let index = 1; index <= 3; index++) {
      const folder = folderSchema.parse(
        await (
          await request.post(`${runtime.origin}/api/folders`, {
            data: { name: `Production level ${index}`, parentId },
          })
        ).json(),
      );
      parentId = folder.id;
    }
    const openFolder = async () => {
      for (let index = 1; index <= 3; index++)
        await page
          .getByRole('button', {
            name: `Open folder Production level ${index}`,
            exact: true,
          })
          .click();
    };
    await page.goto(runtime.origin + '/workspace/production');
    expect(await page.content()).not.toContain('/@vite/client');
    await openFolder();
    await openActionDisclosure(page, 'Workspace actions');
    await page
      .getByRole('button', { name: 'Import Markdown', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Import Markdown',
      exact: true,
    });
    const payload = 'flowchart LR\r\n  A --> B  ';
    const imageUpload = await request.post(`${runtime.origin}/api/images`, {
      headers: { 'Content-Type': 'image/png' },
      data: pngImage,
    });
    expect(imageUpload.status()).toBe(201);
    const image = imageUploadResponseSchema.parse(await imageUpload.json());
    const source =
      '# Production note\r\n\r\n```mermaid\r\n' +
      payload +
      '\r\n```\r\n\r\n```mermaid\nsequenceDiagram\n Alice->>Bob: Local\n```\n\nArea is $\\pi r^2$.\n\nFinal paragraph.' +
      `\n\n![Production image](${image.url})`;
    await dialog.getByLabel('Markdown file', { exact: true }).setInputFiles({
      name: 'Production import.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(source),
    });
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/notes') &&
        response.request().method() === 'POST',
    );
    await dialog
      .getByRole('button', { name: 'Import note', exact: true })
      .click();
    const note = noteDetailSchema.parse(await (await created).json());
    expect(note).toMatchObject({ content: source, folderId: parentId });
    await expect(
      page.getByRole('img', { name: 'Mermaid diagram preview', exact: true }),
    ).toHaveCount(2);
    await expect(
      page
        .getByRole('img', { name: 'Mermaid diagram preview', exact: true })
        .first(),
    ).toBeVisible();
    const body = page.getByRole('textbox', {
      name: 'Note content',
      exact: true,
    });
    await expect(body.locator('.katex')).toBeVisible();
    await expect(
      body.getByRole('img', { name: 'Production image', exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          await document.fonts.ready;
          return Array.from(document.fonts).some(
            (font) =>
              font.family.startsWith('KaTeX') && font.status === 'loaded',
          );
        }),
      )
      .toBe(true);
    await body.locator(':scope > p').last().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Saved from production.');
    const downloaded = page.waitForEvent('download');
    await openActionDisclosure(page, 'Note actions');
    await page
      .getByRole('button', { name: 'Export Markdown', exact: true })
      .click();
    const bytes = await readFile((await (await downloaded).path())!);
    const saved = noteDetailSchema.parse(
      await (
        await request.get(`${runtime.origin}/api/notes/${note.id}`)
      ).json(),
    );
    expect(bytes).toEqual(Buffer.from(saved.content));
    expect(saved.content).toContain(payload);
    expect(saved.content).toContain('Saved from production.');
    const missing = await request.get(`${runtime.origin}/api/missing`);
    expect(missing.status()).toBe(404);
    expect(missing.headers()['content-type']).toContain('application/json');
    expect(
      (await request.get(`${runtime.origin}/assets/missing.js`)).status(),
    ).toBe(404);
    expect(
      (
        await request.patch(`${runtime.origin}/api/notes/${note.id}`, {
          headers: { Origin: 'http://127.0.0.1:5173' },
          data: { expectedRevision: saved.revision, title: 'Forbidden' },
        })
      ).status(),
    ).toBe(403);
    const tree = treeResponseSchema.parse(
      await (await request.get(`${runtime.origin}/api/tree`)).json(),
    );
    await runtime.stop();
    runtime = await launch();
    expect(
      await (await request.get(`${runtime.origin}${image.url}`)).body(),
    ).toEqual(pngImage);
    expect(
      treeResponseSchema.parse(
        await (await request.get(`${runtime.origin}/api/tree`)).json(),
      ),
    ).toEqual(tree);
    expect(
      noteDetailSchema.parse(
        await (
          await request.get(`${runtime.origin}/api/notes/${note.id}`)
        ).json(),
      ),
    ).toEqual(saved);
    await page.goto(runtime.origin);
    await openFolder();
    await page
      .getByRole('button', { name: 'Open note Production import', exact: true })
      .click();
    await expect(body).toContainText('Saved from production.');
    await expect(
      body.getByRole('img', { name: 'Production image', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Mermaid diagram preview', exact: true }),
    ).toHaveCount(2);
    expect(externalRequests).toBe(0);
    await page.screenshot({
      path: 'test-results/production-restart.png',
      fullPage: true,
    });
  } finally {
    await runtime.stop();
  }
});

test('built CLI fails cleanly on invalid port and data-directory configuration', async () => {
  await mkdir(dataDirectory, { recursive: true });
  const blockedPath = join(dataDirectory, 'blocked-directory');
  await writeFile(blockedPath, 'A file, not a data directory.');
  for (const [overrides, expected] of [
    [
      { PORT: 'not-a-port', DATA_DIR: dataDirectory },
      'PORT must be an integer',
    ],
    [{ PORT: '3001', DATA_DIR: '' }, 'DATA_DIR must be a non-empty path'],
    [
      { PORT: '3001', DATA_DIR: blockedPath },
      'Cannot prepare the data directory',
    ],
  ] as const) {
    const result = spawnSync(process.execPath, [entry], {
      cwd: project,
      env: { ...process.env, NODE_ENV: 'production', ...overrides },
      encoding: 'utf8',
      timeout: 10_000,
      windowsHide: true,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expected);
    expect(result.stderr).not.toContain(' at ');
  }
});

test('a stopped-server directory backup restores hierarchy and exact source in a separate directory', async ({
  request,
}) => {
  const original = join(temporaryDirectory, 'backup-original');
  const backup = join(temporaryDirectory, 'backup-copy');
  const restored = join(temporaryDirectory, 'backup-restored');
  let runtime = await launch(original);
  try {
    const image = imageUploadResponseSchema.parse(
      await (
        await request.post(`${runtime.origin}/api/images`, {
          headers: { 'Content-Type': 'image/png' },
          data: pngImage,
        })
      ).json(),
    );
    const folder = folderSchema.parse(
      await (
        await request.post(`${runtime.origin}/api/folders`, {
          data: { name: 'Backup folder', parentId: null },
        })
      ).json(),
    );
    const source =
      '\ufeff# Backup 雪 😀\r\n\r\n```mermaid\r\nflowchart LR\r\n A --> B  \r\n```\r\n' +
      `\n![Backup image](${image.url})`;
    const note = noteDetailSchema.parse(
      await (
        await request.post(`${runtime.origin}/api/notes`, {
          data: { title: 'Backup note', folderId: folder.id, content: source },
        })
      ).json(),
    );
    const tree = treeResponseSchema.parse(
      await (await request.get(`${runtime.origin}/api/tree`)).json(),
    );
    await runtime.stop();
    await cp(original, backup, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    await cp(backup, restored, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    runtime = await launch(restored);
    expect(
      await (await request.get(`${runtime.origin}${image.url}`)).body(),
    ).toEqual(pngImage);
    expect(
      treeResponseSchema.parse(
        await (await request.get(`${runtime.origin}/api/tree`)).json(),
      ),
    ).toEqual(tree);
    expect(
      noteDetailSchema.parse(
        await (
          await request.get(`${runtime.origin}/api/notes/${note.id}`)
        ).json(),
      ),
    ).toEqual(note);
  } finally {
    await runtime.stop();
  }
});
