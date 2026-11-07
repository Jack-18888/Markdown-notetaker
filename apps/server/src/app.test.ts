import Database from 'better-sqlite3';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('scaffold runtime', () => {
  it('serves health and keeps unknown API routes as JSON errors', async () => {
    const app = createApp();
    const health = await request(app).get('/api/health').expect(200);
    expect(health.body).toEqual({
      status: 'ok',
      application: 'Markdown Note Taker',
    });
    await request(app)
      .get('/api/missing')
      .expect(404)
      .expect('Content-Type', /json/);
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
