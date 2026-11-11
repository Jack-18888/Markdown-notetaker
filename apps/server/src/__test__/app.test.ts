import Database from 'better-sqlite3';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { temporaryApp } from './temporary-workspace.js';
import {
  errorDefinitions,
  errorResponseSchema,
} from '@markdown-note-taker/contracts';

const applications: ReturnType<typeof temporaryApp>[] = [];
afterEach(() => {
  for (const application of applications.splice(0)) application.cleanup();
});

describe('scaffold runtime', () => {
  it('serves health and keeps unknown API routes as JSON errors', async () => {
    const application = temporaryApp();
    applications.push(application);
    const { app } = application;
    const health = await request(app).get('/api/health').expect(200);
    expect(health.body).toEqual({
      status: 'ok',
      application: 'Markdown Note Taker',
    });
    const missing = await request(app)
      .get('/api/missing')
      .expect(404)
      .expect('Content-Type', /json/);
    expect(errorResponseSchema.parse(missing.body)).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: errorDefinitions.NOT_FOUND.message,
      },
    });
  });

  it('loads the native SQLite binding on the selected Node runtime', () => {
    const database = new Database(':memory:');
    try {
      expect(database.prepare('SELECT 1 AS ready').get()).toEqual({ ready: 1 });
    } finally {
      database.close();
    }
  });
});
