import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { signUp } from './factories/auth.factory.js';
import { createListing } from './factories/listing.factory.js';

describe('GET /listings (BRW-1, BRW-4, BRW-10, GEN-5, RES-6)', () => {
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
    await prisma.$executeRawUnsafe('TRUNCATE users, categories CASCADE');
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE users, categories CASCADE');
    await app.close();
  });

  const server = () => app.getHttpServer();

  const signUpSeller = async () => (await signUp(server())).user.id as string;

  const getFeed = (query: Record<string, string | number> = {}) =>
    request(server()).get('/api/v1/listings').query(query);

  const ids = (body: { data: { id: string }[] }) => body.data.map((l) => l.id);

  /** Follows `nextCursor` until the last page and returns every id seen. */
  const walkFeed = async (query: Record<string, string | number>) => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res: request.Response = await getFeed(
        cursor ? { ...query, cursor } : query,
      ).expect(200);
      seen.push(...ids(res.body));
      cursor = res.body.nextCursor;
    } while (cursor);
    return seen;
  };

  /** `count` Active listings, published one minute apart; newest first. */
  const createListings = async (sellerId: string, count: number) => {
    const created = [];
    for (let i = 0; i < count; i++) {
      created.push(
        await createListing(prisma, sellerId, {
          title: `Artículo ${i}`,
          publishedAt: new Date(Date.UTC(2026, 9, 5, 10, i)),
        }),
      );
    }
    return created.reverse().map((l) => l.id);
  };

  it('works without a token (GEN-5)', async () => {
    const res = await getFeed().expect(200);

    expect(res.body).toEqual({ data: [], nextCursor: null });
  });

  it('returns each listing as a ListingCard with the cover photo, seller city and verified flag (BRW-4)', async () => {
    const sellerId = await signUpSeller();
    await prisma.user.update({
      where: { id: sellerId },
      data: { isVerified: true },
    });
    const listing = await createListing(prisma, sellerId, { photoCount: 3 });

    const res = await getFeed().expect(200);

    expect(res.body.data).toEqual([
      {
        id: listing.id,
        title: 'Silla de comedor en roble',
        priceCents: 18000000,
        condition: 'GENTLY_USED',
        category: {
          id: listing.category.id,
          name: 'Muebles',
          slug: 'muebles',
        },
        status: 'ACTIVE',
        coverPhotoUrl: expect.stringContaining(
          `uploads/${sellerId}/photo-0.jpg?`,
        ),
        city: 'COCHABAMBA_BO',
        sellerIsVerified: true,
        publishedAt: listing.publishedAt.toISOString(),
      },
    ]);
    expect(res.body.data[0].coverPhotoUrl).toContain('X-Amz-Signature=');
  });

  it('shows the badge flag as false for an unverified seller (BRW-4)', async () => {
    const sellerId = await signUpSeller();
    await createListing(prisma, sellerId);

    const res = await getFeed().expect(200);

    expect(res.body.data[0].sellerIsVerified).toBe(false);
  });

  it('never shows Pending or Completed listings (BRW-1, RES-6)', async () => {
    const sellerId = await signUpSeller();
    const active = await createListing(prisma, sellerId, { title: 'Activo' });
    await createListing(prisma, sellerId, {
      status: 'PENDING',
      title: 'Reservado',
    });
    await createListing(prisma, sellerId, {
      status: 'COMPLETED',
      title: 'Vendido',
    });

    const res = await getFeed().expect(200);

    expect(res.body.data.map((l: { id: string }) => l.id)).toEqual([active.id]);
  });

  it('sorts newest first (BRW-1)', async () => {
    const sellerId = await signUpSeller();
    const older = await createListing(prisma, sellerId, {
      title: 'Viejo',
      publishedAt: new Date('2026-10-01T10:00:00.000Z'),
    });
    const newer = await createListing(prisma, sellerId, {
      title: 'Nuevo',
      publishedAt: new Date('2026-10-05T10:00:00.000Z'),
    });
    const middle = await createListing(prisma, sellerId, {
      title: 'Medio',
      publishedAt: new Date('2026-10-03T10:00:00.000Z'),
    });

    const res = await getFeed().expect(200);

    expect(res.body.data.map((l: { id: string }) => l.id)).toEqual([
      newer.id,
      middle.id,
      older.id,
    ]);
  });

  it('breaks ties on the same publish time by id, highest first (BRW-1)', async () => {
    const sellerId = await signUpSeller();
    const publishedAt = new Date('2026-10-05T10:00:00.000Z');
    const first = await createListing(prisma, sellerId, { publishedAt });
    const second = await createListing(prisma, sellerId, { publishedAt });
    const [high, low] = [first.id, second.id].sort().reverse();

    const res = await getFeed().expect(200);

    expect(res.body.data.map((l: { id: string }) => l.id)).toEqual([high, low]);
  });

  it('returns 20 listings per page and a cursor for the rest (BRW-10)', async () => {
    const sellerId = await signUpSeller();
    const expected = await createListings(sellerId, 22);

    const first = await getFeed().expect(200);
    const second = await getFeed({ cursor: first.body.nextCursor }).expect(200);

    expect(ids(first.body)).toEqual(expected.slice(0, 20));
    expect(first.body.nextCursor).toEqual(expect.any(String));
    expect(ids(second.body)).toEqual(expected.slice(20));
    expect(second.body.nextCursor).toBeNull();
  });

  it('honors a custom limit (BRW-10)', async () => {
    const sellerId = await signUpSeller();
    const expected = await createListings(sellerId, 3);

    const res = await getFeed({ limit: 2 }).expect(200);

    expect(ids(res.body)).toEqual(expected.slice(0, 2));
    expect(res.body.nextCursor).toEqual(expect.any(String));
  });

  it('has no next cursor when the page is exactly full (BRW-10)', async () => {
    const sellerId = await signUpSeller();
    await createListings(sellerId, 2);

    const res = await getFeed({ limit: 2 }).expect(200);

    expect(res.body.nextCursor).toBeNull();
  });

  it('pages without gaps or repeats when listings share a publish time down to the microsecond (BRW-1, BRW-10)', async () => {
    const sellerId = await signUpSeller();
    const created = await createListings(sellerId, 5);
    // Two at .123789 and three at .123456: a millisecond cursor sees all five
    // as the same instant and loses some of them.
    await prisma.$executeRawUnsafe(
      `UPDATE listings SET published_at = CASE
         WHEN id IN ('${created[0]}', '${created[1]}') THEN '2026-10-05 10:00:00.123789+00'::timestamptz
         ELSE '2026-10-05 10:00:00.123456+00'::timestamptz END`,
    );
    const byIdDesc = (list: string[]) => [...list].sort().reverse();
    const expected = [
      ...byIdDesc(created.slice(0, 2)),
      ...byIdDesc(created.slice(2)),
    ];

    const seen = await walkFeed({ limit: 2 });

    expect(seen).toEqual(expected);
  });

  it('keeps paging after the last listing of a page is reserved (BRW-10, RES-6)', async () => {
    const sellerId = await signUpSeller();
    const [a, b, c] = await createListings(sellerId, 3);
    const first = await getFeed({ limit: 2 }).expect(200);
    await prisma.listing.update({
      where: { id: b },
      data: { status: 'PENDING' },
    });

    const second = await getFeed({
      limit: 2,
      cursor: first.body.nextCursor,
    }).expect(200);

    expect(ids(first.body)).toEqual([a, b]);
    expect(ids(second.body)).toEqual([c]);
    expect(second.body.nextCursor).toBeNull();
  });

  it.each([0, 51, 'abc', 1.5])(
    'returns 400 VALIDATION_ERROR for limit=%s (BRW-10)',
    async (limit) => {
      const res = await getFeed({ limit }).expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([
          expect.objectContaining({ field: 'limit' }),
        ]),
      });
    },
  );

  it.each(['%%%', Buffer.from('not-a-uuid').toString('base64url')])(
    'returns 400 VALIDATION_ERROR for the malformed cursor %s (BRW-10)',
    async (cursor) => {
      const res = await getFeed({ cursor }).expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([
          expect.objectContaining({ field: 'cursor' }),
        ]),
      });
    },
  );
});
