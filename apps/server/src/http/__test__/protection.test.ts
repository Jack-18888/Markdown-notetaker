import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  ApiErrorCode,
  errorDefinitions,
  errorResponseSchema,
  limits,
} from '@markdown-note-taker/contracts';
import { createApp } from '../../app.js';
import { WorkspaceError } from '../../workspace/errors.js';
import { apiErrorHandler } from '../errors.js';
import { jsonBody, protectApi } from '../protection.js';

// A transport probe: resource tests exercise the same middleware with SQLite.
function probe(serveWeb = false) {
  const app = express();
  app.use(protectApi({ serveWeb }));
  app.post('/write', jsonBody, (request, response) => {
    response.json({ bytes: Buffer.byteLength(JSON.stringify(request.body)) });
  });
  app.delete('/delete', (_request, response) => response.sendStatus(204));
  app.get('/failure', () => {
    throw new Error('SQLITE_ERROR: private note content');
  });
  app.get('/conflict', () => {
    throw new WorkspaceError(ApiErrorCode.REVISION_CONFLICT, {
      noteId: '123e4567-e89b-42d3-a456-426614174000',
      expectedRevision: 1,
      currentRevision: 2,
    });
  });
  app.use(apiErrorHandler);
  return app;
}

function expectError(body: unknown, code: ApiErrorCode) {
  expect(errorResponseSchema.parse(body)).toEqual({
    error: { code, message: errorDefinitions[code].message },
  });
}

describe('local API transport', () => {
  it.each([
    'attacker.example',
    '127.0.0.1.attacker.example',
    'localhost.attacker.example',
    '127.1',
    'localhost:65536',
    'localhost:0',
    'user@localhost',
    'localhost/path',
  ])('rejects unapproved Host %s on the real API', async (host) => {
    const response = await request(createApp())
      .get('/api/health')
      .set('Host', host)
      .set('X-Forwarded-Host', '127.0.0.1')
      .expect(403);
    expectError(response.body, ApiErrorCode.INVALID_HOST);
  });

  it.each(['127.0.0.1:3001', 'localhost:3002', 'localhost', 'LOCALHOST:3001'])(
    'accepts loopback Host %s and prevents API caching',
    async (host) => {
      await request(createApp())
        .get('/api/health')
        .set('Host', host)
        .expect('Cache-Control', 'no-store')
        .expect(200);
    },
  );

  it.each([
    'https://attacker.example',
    'http://localhost:9999',
    'http://127.0.0.1:5173.attacker.example',
    'http://127.0.0.1:5173/',
    'null',
  ])('rejects browser write origin %s before parsing', async (origin) => {
    const response = await request(probe())
      .post('/write')
      .set('Origin', origin)
      .set('Content-Type', 'application/json')
      .send('{private malformed body')
      .expect(403);
    expectError(response.body, ApiErrorCode.ORIGIN_FORBIDDEN);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it.each(['http://127.0.0.1:5173', 'http://localhost:5173'])(
    'allows development origin %s only in development',
    async (origin) => {
      await request(probe())
        .post('/write')
        .set('Origin', origin)
        .send({})
        .expect(200);
      const denied = await request(probe(true))
        .post('/write')
        .set('Host', '127.0.0.1:3001')
        .set('Origin', origin)
        .send({})
        .expect(403);
      expectError(denied.body, ApiErrorCode.ORIGIN_FORBIDDEN);
    },
  );

  it('allows same-origin production and non-browser JSON writes', async () => {
    await request(probe(true))
      .post('/write')
      .set('Host', 'localhost:3002')
      .set('Origin', 'http://localhost:3002')
      .send({})
      .expect(200);
    await request(probe(true)).post('/write').send({}).expect(200);
  });

  it('protects bodyless deletions and missing-Origin browser writes', async () => {
    for (const headers of [
      { Origin: 'https://attacker.example' },
      { 'Sec-Fetch-Site': 'cross-site' },
    ]) {
      const response = await request(probe())
        .delete('/delete')
        .set(headers)
        .expect(403);
      expectError(response.body, ApiErrorCode.ORIGIN_FORBIDDEN);
    }
  });

  it.each([
    'text/plain',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
  ])('rejects non-JSON mutation body %s', async (contentType) => {
    const response = await request(probe())
      .post('/write')
      .set('Content-Type', contentType)
      .send('private body')
      .expect(415);
    expectError(response.body, ApiErrorCode.UNSUPPORTED_MEDIA_TYPE);
  });

  it('maps parser errors to fixed content-free messages', async () => {
    const response = await request(probe())
      .post('/write')
      .set('Content-Type', 'application/json')
      .send('{private malformed body')
      .expect(400);
    expectError(response.body, ApiErrorCode.INVALID_INPUT);
    for (const headers of [
      { 'Content-Type': 'application/json; charset=iso-8859-1' },
      { 'Content-Encoding': 'gzip' },
    ]) {
      const unsupported = await request(probe())
        .post('/write')
        .send({})
        .set(headers)
        .expect(415);
      expectError(unsupported.body, ApiErrorCode.UNSUPPORTED_MEDIA_TYPE);
    }
  });

  it('enforces the inclusive request byte limit before JSON parsing', async () => {
    const body = JSON.stringify({
      text: 'é'.repeat((limits.requestBytes - 12) / 2),
    });
    const exact =
      body + ' '.repeat(limits.requestBytes - Buffer.byteLength(body));
    expect(Buffer.byteLength(exact)).toBe(limits.requestBytes);
    await request(probe()).post('/write').type('json').send(exact).expect(200);
    const response = await request(probe())
      .post('/write')
      .type('json')
      .send(exact + ' ')
      .expect(413);
    expectError(response.body, ApiErrorCode.PAYLOAD_TOO_LARGE);
  });

  it('sanitizes unexpected failures and retains revision conflict details', async () => {
    const failed = await request(probe()).get('/failure').expect(500);
    expectError(failed.body, ApiErrorCode.INTERNAL_ERROR);
    const conflict = await request(probe()).get('/conflict').expect(409);
    expect(errorResponseSchema.parse(conflict.body).error).toEqual({
      code: ApiErrorCode.REVISION_CONFLICT,
      message: errorDefinitions.REVISION_CONFLICT.message,
      noteId: '123e4567-e89b-42d3-a456-426614174000',
      expectedRevision: 1,
      currentRevision: 2,
    });
  });
});
