import { MAX_PHOTO_BYTES, detectPhotoType, photoKey } from './photo-file.js';

const bytes = (...values: number[]) => Buffer.from(values);
const ascii = (text: string) => Buffer.from(text, 'latin1');

describe('detectPhotoType (LST-2)', () => {
  it('accepts a JPEG (LST-2)', () => {
    const file = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);

    expect(detectPhotoType(file)).toEqual({
      ext: 'jpg',
      contentType: 'image/jpeg',
    });
  });

  it('accepts a PNG (LST-2)', () => {
    const file = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00);

    expect(detectPhotoType(file)).toEqual({
      ext: 'png',
      contentType: 'image/png',
    });
  });

  it('accepts a WebP (LST-2)', () => {
    const file = Buffer.concat([
      ascii('RIFF'),
      bytes(0x24, 0x00, 0x00, 0x00),
      ascii('WEBPVP8 '),
    ]);

    expect(detectPhotoType(file)).toEqual({
      ext: 'webp',
      contentType: 'image/webp',
    });
  });

  it('rejects a GIF (LST-2)', () => {
    expect(detectPhotoType(ascii('GIF89a\x01\x00'))).toBeNull();
  });

  it('rejects a PDF (LST-2)', () => {
    expect(detectPhotoType(ascii('%PDF-1.7\n'))).toBeNull();
  });

  it('rejects a RIFF file that is not WebP, such as a WAV (LST-2)', () => {
    const file = Buffer.concat([
      ascii('RIFF'),
      bytes(0x24, 0x00, 0x00, 0x00),
      ascii('WAVEfmt '),
    ]);

    expect(detectPhotoType(file)).toBeNull();
  });

  it('rejects a text file whatever its name (LST-2)', () => {
    expect(detectPhotoType(ascii('not really a photo'))).toBeNull();
  });

  it('rejects an empty or truncated file (LST-2)', () => {
    expect(detectPhotoType(Buffer.alloc(0))).toBeNull();
    expect(detectPhotoType(bytes(0xff, 0xd8))).toBeNull();
  });
});

describe('MAX_PHOTO_BYTES (LST-2)', () => {
  it('is 5 MB (LST-2)', () => {
    expect(MAX_PHOTO_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe('photoKey', () => {
  it("stores the photo under the uploader's folder with its extension", () => {
    const userId = '0192d3a4-0000-7000-8000-000000000001';

    const key = photoKey(userId, 'webp');

    expect(key).toMatch(new RegExp(`^uploads/${userId}/[0-9a-f-]{36}\\.webp$`));
  });

  it('gives every upload a new key', () => {
    expect(photoKey('u', 'jpg')).not.toBe(photoKey('u', 'jpg'));
  });
});
