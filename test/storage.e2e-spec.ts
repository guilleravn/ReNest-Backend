import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module.js';
import { StorageService } from './../src/storage/storage.service.js';

// Runs against the real S3-compatible container (S3_BUCKET_TEST).
describe('StorageService (e2e)', () => {
  let moduleRef: TestingModule;
  let storage: StorageService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    storage = moduleRef.get(StorageService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('serves a stored object through its presigned URL', async () => {
    const key = `e2e/${randomUUID()}.jpg`;
    const body = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]);

    await storage.put(key, body, 'image/jpeg');
    const url = await storage.getUrl(key);
    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(body);
  });

  it('signs URLs that expire after S3_PRESIGN_TTL_SECONDS', async () => {
    const url = new URL(await storage.getUrl(`e2e/${randomUUID()}.jpg`));

    expect(url.searchParams.get('X-Amz-Expires')).toBe(
      process.env.S3_PRESIGN_TTL_SECONDS ?? '3600',
    );
  });

  it('does not serve the object without a signature (private bucket)', async () => {
    const key = `e2e/${randomUUID()}.jpg`;
    await storage.put(key, Buffer.from('photo'), 'image/jpeg');

    const signed = new URL(await storage.getUrl(key));
    const response = await fetch(`${signed.origin}${signed.pathname}`);

    expect(response.status).toBe(403);
  });
});
