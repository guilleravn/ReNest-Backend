import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { signUp } from './factories/auth.factory.js';

describe('POST /listings (LST-1..10, GEN-2)', () => {
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

  const photoKey = (userId: string, ext = 'jpg') =>
    `uploads/${userId}/${randomUUID()}.${ext}`;

  const pickupOption = (overrides: Record<string, unknown> = {}) => ({
    locationLabel: 'Café Toscano, Av. Álvaro Obregón',
    weekdays: ['SATURDAY'],
    startTime: '10:00',
    endTime: '13:00',
    ...overrides,
  });

  /** Seller, category and a valid body to tweak one field at a time. */
  const arrange = async () => {
    const { token, user } = await signUp(server());
    const sellerId = user.id as string;
    const category = await prisma.category.create({
      data: { name: 'Muebles', slug: 'muebles' },
    });
    const body: Record<string, unknown> = {
      categoryId: category.id,
      title: 'Silla de comedor en roble',
      description: 'Roble macizo, sin rayones.',
      condition: 'GENTLY_USED',
      priceCents: 18000000,
      photoKeys: [photoKey(sellerId), photoKey(sellerId, 'png')],
      pickupOptions: [
        pickupOption(),
        pickupOption({
          locationLabel: 'Plaza Principal',
          weekdays: ['MONDAY', 'WEDNESDAY'],
          startTime: '18:30',
          endTime: '20:00',
        }),
      ],
    };
    return { token, sellerId, category, body };
  };

  const publish = (body: object, token?: string) => {
    const req = request(server()).post('/api/v1/listings').send(body);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const expectNothingSaved = async () => {
    expect(await prisma.listing.count()).toBe(0);
    expect(await prisma.listingPhoto.count()).toBe(0);
    expect(await prisma.pickupOption.count()).toBe(0);
  };

  const expectValidationError = async (
    body: object,
    token: string,
    field: string,
  ) => {
    const res = await publish(body, token).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })]),
    );
    await expectNothingSaved();
  };

  it('publishes the listing as ACTIVE with its photos and pickup pairs (LST-1, LST-6, LST-10)', async () => {
    const { token, sellerId, category, body } = await arrange();

    const res = await publish(body, token).expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      title: 'Silla de comedor en roble',
      description: 'Roble macizo, sin rayones.',
      condition: 'GENTLY_USED',
      priceCents: 18000000,
      status: 'ACTIVE',
      publishedAt: expect.any(String),
      category: { id: category.id, name: 'Muebles', slug: 'muebles' },
      photos: [
        { id: expect.any(String), url: expect.any(String), position: 0 },
        { id: expect.any(String), url: expect.any(String), position: 1 },
      ],
      pickupOptions: [
        {
          id: expect.any(String),
          locationLabel: 'Café Toscano, Av. Álvaro Obregón',
          weekdays: ['SATURDAY'],
          startTime: '10:00',
          endTime: '13:00',
        },
        {
          id: expect.any(String),
          locationLabel: 'Plaza Principal',
          weekdays: ['MONDAY', 'WEDNESDAY'],
          startTime: '18:30',
          endTime: '20:00',
        },
      ],
      seller: expect.objectContaining({ id: sellerId }),
      viewer: { isSeller: true, canReserve: false, canEdit: true },
    });
    const saved = await prisma.listing.findUniqueOrThrow({
      where: { id: res.body.id },
      include: {
        photos: { orderBy: { position: 'asc' } },
        pickupOptions: true,
      },
    });
    expect(saved).toMatchObject({ sellerId, status: 'ACTIVE' });
    expect(saved.photos.map((p) => p.storageKey)).toEqual(body.photoKeys);
    expect(saved.pickupOptions).toHaveLength(2);
  });

  it('trims the title, description and place before saving (LST-3, LST-7)', async () => {
    const { token, body } = await arrange();

    const res = await publish(
      {
        ...body,
        title: '  Silla  ',
        description: '  Roble.  ',
        pickupOptions: [pickupOption({ locationLabel: '  Plaza  ' })],
      },
      token,
    ).expect(201);

    expect(res.body).toMatchObject({ title: 'Silla', description: 'Roble.' });
    expect(res.body.pickupOptions[0].locationLabel).toBe('Plaza');
  });

  it('accepts the field limits: 3 photos, 3 pairs, 120-char title and place, 2000-char description, $1 and $20,000,000 (LST-1, LST-3, LST-5, LST-6, LST-7, GEN-2)', async () => {
    const { token, sellerId, body } = await arrange();
    const pairs = [
      pickupOption({ locationLabel: 'a'.repeat(120) }),
      pickupOption({
        locationLabel: 'abc',
        weekdays: [
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
          'SATURDAY',
          'SUNDAY',
        ],
      }),
      pickupOption({ startTime: '00:00', endTime: '23:59' }),
    ];

    await publish(
      {
        ...body,
        title: 't'.repeat(120),
        description: 'd'.repeat(2000),
        priceCents: 100,
        photoKeys: [
          photoKey(sellerId),
          photoKey(sellerId, 'png'),
          photoKey(sellerId, 'webp'),
        ],
        pickupOptions: pairs,
      },
      token,
    ).expect(201);
    await publish(
      { ...body, title: 'abc', priceCents: 2_000_000_000 },
      token,
    ).expect(201);

    expect(await prisma.listingPhoto.count()).toBe(5);
    expect(await prisma.pickupOption.count()).toBe(5);
  });

  it.each([
    ['a title of 2 characters', { title: 'ab' }, 'title'],
    ['a title of 121 characters', { title: 't'.repeat(121) }, 'title'],
    ['a title of only spaces', { title: '      ' }, 'title'],
    ['a missing title', { title: undefined }, 'title'],
    ['an empty description', { description: '' }, 'description'],
    ['a description of only spaces', { description: '   ' }, 'description'],
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
    [
      'a categoryId that is not a UUID',
      { categoryId: 'muebles' },
      'categoryId',
    ],
  ])(
    'returns 400 VALIDATION_ERROR and saves nothing for %s (LST-1, LST-3, LST-4, LST-5, GEN-2)',
    async (_, overrides, field) => {
      const { token, body } = await arrange();

      await expectValidationError({ ...body, ...overrides }, token, field);
    },
  );

  it('returns 400 VALIDATION_ERROR and saves nothing without photos (LST-1)', async () => {
    const { token, body } = await arrange();

    await expectValidationError({ ...body, photoKeys: [] }, token, 'photoKeys');
  });

  it('returns 400 VALIDATION_ERROR and saves nothing with 4 photos (LST-1)', async () => {
    const { token, sellerId, body } = await arrange();
    const photoKeys = Array.from({ length: 4 }, () => photoKey(sellerId));

    await expectValidationError({ ...body, photoKeys }, token, 'photoKeys');
  });

  it('returns 400 VALIDATION_ERROR and saves nothing with a repeated photo (LST-1)', async () => {
    const { token, sellerId, body } = await arrange();
    const key = photoKey(sellerId);

    await expectValidationError(
      { ...body, photoKeys: [key, key] },
      token,
      'photoKeys',
    );
  });

  it('returns 400 VALIDATION_ERROR and saves nothing without pickup pairs (LST-6)', async () => {
    const { token, body } = await arrange();

    await expectValidationError(
      { ...body, pickupOptions: [] },
      token,
      'pickupOptions',
    );
  });

  it('returns 400 VALIDATION_ERROR and saves nothing with 4 pickup pairs (LST-6)', async () => {
    const { token, body } = await arrange();
    const pickupOptions = Array.from({ length: 4 }, () => pickupOption());

    await expectValidationError(
      { ...body, pickupOptions },
      token,
      'pickupOptions',
    );
  });

  it.each([
    ['a place of 2 characters', { locationLabel: 'ab' }, 'locationLabel'],
    [
      'a place of 121 characters',
      { locationLabel: 'a'.repeat(121) },
      'locationLabel',
    ],
    ['a place of only spaces', { locationLabel: '     ' }, 'locationLabel'],
    ['no weekdays', { weekdays: [] }, 'weekdays'],
    ['a repeated weekday', { weekdays: ['MONDAY', 'MONDAY'] }, 'weekdays'],
    ['an unknown weekday', { weekdays: ['LUNES'] }, 'weekdays'],
    [
      '8 weekdays',
      {
        weekdays: [
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
          'SATURDAY',
          'SUNDAY',
          'MONDAY',
        ],
      },
      'weekdays',
    ],
    ['a malformed start time', { startTime: '9:00' }, 'startTime'],
    ['an hour out of range', { startTime: '24:00' }, 'startTime'],
    [
      'an end equal to the start',
      { startTime: '10:00', endTime: '10:00' },
      'endTime',
    ],
    [
      'an end before the start',
      { startTime: '13:00', endTime: '10:00' },
      'endTime',
    ],
  ])(
    'returns 400 VALIDATION_ERROR and saves nothing for a pair with %s (LST-7)',
    async (_, overrides, field) => {
      const { token, body } = await arrange();
      const pickupOptions = [pickupOption(), pickupOption(overrides)];

      await expectValidationError(
        { ...body, pickupOptions },
        token,
        `pickupOptions[1].${field}`,
      );
    },
  );

  it('returns 422 CATEGORY_NOT_FOUND and saves nothing for an unknown category (LST-1)', async () => {
    const { token, body } = await arrange();

    const res = await publish(
      { ...body, categoryId: randomUUID() },
      token,
    ).expect(422);

    expect(res.body.code).toBe('CATEGORY_NOT_FOUND');
    await expectNothingSaved();
  });

  it.each([
    ['another user’s folder', () => photoKey(randomUUID())],
    [
      'a path that escapes the caller’s folder',
      (id: string) => `uploads/${id}/../other/${randomUUID()}.jpg`,
    ],
    [
      'a name that is not an upload id',
      (id: string) => `uploads/${id}/photo.jpg`,
    ],
    [
      'an unsupported extension',
      (id: string) => `uploads/${id}/${randomUUID()}.gif`,
    ],
  ])(
    'returns 422 INVALID_PHOTO_KEY and saves nothing for a photo key in %s (LST-10)',
    async (_, badKey) => {
      const { token, sellerId, body } = await arrange();

      const res = await publish(
        { ...body, photoKeys: [photoKey(sellerId), badKey(sellerId)] },
        token,
      ).expect(422);

      expect(res.body.code).toBe('INVALID_PHOTO_KEY');
      await expectNothingSaved();
    },
  );

  it('saves no listing or photos when a pickup pair fails to save in the database (LST-10)', async () => {
    const { token, body } = await arrange();
    // Makes the last insert of the publish fail inside Postgres, after the
    // listing and photo rows were already written in the same transaction.
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION test_reject_pickup_option() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'rejected by test'; END $$`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_reject_pickup_option BEFORE INSERT ON pickup_options
      FOR EACH ROW EXECUTE FUNCTION test_reject_pickup_option()`);

    try {
      const res = await publish(body, token).expect(500);

      expect(res.body.code).toBe('INTERNAL_ERROR');
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION test_reject_pickup_option CASCADE',
      );
    }
    await expectNothingSaved();
  });

  it('returns 401 UNAUTHORIZED and saves nothing without a token (GEN-5)', async () => {
    const { body } = await arrange();

    const res = await publish(body).expect(401);

    expect(res.body.code).toBe('UNAUTHORIZED');
    await expectNothingSaved();
  });
});
