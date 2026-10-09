import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { signUp } from './factories/auth.factory.js';
import { createListing } from './factories/listing.factory.js';

describe('GET /listings (BRW-1..4, BRW-10, BRW-11, GEN-5, RES-6)', () => {
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

  describe('search and category filter (BRW-2, BRW-3)', () => {
    const HOGAR = { name: 'Hogar', slug: 'hogar' };

    /** Creates one Active listing per title and returns their ids by title. */
    const listingsTitled = async (
      titles: string[],
      overrides: Parameters<typeof createListing>[2] = {},
    ) => {
      const sellerId = await signUpSeller();
      const byTitle: Record<string, string> = {};
      for (const title of titles) {
        byTitle[title] = (
          await createListing(prisma, sellerId, { ...overrides, title })
        ).id;
      }
      return byTitle;
    };

    it('matches the title in any letter case (BRW-2)', async () => {
      const ids_ = await listingsTitled([
        'Silla de Roble',
        'Mesa de comedor',
        'SILLÓN reclinable',
      ]);

      const res = await getFeed({ q: 'sIlLa' }).expect(200);

      expect(ids(res.body)).toEqual([ids_['Silla de Roble']]);
    });

    it('matches anywhere in the title (BRW-2)', async () => {
      const ids_ = await listingsTitled(['Silla de roble', 'Mesa de pino']);

      const res = await getFeed({ q: 'roble' }).expect(200);

      expect(ids(res.body)).toEqual([ids_['Silla de roble']]);
    });

    it('does not search the description (BRW-2)', async () => {
      // The factory's description is "Roble macizo, sin rayones."
      await listingsTitled(['Silla de comedor']);

      const res = await getFeed({ q: 'macizo' }).expect(200);

      expect(res.body).toEqual({ data: [], nextCursor: null });
    });

    it('never returns Pending or Completed listings that match (BRW-1, RES-6)', async () => {
      const sellerId = await signUpSeller();
      const active = await createListing(prisma, sellerId, {
        title: 'Silla activa',
      });
      await createListing(prisma, sellerId, {
        title: 'Silla reservada',
        status: 'PENDING',
      });
      await createListing(prisma, sellerId, {
        title: 'Silla vendida',
        status: 'COMPLETED',
      });

      const res = await getFeed({ q: 'silla' }).expect(200);

      expect(ids(res.body)).toEqual([active.id]);
    });

    it.each([
      ['50%', ['Descuento 50% hoy'], ['Descuento 50 hoy']],
      ['a_b', ['caja a_b'], ['caja axb']],
      ['c:\\f', ['ruta c:\\fotos'], ['ruta c:fotos']],
    ])(
      'treats %s literally, not as a LIKE wildcard (BRW-2)',
      async (q, matching, others) => {
        const ids_ = await listingsTitled([...matching, ...others]);

        const res = await getFeed({ q }).expect(200);

        expect(ids(res.body)).toEqual(matching.map((t) => ids_[t]));
      },
    );

    it.each([
      ['shorter than 2 characters', 'a'],
      ['longer than 60 characters', 'a'.repeat(61)],
      ['only spaces', '   '],
      ['shorter than 2 characters once trimmed', ' a '],
    ])('returns 400 VALIDATION_ERROR when q is %s (BRW-2)', async (_, q) => {
      const res = await getFeed({ q }).expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([
          expect.objectContaining({ field: 'q' }),
        ]),
      });
    });

    it('accepts q of exactly 2 and 60 characters (BRW-2)', async () => {
      await getFeed({ q: 'ab' }).expect(200);
      await getFeed({ q: 'a'.repeat(60) }).expect(200);
    });

    it('trims q before searching (BRW-2)', async () => {
      const ids_ = await listingsTitled(['Silla de roble', 'Mesa de pino']);

      const res = await getFeed({ q: '  silla  ' }).expect(200);

      expect(ids(res.body)).toEqual([ids_['Silla de roble']]);
    });

    it('counts the 60-character limit after trimming (BRW-2)', async () => {
      await getFeed({ q: ` ${'a'.repeat(60)} ` }).expect(200);
    });

    it('filters by category slug (BRW-3)', async () => {
      const sellerId = await signUpSeller();
      await createListing(prisma, sellerId, { title: 'Silla' });
      const lamp = await createListing(prisma, sellerId, {
        title: 'Lámpara',
        category: HOGAR,
      });

      const res = await getFeed({ category: 'hogar' }).expect(200);

      expect(ids(res.body)).toEqual([lamp.id]);
    });

    it('returns an empty page for an unknown category slug (BRW-3)', async () => {
      await listingsTitled(['Silla']);

      const res = await getFeed({ category: 'juguetes' }).expect(200);

      expect(res.body).toEqual({ data: [], nextCursor: null });
    });

    it('combines the category with the search (BRW-3)', async () => {
      const sellerId = await signUpSeller();
      await createListing(prisma, sellerId, { title: 'Silla de comedor' });
      await createListing(prisma, sellerId, {
        title: 'Lámpara de pie',
        category: HOGAR,
      });
      const match = await createListing(prisma, sellerId, {
        title: 'Silla de jardín',
        category: HOGAR,
      });

      const res = await getFeed({ q: 'silla', category: 'hogar' }).expect(200);

      expect(ids(res.body)).toEqual([match.id]);
    });

    it('pages through filtered results without gaps or repeats (BRW-3, BRW-10)', async () => {
      const sellerId = await signUpSeller();
      const expected: string[] = [];
      for (let i = 0; i < 6; i++) {
        const matches = i % 2 === 0;
        const listing = await createListing(prisma, sellerId, {
          title: matches ? `Silla ${i}` : `Mesa ${i}`,
          category: matches ? HOGAR : undefined,
          publishedAt: new Date(Date.UTC(2026, 9, 5, 10, i)),
        });
        if (matches) expected.unshift(listing.id);
      }

      const seen = await walkFeed({ q: 'silla', category: 'hogar', limit: 2 });

      expect(seen).toEqual(expected);
    });
  });

  describe('city filter (BRW-11)', () => {
    const HOGAR = { name: 'Hogar', slug: 'hogar' };

    /** A seller from Arequipa; `signUpSeller` gives one from Cochabamba. */
    const signUpArequipaSeller = async () =>
      (
        await signUp(server(), {
          email: 'pedro@example.com',
          phoneE164: '+51987654321',
          city: 'AREQUIPA_PE',
        })
      ).user.id as string;

    it('returns only listings whose seller is from that city (BRW-11)', async () => {
      const cochabamba = await signUpSeller();
      const arequipa = await signUpArequipaSeller();
      const local = await createListing(prisma, cochabamba);
      await createListing(prisma, arequipa);

      const res = await getFeed({ city: 'COCHABAMBA_BO' }).expect(200);

      expect(ids(res.body)).toEqual([local.id]);
    });

    it('returns every city when city is absent (BRW-11)', async () => {
      const cochabamba = await signUpSeller();
      const arequipa = await signUpArequipaSeller();
      const older = await createListing(prisma, cochabamba, {
        publishedAt: new Date('2026-10-01T10:00:00.000Z'),
      });
      const newer = await createListing(prisma, arequipa, {
        publishedAt: new Date('2026-10-05T10:00:00.000Z'),
      });

      const res = await getFeed().expect(200);

      expect(ids(res.body)).toEqual([newer.id, older.id]);
    });

    it('returns an empty page for a city with no listings (BRW-11)', async () => {
      await createListing(prisma, await signUpSeller());

      const res = await getFeed({ city: 'UTAH_US' }).expect(200);

      expect(res.body).toEqual({ data: [], nextCursor: null });
    });

    it('combines the city with the search and the category (BRW-2, BRW-3, BRW-11)', async () => {
      const cochabamba = await signUpSeller();
      const arequipa = await signUpArequipaSeller();
      const match = await createListing(prisma, arequipa, {
        title: 'Silla de jardín',
        category: HOGAR,
      });
      await createListing(prisma, cochabamba, {
        title: 'Silla de terraza',
        category: HOGAR,
      });
      await createListing(prisma, arequipa, {
        title: 'Lámpara de pie',
        category: HOGAR,
      });
      await createListing(prisma, arequipa, { title: 'Silla de comedor' });

      const res = await getFeed({
        city: 'AREQUIPA_PE',
        q: 'silla',
        category: 'hogar',
      }).expect(200);

      expect(ids(res.body)).toEqual([match.id]);
    });

    it('pages through one city without gaps or repeats (BRW-10, BRW-11)', async () => {
      const cochabamba = await signUpSeller();
      const arequipa = await signUpArequipaSeller();
      const expected: string[] = [];
      for (let i = 0; i < 6; i++) {
        const local = i % 2 === 0;
        const listing = await createListing(
          prisma,
          local ? cochabamba : arequipa,
          { publishedAt: new Date(Date.UTC(2026, 9, 5, 10, i)) },
        );
        if (local) expected.unshift(listing.id);
      }

      const seen = await walkFeed({ city: 'COCHABAMBA_BO', limit: 2 });

      expect(seen).toEqual(expected);
    });

    it.each(['LA_PAZ_BO', 'cochabamba_bo', 'all', ''])(
      'returns 400 VALIDATION_ERROR for city=%s (BRW-11)',
      async (city) => {
        const res = await getFeed({ city }).expect(400);

        expect(res.body).toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          details: expect.arrayContaining([
            expect.objectContaining({ field: 'city' }),
          ]),
        });
      },
    );
  });
});
