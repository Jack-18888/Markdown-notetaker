import express, { Router } from 'express';
import {
  ApiErrorCode,
  imageLimits,
  imageMimeSchema,
  imageRoutes,
} from '@markdown-note-taker/contracts';
import { WorkspaceError } from '../workspace/errors.js';
import type { ImageService } from '../workspace/images.js';

export function imageRouter(images: ImageService) {
  const router = Router();
  router.post(
    imageRoutes.upload,
    (request, _response, next) => {
      if (!imageMimeSchema.safeParse(request.get('content-type')).success)
        throw new WorkspaceError(ApiErrorCode.UNSUPPORTED_MEDIA_TYPE);
      next();
    },
    express.raw({ type: () => true, limit: imageLimits.bytes, inflate: false }),
    (request, response) => {
      response
        .status(201)
        .json(images.uploadImage(request.get('content-type')!, request.body));
    },
  );
  router.get(imageRoutes.get, (request, response) => {
    const image = images.getImage(request.params.id);
    response
      .set('Content-Type', image.mime)
      .set('X-Content-Type-Options', 'nosniff')
      .send(image.data);
  });
  return router;
}
