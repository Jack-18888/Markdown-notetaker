import express, { type RequestHandler } from 'express';
import { ApiErrorCode, limits } from '@markdown-note-taker/contracts';
import { WorkspaceError } from '../workspace/errors.js';

/** Loopback authorities only; reject URL syntax and forwarded Host headers. */
function localOrigin(host: string | undefined): string | undefined {
  if (!host || !/^(localhost|127\.0\.0\.1)(?::[1-9]\d{0,4})?$/i.test(host))
    return undefined;
  try {
    return new URL(`http://${host}`).origin;
  } catch {
    return undefined;
  }
}

export function protectApi({
  serveWeb,
}: {
  serveWeb: boolean;
}): RequestHandler {
  const developmentOrigins = serveWeb
    ? []
    : ['http://127.0.0.1:5173', 'http://localhost:5173'];

  return (request, response, next) => {
    const origin = localOrigin(request.get('host'));
    if (!origin) throw new WorkspaceError(ApiErrorCode.INVALID_HOST);
    // Do not let caches supply stale note bodies or revision counters.
    response.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const browserOrigin = request.get('origin');
      if (
        (browserOrigin !== undefined &&
          browserOrigin !== origin &&
          !developmentOrigins.includes(browserOrigin)) ||
        request.get('sec-fetch-site') === 'cross-site'
      )
        throw new WorkspaceError(ApiErrorCode.ORIGIN_FORBIDDEN);
    }
    next();
  };
}

const parseJson = express.json({ limit: limits.requestBytes, inflate: false });

/** Apply only to routes with JSON request contracts, before service calls. */
export const jsonBody: RequestHandler = (request, response, next) => {
  if (request.is('application/json') === false)
    throw new WorkspaceError(ApiErrorCode.UNSUPPORTED_MEDIA_TYPE);
  parseJson(request, response, next);
};
