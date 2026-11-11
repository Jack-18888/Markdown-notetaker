import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { parsePort, checkFrontendAssets } from '../config.js';
import { startServer } from '../server.js';
import { createApp } from '../app.js';
import { openWorkspace } from '../workspace/open.js';
import { temporaryWorkspace } from './temporary-workspace.js';

describe('production startup and static routing', () => {
  it.each(['', '0', '-1', '65536', '1.5', ' 3001 ', '1e3', 'not-a-port'])(
    'rejects invalid PORT %j',
    (value) => {
      expect(() => parsePort(value)).toThrow(
        'PORT must be an integer between 1 and 65535.',
      );
    },
  );
  it.each(['1', '3001', '65535'])('accepts PORT %s', (value) => {
    expect(parsePort(value)).toBe(Number(value));
  });
  it('fails before opening a database when built assets are missing', () => {
    const temporary = temporaryWorkspace();
    try {
      expect(() =>
        startServer({
          port: 0,
          serveWeb: true,
          webDirectory: join(temporary.directory, 'missing'),
          dataDirectory: temporary.dataDirectory,
        }),
      ).toThrow('Run npm run build');
      expect(existsSync(temporary.filePath)).toBe(false);
      const web = join(temporary.directory, 'web');
      mkdirSync(web);
      writeFileSync(join(web, 'index.html'), 'Incomplete');
      expect(() => checkFrontendAssets(web)).toThrow('Run npm run build');
    } finally {
      temporary.cleanup();
    }
  });
  it('serves navigation HTML and static assets while preserving API and missing-asset errors', async () => {
    const temporary = temporaryWorkspace();
    const web = join(temporary.directory, '.hidden', 'web');
    mkdirSync(join(web, 'assets'), { recursive: true });
    const html = '<!doctype html><title>Production test</title>';
    writeFileSync(join(web, 'index.html'), html);
    writeFileSync(join(web, 'assets', 'app.js'), 'export const ready = true;');
    const workspace = openWorkspace({ dataDirectory: temporary.dataDirectory });
    try {
      const app = createApp({
        workspace: workspace.service,
        serveWeb: true,
        webDirectory: web,
      });
      await request(app).get('/').expect(200, html);
      await request(app)
        .get('/workspace/example')
        .set('Accept', 'text/html')
        .expect(200, html);
      await request(app)
        .get('/assets/app.js')
        .expect(200, 'export const ready = true;');
      await request(app).get('/assets/missing.js').expect(404);
      await request(app)
        .get('/workspace/example')
        .set('Accept', 'application/json')
        .expect(404);
      await request(app)
        .get('/api/missing')
        .set('Accept', 'text/html')
        .expect(404)
        .expect('Content-Type', /json/);
    } finally {
      workspace.close();
      temporary.cleanup();
    }
  });
});
