import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { ApiErrorCode, limits } from '@markdown-note-taker/contracts';
import { WorkspaceError } from '../workspace/errors.js';

const developmentOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173'];
const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

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
  return function checkLocalRequest(request, response, next) {
    const origin = localOrigin(request.get('host'));
    if (!origin) throw new WorkspaceError(ApiErrorCode.INVALID_HOST);
    // Do not let caches supply stale note bodies or revision counters.
    response.set('Cache-Control', 'no-store');
    if (!safeMethods.includes(request.method)) {
      const browserOrigin = request.get('origin');
      if (
        (browserOrigin !== undefined &&
          browserOrigin !== origin &&
          (serveWeb || !developmentOrigins.includes(browserOrigin))) ||
        request.get('sec-fetch-site') === 'cross-site'
      )
        throw new WorkspaceError(ApiErrorCode.ORIGIN_FORBIDDEN);
    }
    next();
  };
}

const parseJson = express.json({ limit: limits.requestBytes, inflate: false });

/** Apply only to routes with JSON request contracts, before service calls. */
export function jsonBody(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (request.is('application/json') === false)
    throw new WorkspaceError(ApiErrorCode.UNSUPPORTED_MEDIA_TYPE);
  parseJson(request, response, next);
}
