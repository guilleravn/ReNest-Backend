import { randomUUID } from 'node:crypto';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export interface PhotoType {
  ext: 'jpg' | 'png' | 'webp';
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
}

const startsWith = (file: Buffer, signature: number[], offset = 0) =>
  file.length >= offset + signature.length &&
  signature.every((byte, i) => file[offset + i] === byte);

const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

// Reads the type from the file's first bytes. The client's Content-Type and
// file name are not trusted.
export function detectPhotoType(file: Buffer): PhotoType | null {
  if (startsWith(file, [0xff, 0xd8, 0xff])) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  if (startsWith(file, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ext: 'png', contentType: 'image/png' };
  }
  if (startsWith(file, RIFF) && startsWith(file, WEBP, 8)) {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  return null;
}

export function photoKey(userId: string, ext: PhotoType['ext']): string {
  return `uploads/${userId}/${randomUUID()}.${ext}`;
}
