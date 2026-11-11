import express from 'express';
import { extname } from 'node:path';
import {
  apiContracts,
  ApiErrorCode,
  applicationName,
  errorDefinitions,
  errorResponseSchema,
  healthResponseSchema,
  type HealthResponse,
} from '@markdown-note-taker/contracts';
import { apiErrorHandler } from './http/errors.js';
import { protectApi } from './http/protection.js';
import { workspaceRouter } from './http/workspace.js';
import type { WorkspaceService } from './workspace/types.js';
import { frontendDirectory } from './config.js';

interface AppOptions {
  workspace: WorkspaceService;
  serveWeb?: boolean;
  webDirectory?: string;
}

export function createApp({
  workspace,
  serveWeb = false,
  webDirectory = frontendDirectory,
}: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', protectApi({ serveWeb }));

  app.get(apiContracts.health.path, (_request, response) => {
    const health: HealthResponse = {
      status: 'ok',
      application: applicationName,
    };
    response
      .status(apiContracts.health.status)
      .json(healthResponseSchema.parse(health));
  });

  app.use(workspaceRouter(workspace));

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
    app.use(express.static(webDirectory));
    app.get('/{*path}', (request, response, next) => {
      if (extname(request.path) || !request.accepts('html')) return next();
      response.sendFile('index.html', { root: webDirectory });
    });
  }

  app.use(apiErrorHandler);
  return app;
}
