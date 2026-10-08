import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { signUp } from './factories/auth.factory.js';
import { createListing, reserveListing } from './factories/listing.factory.js';

describe('PATCH /listings/:listingId (C3, LST-11..13)', () => {
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

  /** A seller with an Active listing published a day ago. */
  const arrange = async () => {
    const { token, user } = await signUp(server());
    const sellerId = user.id as string;
    const listing = await createListing(prisma, sellerId, {
      publishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    return { token, sellerId, listing };
  };

  const edit = (listingId: string, body: object, token?: string) => {
    const req = request(server())
      .patch(`/api/v1/listings/${listingId}`)
      .send(body);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const savedListing = (id: string) =>
    prisma.listing.findUniqueOrThrow({ where: { id } });

  it('updates the details and returns the listing detail (LST-12)', async () => {
    const { token, sellerId, listing } = await arrange();
    const category = await prisma.category.create({
      data: { name: 'Electrónica', slug: 'electronica' },
    });

    const res = await edit(
      listing.id,
      {
        categoryId: category.id,
        title: '  Silla de roble restaurada  ',
        description: '  Barnizada de nuevo.  ',
        condition: 'LIKE_NEW',
        priceCents: 15000000,
      },
      token,
    ).expect(200);

    expect(res.body).toMatchObject({
      id: listing.id,
      title: 'Silla de roble restaurada',
      description: 'Barnizada de nuevo.',
      condition: 'LIKE_NEW',
      priceCents: 15000000,
      status: 'ACTIVE',
      category: { id: category.id, name: 'Electrónica', slug: 'electronica' },
      seller: expect.objectContaining({ id: sellerId }),
      viewer: { isSeller: true, canReserve: false, canEdit: true },
    });
    expect(await savedListing(listing.id)).toMatchObject({
      categoryId: category.id,
      title: 'Silla de roble restaurada',
      description: 'Barnizada de nuevo.',
      condition: 'LIKE_NEW',
      priceCents: 15000000,
      status: 'ACTIVE',
    });
  });

  it('changes only the fields sent (LST-12)', async () => {
    const { token, listing } = await arrange();

    await edit(listing.id, { priceCents: 12000000 }, token).expect(200);

    expect(await savedListing(listing.id)).toMatchObject({
      title: listing.title,
      description: listing.description,
      condition: listing.condition,
      categoryId: listing.categoryId,
      priceCents: 12000000,
    });
  });

  it('keeps the publish date, so the listing keeps its place in the feed (LST-13)', async () => {
    const { token, sellerId, listing } = await arrange();
    const newer = await createListing(prisma, sellerId, { title: 'Mesa' });

    const res = await edit(
      listing.id,
      { title: 'Silla editada' },
      token,
    ).expect(200);

    expect(res.body.publishedAt).toBe(listing.publishedAt.toISOString());
    expect((await savedListing(listing.id)).publishedAt).toEqual(
      listing.publishedAt,
    );
    const feed = await request(server()).get('/api/v1/listings').expect(200);
    expect(feed.body.data.map((card: { id: string }) => card.id)).toEqual([
      newer.id,
      listing.id,
    ]);
    expect(feed.body.data[1].title).toBe('Silla editada');
  });

  it('accepts the field limits: 120-char title, 2000-char description, $1 and $20,000,000 (LST-3, LST-5, GEN-2)', async () => {
    const { token, listing } = await arrange();

    await edit(
      listing.id,
      {
        title: 't'.repeat(120),
        description: 'd'.repeat(2000),
        priceCents: 100,
      },
      token,
    ).expect(200);
    await edit(
      listing.id,
      { title: 'abc', priceCents: 2_000_000_000 },
      token,
    ).expect(200);

    expect(await savedListing(listing.id)).toMatchObject({
      title: 'abc',
      description: 'd'.repeat(2000),
      priceCents: 2_000_000_000,
    });
  });

  it('returns 401 UNAUTHORIZED without a token (GEN-5)', async () => {
    const { listing } = await arrange();

    const res = await edit(listing.id, { title: 'Silla editada' }).expect(401);

    expect(res.body.code).toBe('UNAUTHORIZED');
    expect((await savedListing(listing.id)).title).toBe(listing.title);
  });

  it('returns 403 NOT_LISTING_OWNER and changes nothing for someone else’s listing (LST-11)', async () => {
    const { listing } = await arrange();
    const other = await signUp(server(), { email: 'otro@example.com' });

    const res = await edit(
      listing.id,
      { title: 'Silla editada' },
      other.token,
    ).expect(403);

    expect(res.body.code).toBe('NOT_LISTING_OWNER');
    expect((await savedListing(listing.id)).title).toBe(listing.title);
  });

  it.each([
    ['an unknown listing id', () => randomUUID()],
    ['a listing id that is not a UUID', () => 'silla-de-roble'],
  ])('returns 404 LISTING_NOT_FOUND for %s', async (_, listingId) => {
    const { token } = await arrange();

    const res = await edit(listingId(), { title: 'Silla' }, token).expect(404);

    expect(res.body.code).toBe('LISTING_NOT_FOUND');
  });

  it.each(['PENDING', 'COMPLETED'] as const)(
    'returns 409 LISTING_NOT_EDITABLE and changes nothing when the listing is %s (C3, LST-11)',
    async (status) => {
      const { token, sellerId } = await arrange();
      const buyer = await signUp(server(), { email: 'comprador@example.com' });
      const listing = await createListing(prisma, sellerId, { status });
      await reserveListing(prisma, listing, buyer.user.id as string);

      const res = await edit(
        listing.id,
        { title: 'Silla editada' },
        token,
      ).expect(409);

      expect(res.body.code).toBe('LISTING_NOT_EDITABLE');
      expect(await savedListing(listing.id)).toMatchObject({
        title: listing.title,
        status,
      });
    },
  );

  it('returns 422 CATEGORY_NOT_FOUND and changes nothing for an unknown category (LST-1)', async () => {
    const { token, listing } = await arrange();

    const res = await edit(
      listing.id,
      { categoryId: randomUUID(), title: 'Silla editada' },
      token,
    ).expect(422);

    expect(res.body.code).toBe('CATEGORY_NOT_FOUND');
    expect(await savedListing(listing.id)).toMatchObject({
      categoryId: listing.categoryId,
      title: listing.title,
    });
  });

  it('returns 400 VALIDATION_ERROR for an empty body (LST-12)', async () => {
    const { token, listing } = await arrange();

    const res = await edit(listing.id, {}, token).expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['a title of 2 characters', { title: 'ab' }, 'title'],
    ['a title of 121 characters', { title: 't'.repeat(121) }, 'title'],
    ['a title of only spaces', { title: '      ' }, 'title'],
    ['a null title', { title: null }, 'title'],
    ['an empty description', { description: '' }, 'description'],
    [
      'a description of 2001 characters',
      { description: 'd'.repeat(2001) },
      'description',
    ],
    ['an unknown condition', { condition: 'NEW' }, 'condition'],
    ['a price of 99 cents', { priceCents: 99 }, 'priceCents'],
    [
      'a price above 2,000,000,000 cents',
      { priceCents: 2_000_000_001 },
      'priceCents',
    ],
    ['a price that is not an integer', { priceCents: 100.5 }, 'priceCents'],
    ['a null price', { priceCents: null }, 'priceCents'],
    [
      'a categoryId that is not a UUID',
      { categoryId: 'muebles' },
      'categoryId',
    ],
    ['a field that is not editable', { status: 'COMPLETED' }, 'status'],
  ])(
    'returns 400 VALIDATION_ERROR and changes nothing for %s (LST-3, LST-4, LST-5, LST-12, GEN-2)',
    async (_, body, field) => {
      const { token, listing } = await arrange();

      const res = await edit(listing.id, body, token).expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field })]),
      );
      expect(await savedListing(listing.id)).toMatchObject({
        title: listing.title,
        description: listing.description,
        priceCents: listing.priceCents,
        status: 'ACTIVE',
      });
    },
  );
});
