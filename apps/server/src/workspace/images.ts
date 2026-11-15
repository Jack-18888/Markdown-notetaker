import type {
  ImageMime,
  ImageUploadResponse,
} from '@markdown-note-taker/contracts';

export interface StoredImage {
  mime: ImageMime;
  data: Buffer;
}
export interface ImageService {
  uploadImage(mime: string, data: Buffer): ImageUploadResponse;
  getImage(id: string): StoredImage;
}
