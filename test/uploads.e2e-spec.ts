import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { MAX_PHOTO_BYTES } from './../src/storage/photo-file.js';
import { signUp } from './factories/auth.factory.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 ', 'latin1'),
]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1');

// Runs against the real S3-compatible container (S3_BUCKET_TEST).
describe('POST /uploads/photos (LST-2)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE users CASCADE');
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE users CASCADE');
    await app.close();
  });

  const server = () => app.getHttpServer();

  // The client's file name and Content-Type are deliberately misleading: the
  // API must read the type from the bytes.
  const upload = (token: string, file: Buffer) =>
    request(server())
      .post('/api/v1/uploads/photos')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file, {
        filename: 'photo.gif',
        contentType: 'application/octet-stream',
      });

  const invalidFile = {
    statusCode: 400,
    code: 'INVALID_FILE',
    message: expect.any(String),
    details: null,
  };

  const fileValidationError = {
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    message: expect.any(String),
    details: [{ field: 'file', message: expect.any(String) }],
  };

  it.each([
    { type: 'JPEG', file: JPEG, ext: 'jpg', contentType: 'image/jpeg' },
    { type: 'PNG', file: PNG, ext: 'png', contentType: 'image/png' },
    { type: 'WebP', file: WEBP, ext: 'webp', contentType: 'image/webp' },
  ])(
    'returns 201 and stores a $type under the uploader folder (LST-2)',
    async ({ file, ext, contentType }) => {
      const { token, user } = await signUp(server());

      const res = await upload(token, file).expect(201);

      expect(res.body).toEqual({
        storageKey: expect.stringMatching(
          new RegExp(`^uploads/${String(user.id)}/[0-9a-f-]{36}\\.${ext}$`),
        ),
        url: expect.any(String),
      });
      const stored = await fetch(res.body.url as string);
      expect(stored.status).toBe(200);
      expect(stored.headers.get('content-type')).toBe(contentType);
      expect(Buffer.from(await stored.arrayBuffer())).toEqual(file);
    },
  );

  it('returns 400 INVALID_FILE for a GIF sent as a JPEG (LST-2)', async () => {
    const { token } = await signUp(server());

    const res = await request(server())
      .post('/api/v1/uploads/photos')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', GIF, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(400);

    expect(res.body).toEqual(invalidFile);
  });

  it('returns 400 INVALID_FILE for an empty file (LST-2)', async () => {
    const { token } = await signUp(server());

    const res = await upload(token, Buffer.alloc(0)).expect(400);

    expect(res.body).toEqual(invalidFile);
  });

  // A JPEG header padded with zeros up to the given size.
  const jpegOfSize = (bytes: number) =>
    Buffer.concat([JPEG, Buffer.alloc(bytes - JPEG.length)]);

  it('returns 201 for a photo of exactly 5 MB (LST-2)', async () => {
    const { token } = await signUp(server());

    const res = await upload(token, jpegOfSize(MAX_PHOTO_BYTES)).expect(201);

    expect(res.body.storageKey).toMatch(/\.jpg$/);
  });

  it('returns 400 INVALID_FILE for a photo over 5 MB (LST-2)', async () => {
    const { token } = await signUp(server());

    const res = await upload(token, jpegOfSize(MAX_PHOTO_BYTES + 1)).expect(
      400,
    );

    expect(res.body).toEqual(invalidFile);
  });

  it('returns 400 VALIDATION_ERROR when the file is missing', async () => {
    const { token } = await signUp(server());

    const res = await request(server())
      .post('/api/v1/uploads/photos')
      .set('Authorization', `Bearer ${token}`)
      .field('caption', 'no file here')
      .expect(400);

    expect(res.body).toEqual(fileValidationError);
  });

  it('returns 400 VALIDATION_ERROR when the file is sent under another field', async () => {
    const { token } = await signUp(server());

    const res = await request(server())
      .post('/api/v1/uploads/photos')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', JPEG, 'photo.jpg')
      .expect(400);

    expect(res.body).toEqual(fileValidationError);
  });

  it('returns 400 VALIDATION_ERROR when two files are sent', async () => {
    const { token } = await signUp(server());

    const res = await request(server())
      .post('/api/v1/uploads/photos')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', JPEG, 'one.jpg')
      .attach('file', JPEG, 'two.jpg')
      .expect(400);

    expect(res.body).toEqual(fileValidationError);
  });

  it('returns 401 UNAUTHORIZED without a token', async () => {
    const res = await request(server())
      .post('/api/v1/uploads/photos')
      .attach('file', JPEG, 'photo.jpg')
      .expect(401);

    expect(res.body).toEqual({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: expect.any(String),
      details: null,
    });
  });
});
