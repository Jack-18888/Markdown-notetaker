import { z } from 'zod';
import { resourceIdSchema } from './primitives.ts';

export const imageLimits = { bytes: 5 * 1024 * 1024 } as const;
export const imageMimeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/webp',
]);
export type ImageMime = z.infer<typeof imageMimeSchema>;
export const imageUrl = (id: string) => `/api/images/${id}`;
export function isLocalImageUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/api/images/') &&
    resourceIdSchema.safeParse(value.slice('/api/images/'.length)).success
  );
}
export const imageUploadResponseSchema = z
  .strictObject({
    id: resourceIdSchema,
    url: z.string(),
  })
  .refine(({ id, url }) => url === imageUrl(id));
export type ImageUploadResponse = z.infer<typeof imageUploadResponseSchema>;
export const imageRoutes = {
  upload: '/api/images',
  get: '/api/images/:id',
} as const;
