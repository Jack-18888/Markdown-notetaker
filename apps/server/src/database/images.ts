import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  ApiErrorCode,
  imageLimits,
  imageMimeSchema,
  imageUrl,
  resourceIdSchema,
  type ImageMime,
} from '@markdown-note-taker/contracts';
import { guarded, WorkspaceError } from '../workspace/errors.js';
import { validate } from '../workspace/validation.js';

import type { ImageService, StoredImage } from '../workspace/images.js';

function matchesSignature(mime: ImageMime, data: Buffer): boolean {
  if (mime === 'image/png')
    return (
      data.length >= 24 &&
      data
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      data.toString('ascii', 12, 16) === 'IHDR'
    );
  if (mime === 'image/jpeg')
    return (
      data.length >= 4 && data[0] === 255 && data[1] === 216 && data[2] === 255
    );
  return (
    data.length >= 16 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.readUInt32LE(4) === data.length - 8 &&
    data.toString('ascii', 8, 12) === 'WEBP' &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(data.toString('ascii', 12, 16))
  );
}

export function createImageService(database: Database.Database): ImageService {
  const byDigest = database.prepare('SELECT id FROM images WHERE sha256 = ?');
  const byId = database.prepare('SELECT mime, data FROM images WHERE id = ?');
  const insert = database.prepare(
    'INSERT INTO images (id, mime, byte_length, sha256, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  return {
    uploadImage(mime, data) {
      const type = imageMimeSchema.safeParse(mime);
      if (!type.success)
        throw new WorkspaceError(ApiErrorCode.UNSUPPORTED_MEDIA_TYPE);
      if (!Buffer.isBuffer(data) || !data.length)
        throw new WorkspaceError(ApiErrorCode.INVALID_INPUT);
      if (data.length > imageLimits.bytes)
        throw new WorkspaceError(ApiErrorCode.PAYLOAD_TOO_LARGE);
      if (!matchesSignature(type.data, data))
        throw new WorkspaceError(ApiErrorCode.INVALID_INPUT);
      return guarded(() =>
        database
          .transaction(() => {
            const digest = createHash('sha256').update(data).digest('hex');
            const existing = byDigest.get(digest) as { id: string } | undefined;
            const id = existing?.id ?? randomUUID();
            if (!existing)
              insert.run(
                id,
                type.data,
                data.length,
                digest,
                data,
                new Date().toISOString(),
              );
            return { id, url: imageUrl(id) };
          })
          .immediate(),
      );
    },
    getImage(id) {
      const imageId = validate(resourceIdSchema, id);
      return guarded(() => {
        const image = byId.get(imageId) as StoredImage | undefined;
        if (!image) throw new WorkspaceError(ApiErrorCode.NOT_FOUND);
        return image;
      });
    },
  };
}
