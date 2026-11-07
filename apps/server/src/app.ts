import express from 'express';
import { fileURLToPath } from 'node:url';
import {
  applicationName,
  type HealthResponse,
} from '@markdown-note-taker/shared';

export function createApp({ serveWeb = false } = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_request, response) => {
    const health: HealthResponse = {
      status: 'ok',
      application: applicationName,
    };
    response.json(health);
  });

  app.use('/api', (_request, response) => {
    response
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Unknown API route' } });
  });

  if (serveWeb) {
    const webDirectory = fileURLToPath(
      new URL('../../web/dist/', import.meta.url),
    );
    app.use(express.static(webDirectory));
  }

  return app;
}
