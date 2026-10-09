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

  it('returns 409 LISTING_NOT_EDITABLE when a reservation commits while the edit waits (LST-11)', async () => {
    const { token, listing } = await arrange();
    const buyer = await signUp(server(), { email: 'comprador@example.com' });

    // A reservation in progress holds the listing row. The edit must wait for
    // it and then see the listing Pending, not overwrite what the buyer saw.
    const { editing } = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM listings WHERE id = ${listing.id}::uuid FOR UPDATE`;

      let settled = false;
      const editing = edit(listing.id, { title: 'Silla editada' }, token).then(
        (response) => {
          settled = true;
          return response;
        },
      );
      // Polls until the edit is blocked on the row lock (or answered early).
      while (!settled) {
        const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`;
        if (waiting > 0) break;
      }

      await tx.listing.update({
        where: { id: listing.id },
        data: { status: 'PENDING' },
      });
      await tx.reservation.create({
        data: {
          listingId: listing.id,
          pickupOptionId: listing.pickupOptions[0].id,
          buyerId: buyer.user.id as string,
        },
      });
      // Wrapped, so the transaction commits without waiting for the edit.
      return { editing };
    });
    const res = await editing;

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LISTING_NOT_EDITABLE');
    expect(await savedListing(listing.id)).toMatchObject({
      title: listing.title,
      status: 'PENDING',
    });
  });

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

  describe('photos (LST-1, LST-12)', () => {
    const photoKey = (userId: string, ext = 'jpg') =>
      `uploads/${userId}/${randomUUID()}.${ext}`;

    /** A seller with an Active listing of 3 photos, in position order. */
    const arrangeWithPhotos = async () => {
      const { token, user } = await signUp(server());
      const sellerId = user.id as string;
      const listing = await createListing(prisma, sellerId, { photoCount: 3 });
      return {
        token,
        sellerId,
        listing,
        photos: await savedPhotos(listing.id),
      };
    };

    const savedPhotos = (listingId: string) =>
      prisma.listingPhoto.findMany({
        where: { listingId },
        orderBy: { position: 'asc' },
      });

    const photoSet = (photos: { id: string; storageKey: string }[]) =>
      photos.map(({ id, storageKey }) => ({ id, storageKey }));

    it('reorders the kept photos, so the first one becomes the cover (LST-12)', async () => {
      const { token, listing, photos } = await arrangeWithPhotos();
      const [a, b, c] = photos;

      const res = await edit(
        listing.id,
        { photos: [{ photoId: c.id }, { photoId: a.id }, { photoId: b.id }] },
        token,
      ).expect(200);

      expect(res.body.photos).toEqual([
        { id: c.id, url: expect.any(String), position: 0 },
        { id: a.id, url: expect.any(String), position: 1 },
        { id: b.id, url: expect.any(String), position: 2 },
      ]);
      expect(photoSet(await savedPhotos(listing.id))).toEqual(
        photoSet([c, a, b]),
      );
    });

    it('replaces the whole set: new uploads are added and photos left out are removed (LST-12)', async () => {
      const { token, sellerId, listing, photos } = await arrangeWithPhotos();
      const newKey = photoKey(sellerId, 'webp');

      await edit(
        listing.id,
        { photos: [{ storageKey: newKey }, { photoId: photos[1].id }] },
        token,
      ).expect(200);

      const saved = await savedPhotos(listing.id);
      expect(
        saved.map(({ storageKey, position }) => ({ storageKey, position })),
      ).toEqual([
        { storageKey: newKey, position: 0 },
        { storageKey: photos[1].storageKey, position: 1 },
      ]);
      expect(saved[1].id).toBe(photos[1].id);
    });

    it('accepts a set of 1 photo and a set of 3 new photos (LST-1)', async () => {
      const { token, sellerId, listing, photos } = await arrangeWithPhotos();
      const newKeys = [
        photoKey(sellerId),
        photoKey(sellerId, 'png'),
        photoKey(sellerId, 'webp'),
      ];

      await edit(
        listing.id,
        { photos: [{ photoId: photos[2].id }] },
        token,
      ).expect(200);
      expect(photoSet(await savedPhotos(listing.id))).toEqual(
        photoSet([photos[2]]),
      );

      await edit(
        listing.id,
        { photos: newKeys.map((storageKey) => ({ storageKey })) },
        token,
      ).expect(200);
      expect(
        (await savedPhotos(listing.id)).map(({ storageKey }) => storageKey),
      ).toEqual(newKeys);
    });

    it.each([
      ['no photos', () => []],
      [
        '4 photos',
        (id: string) =>
          Array.from({ length: 4 }, () => ({ storageKey: photoKey(id) })),
      ],
      [
        'the same new upload twice',
        (id: string) => {
          const storageKey = photoKey(id);
          return [{ storageKey }, { storageKey }];
        },
      ],
      ['a null set', () => null],
    ])(
      'returns 400 VALIDATION_ERROR and keeps the photos for %s (LST-1)',
      async (_, photosFor) => {
        const { token, sellerId, listing, photos } = await arrangeWithPhotos();

        const res = await edit(
          listing.id,
          { title: 'Silla editada', photos: photosFor(sellerId) },
          token,
        ).expect(400);

        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'photos' }),
          ]),
        );
        expect(photoSet(await savedPhotos(listing.id))).toEqual(
          photoSet(photos),
        );
        expect((await savedListing(listing.id)).title).toBe(listing.title);
      },
    );

    it('returns 400 VALIDATION_ERROR and keeps the photos when a kept photo is repeated (LST-1)', async () => {
      const { token, listing, photos } = await arrangeWithPhotos();

      const res = await edit(
        listing.id,
        { photos: [{ photoId: photos[0].id }, { photoId: photos[0].id }] },
        token,
      ).expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(photoSet(await savedPhotos(listing.id))).toEqual(photoSet(photos));
    });

    it('returns 400 VALIDATION_ERROR and keeps the photos when a kept photo is sent again as a new upload (LST-1)', async () => {
      const { token, sellerId, listing } = await arrangeWithPhotos();
      // A kept photo whose key is a real upload, as published listings have.
      const cover = await prisma.listingPhoto.update({
        where: { listingId_position: { listingId: listing.id, position: 0 } },
        data: { storageKey: photoKey(sellerId) },
      });
      const photos = await savedPhotos(listing.id);

      const res = await edit(
        listing.id,
        { photos: [{ photoId: cover.id }, { storageKey: cover.storageKey }] },
        token,
      ).expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toEqual([
        expect.objectContaining({ field: 'photos' }),
      ]);
      expect(photoSet(await savedPhotos(listing.id))).toEqual(photoSet(photos));
    });

    it.each([
      [
        'both a photoId and a storageKey',
        (id: string, photoId: string) => ({
          photoId,
          storageKey: photoKey(id),
        }),
        'photos[0].photoId',
      ],
      ['neither a photoId nor a storageKey', () => ({}), 'photos[0].photoId'],
      [
        'a photoId that is not a UUID',
        () => ({ photoId: 'foto-1' }),
        'photos[0].photoId',
      ],
      ['a null photoId', () => ({ photoId: null }), 'photos[0].photoId'],
      [
        'a storageKey that is not a string',
        () => ({ storageKey: 42 }),
        'photos[0].storageKey',
      ],
    ])(
      'returns 400 VALIDATION_ERROR and keeps the photos for an item with %s (LST-12)',
      async (_, item, field) => {
        const { token, sellerId, listing, photos } = await arrangeWithPhotos();

        const res = await edit(
          listing.id,
          { photos: [item(sellerId, photos[0].id)] },
          token,
        ).expect(400);

        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.details).toEqual(
          expect.arrayContaining([expect.objectContaining({ field })]),
        );
        expect(photoSet(await savedPhotos(listing.id))).toEqual(
          photoSet(photos),
        );
      },
    );

    it('returns 422 INVALID_PHOTO_KEY and changes nothing for a photo of another listing (LST-12)', async () => {
      const { token, sellerId, listing, photos } = await arrangeWithPhotos();
      const other = await createListing(prisma, sellerId, { title: 'Mesa' });
      const [otherPhoto] = await savedPhotos(other.id);

      const res = await edit(
        listing.id,
        {
          title: 'Silla editada',
          photos: [{ photoId: photos[0].id }, { photoId: otherPhoto.id }],
        },
        token,
      ).expect(422);

      expect(res.body.code).toBe('INVALID_PHOTO_KEY');
      expect(photoSet(await savedPhotos(listing.id))).toEqual(photoSet(photos));
      expect(photoSet(await savedPhotos(other.id))).toEqual(
        photoSet([otherPhoto]),
      );
      expect((await savedListing(listing.id)).title).toBe(listing.title);
    });

    it.each([
      ['another user’s folder', () => photoKey(randomUUID())],
      [
        'a path that escapes the caller’s folder',
        (id: string) => `uploads/${id}/../other/${randomUUID()}.jpg`,
      ],
      [
        'an unsupported extension',
        (id: string) => `uploads/${id}/${randomUUID()}.gif`,
      ],
    ])(
      'returns 422 INVALID_PHOTO_KEY and changes nothing for a new upload in %s (LST-12)',
      async (_, badKey) => {
        const { token, sellerId, listing, photos } = await arrangeWithPhotos();

        const res = await edit(
          listing.id,
          {
            title: 'Silla editada',
            photos: [
              { photoId: photos[0].id },
              { storageKey: badKey(sellerId) },
            ],
          },
          token,
        ).expect(422);

        expect(res.body.code).toBe('INVALID_PHOTO_KEY');
        expect(photoSet(await savedPhotos(listing.id))).toEqual(
          photoSet(photos),
        );
        expect((await savedListing(listing.id)).title).toBe(listing.title);
      },
    );

    it('returns 409 LISTING_NOT_EDITABLE and keeps the photos of a Pending listing (LST-11)', async () => {
      const { token, sellerId } = await arrangeWithPhotos();
      const buyer = await signUp(server(), { email: 'comprador@example.com' });
      const listing = await createListing(prisma, sellerId, {
        status: 'PENDING',
        photoCount: 2,
      });
      await reserveListing(prisma, listing, buyer.user.id as string);
      const photos = await savedPhotos(listing.id);

      const res = await edit(
        listing.id,
        { photos: [{ storageKey: photoKey(sellerId) }] },
        token,
      ).expect(409);

      expect(res.body.code).toBe('LISTING_NOT_EDITABLE');
      expect(photoSet(await savedPhotos(listing.id))).toEqual(photoSet(photos));
    });
  });
});
