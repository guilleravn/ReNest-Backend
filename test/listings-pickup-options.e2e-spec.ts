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

describe('Pickup pairs of an Active listing (SAL-6, LST-7, C2)', () => {
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

  /** A seller with an Active listing of `pickupOptionCount` pairs. */
  const arrange = async (pickupOptionCount = 2) => {
    const { token, user } = await signUp(server());
    const sellerId = user.id as string;
    const listing = await createListing(prisma, sellerId, {
      pickupOptionCount,
    });
    return { token, sellerId, listing };
  };

  /** A seller's listing in `status`, reserved by another user. */
  const arrangeReserved = async (status: 'PENDING' | 'COMPLETED') => {
    const { token, sellerId } = await arrange();
    const buyer = await signUp(server(), { email: 'comprador@example.com' });
    const listing = await createListing(prisma, sellerId, { status });
    await reserveListing(prisma, listing, buyer.user.id as string);
    return { token, listing };
  };

  const savedPairIds = async (listingId: string) =>
    (
      await prisma.pickupOption.findMany({
        where: { listingId },
        orderBy: { createdAt: 'asc' },
      })
    ).map(({ id }) => id);

  describe('POST /listings/:listingId/pickup-options', () => {
    const pair = (overrides: Record<string, unknown> = {}) => ({
      locationLabel: 'Parque Central',
      weekdays: ['TUESDAY', 'THURSDAY'],
      startTime: '17:00',
      endTime: '19:30',
      ...overrides,
    });

    const add = (listingId: string, body: object, token?: string) => {
      const req = request(server())
        .post(`/api/v1/listings/${listingId}/pickup-options`)
        .send(body);
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    };

    it('adds a pair and returns it (SAL-6)', async () => {
      const { token, listing } = await arrange();

      const res = await add(
        listing.id,
        pair({ locationLabel: '  Parque Central  ' }),
        token,
      ).expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        locationLabel: 'Parque Central',
        weekdays: ['TUESDAY', 'THURSDAY'],
        startTime: '17:00',
        endTime: '19:30',
      });
      expect(await savedPairIds(listing.id)).toEqual([
        ...listing.pickupOptions.map(({ id }) => id),
        res.body.id,
      ]);
      const detail = await request(server())
        .get(`/api/v1/listings/${listing.id}`)
        .expect(200);
      expect(detail.body.pickupOptions.at(-1)).toEqual(res.body);
    });

    it('adds the third pair (SAL-6)', async () => {
      const { token, listing } = await arrange(2);

      await add(listing.id, pair(), token).expect(201);

      expect(await savedPairIds(listing.id)).toHaveLength(3);
    });

    it('returns 409 PICKUP_OPTION_LIMIT and adds nothing when the listing has 3 pairs (SAL-6)', async () => {
      const { token, listing } = await arrange(3);

      const res = await add(listing.id, pair(), token).expect(409);

      expect(res.body.code).toBe('PICKUP_OPTION_LIMIT');
      expect(await savedPairIds(listing.id)).toHaveLength(3);
    });

    it('lets only one of two concurrent adds take the third slot (SAL-6)', async () => {
      const { token, listing } = await arrange(2);

      const responses = await Promise.all([
        add(listing.id, pair(), token),
        add(listing.id, pair({ locationLabel: 'Plaza Colón' }), token),
      ]);

      expect(responses.map((res) => res.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(responses.find((res) => res.status === 409)?.body.code).toBe(
        'PICKUP_OPTION_LIMIT',
      );
      expect(await savedPairIds(listing.id)).toHaveLength(3);
    });

    it.each(['PENDING', 'COMPLETED'] as const)(
      'returns 409 LISTING_NOT_EDITABLE and adds nothing when the listing is %s (C2)',
      async (status) => {
        const { token, listing } = await arrangeReserved(status);

        const res = await add(listing.id, pair(), token).expect(409);

        expect(res.body.code).toBe('LISTING_NOT_EDITABLE');
        expect(await savedPairIds(listing.id)).toHaveLength(2);
      },
    );

    it('returns 401 UNAUTHORIZED without a token (GEN-5)', async () => {
      const { listing } = await arrange();

      const res = await add(listing.id, pair()).expect(401);

      expect(res.body.code).toBe('UNAUTHORIZED');
      expect(await savedPairIds(listing.id)).toHaveLength(2);
    });

    it('returns 403 NOT_LISTING_OWNER and adds nothing to someone else’s listing (SAL-6)', async () => {
      const { listing } = await arrange();
      const other = await signUp(server(), { email: 'otro@example.com' });

      const res = await add(listing.id, pair(), other.token).expect(403);

      expect(res.body.code).toBe('NOT_LISTING_OWNER');
      expect(await savedPairIds(listing.id)).toHaveLength(2);
    });

    it.each([
      ['an unknown listing id', () => randomUUID()],
      ['a listing id that is not a UUID', () => 'silla-de-roble'],
    ])('returns 404 LISTING_NOT_FOUND for %s', async (_, listingId) => {
      const { token } = await arrange();

      const res = await add(listingId(), pair(), token).expect(404);

      expect(res.body.code).toBe('LISTING_NOT_FOUND');
    });

    it.each([
      ['a place of 2 characters', { locationLabel: 'ab' }, 'locationLabel'],
      [
        'a place of 121 characters',
        { locationLabel: 'p'.repeat(121) },
        'locationLabel',
      ],
      ['a place of only spaces', { locationLabel: '     ' }, 'locationLabel'],
      ['no weekdays', { weekdays: [] }, 'weekdays'],
      ['a repeated weekday', { weekdays: ['MONDAY', 'MONDAY'] }, 'weekdays'],
      ['an unknown weekday', { weekdays: ['LUNES'] }, 'weekdays'],
      ['a malformed start time', { startTime: '9:00' }, 'startTime'],
      ['a malformed end time', { endTime: '24:00' }, 'endTime'],
      [
        'an end time equal to the start time',
        { startTime: '17:00', endTime: '17:00' },
        'endTime',
      ],
      [
        'an end time before the start time',
        { startTime: '17:00', endTime: '09:00' },
        'endTime',
      ],
    ])(
      'returns 400 VALIDATION_ERROR and adds nothing for %s (LST-7)',
      async (_, overrides, field) => {
        const { token, listing } = await arrange();

        const res = await add(listing.id, pair(overrides), token).expect(400);

        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.details).toEqual(
          expect.arrayContaining([expect.objectContaining({ field })]),
        );
        expect(await savedPairIds(listing.id)).toHaveLength(2);
      },
    );
  });
});
