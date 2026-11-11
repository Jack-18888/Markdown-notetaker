import express from 'express';
import { fileURLToPath } from 'node:url';
import {
  apiContracts,
  ApiErrorCode,
  applicationName,
  errorDefinitions,
  errorResponseSchema,
  healthResponseSchema,
  type HealthResponse,
} from '@markdown-note-taker/contracts';

export function createApp({ serveWeb = false } = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.get(apiContracts.health.path, (_request, response) => {
    const health: HealthResponse = {
      status: 'ok',
      application: applicationName,
    };
    response
      .status(apiContracts.health.status)
      .json(healthResponseSchema.parse(health));
  });

  app.use('/api', (_request, response) => {
    response.status(errorDefinitions[ApiErrorCode.NOT_FOUND].status).json(
      errorResponseSchema.parse({
        error: {
          code: ApiErrorCode.NOT_FOUND,
          message: errorDefinitions[ApiErrorCode.NOT_FOUND].message,
        },
      }),
    );
  });

  if (serveWeb) {
    const webDirectory = fileURLToPath(
      new URL('../../web/dist/', import.meta.url),
    );
    app.use(express.static(webDirectory));
  }

  return app;
}
