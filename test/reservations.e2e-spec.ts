import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { signUp } from './factories/auth.factory.js';
import { createListing } from './factories/listing.factory.js';

describe('POST /reservations (RES-1..8, GEN-10)', () => {
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

  const signUpSeller = () =>
    signUp(server(), {
      email: 'laura@example.com',
      fullName: 'Laura Gómez',
      phoneE164: '+59171234567',
      city: 'COCHABAMBA_BO',
    });

  const signUpBuyer = (n = 1) =>
    signUp(server(), {
      email: `buyer${n}@example.com`,
      fullName: `Andrés Pérez ${n}`,
      phoneE164: `+5198765432${n}`,
      city: 'AREQUIPA_PE',
    });

  const reserve = (body: object, token?: string) => {
    const req = request(server()).post('/api/v1/reservations').send(body);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const listingStatus = async (id: string) =>
    (await prisma.listing.findUniqueOrThrow({ where: { id } })).status;

  it('reserves the listing with the chosen pickup pair and returns the reservation (RES-2, RES-3, RES-7)', async () => {
    const { user: seller } = await signUpSeller();
    const { token, user: buyer } = await signUpBuyer();
    const listing = await createListing(prisma, seller.id as string);
    const option = listing.pickupOptions.find(
      (o) => o.locationLabel === 'Plaza Principal',
    )!;

    const res = await reserve(
      { listingId: listing.id, pickupOptionId: option.id },
      token,
    ).expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      viewerRole: 'BUYER',
      reservedAt: expect.any(String),
      sellerHandedOverAt: null,
      buyerReceivedAt: null,
      listing: {
        id: listing.id,
        title: 'Silla de comedor en roble',
        priceCents: 18000000,
        condition: 'GENTLY_USED',
        category: {
          id: listing.categoryId,
          name: 'Muebles',
          slug: 'muebles',
        },
        status: 'PENDING',
        coverPhotoUrl: expect.any(String),
        city: 'COCHABAMBA_BO',
        sellerIsVerified: false,
        publishedAt: listing.publishedAt.toISOString(),
      },
      pickupOption: {
        id: option.id,
        locationLabel: 'Plaza Principal',
        weekdays: ['MONDAY', 'WEDNESDAY'],
        startTime: '18:30',
        endTime: '20:00',
      },
      counterpart: {
        id: seller.id,
        fullName: 'Laura Gómez',
        avatarUrl: null,
        phoneE164: '+59171234567',
        isVerified: false,
      },
      receptionChecklist: null,
      rating: null,
      actions: {
        canConfirmHandover: false,
        canConfirmReception: true,
        canRate: false,
      },
    });
    const reservations = await prisma.reservation.findMany();
    expect(reservations).toEqual([
      expect.objectContaining({
        id: res.body.id,
        listingId: listing.id,
        pickupOptionId: option.id,
        buyerId: buyer.id,
      }),
    ]);
    expect(await listingStatus(listing.id)).toBe('PENDING');
  });

  it('returns 401 without a token (RES-1)', async () => {
    const { user: seller } = await signUpSeller();
    const listing = await createListing(prisma, seller.id as string);

    const res = await reserve({
      listingId: listing.id,
      pickupOptionId: listing.pickupOptions[0].id,
    }).expect(401);

    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(await prisma.reservation.count()).toBe(0);
    expect(await listingStatus(listing.id)).toBe('ACTIVE');
  });

  it('returns 403 CANNOT_RESERVE_OWN_LISTING when the seller reserves their own listing (RES-4)', async () => {
    const { token, user: seller } = await signUpSeller();
    const listing = await createListing(prisma, seller.id as string);

    const res = await reserve(
      { listingId: listing.id, pickupOptionId: listing.pickupOptions[0].id },
      token,
    ).expect(403);

    expect(res.body.code).toBe('CANNOT_RESERVE_OWN_LISTING');
    expect(await prisma.reservation.count()).toBe(0);
    expect(await listingStatus(listing.id)).toBe('ACTIVE');
  });

  it('returns 404 LISTING_NOT_FOUND for a listing that does not exist', async () => {
    const { user: seller } = await signUpSeller();
    const { token } = await signUpBuyer();
    const listing = await createListing(prisma, seller.id as string);

    const res = await reserve(
      {
        listingId: '0192f0c0-0000-7000-8000-000000000000',
        pickupOptionId: listing.pickupOptions[0].id,
      },
      token,
    ).expect(404);

    expect(res.body.code).toBe('LISTING_NOT_FOUND');
    expect(await prisma.reservation.count()).toBe(0);
  });

  it.each(['PENDING', 'COMPLETED'] as const)(
    'returns 409 LISTING_NOT_AVAILABLE for a %s listing (RES-5, GEN-10)',
    async (status) => {
      const { user: seller } = await signUpSeller();
      const { token } = await signUpBuyer();
      const listing = await createListing(prisma, seller.id as string, {
        status,
      });

      const res = await reserve(
        { listingId: listing.id, pickupOptionId: listing.pickupOptions[0].id },
        token,
      ).expect(409);

      expect(res.body.code).toBe('LISTING_NOT_AVAILABLE');
      expect(await prisma.reservation.count()).toBe(0);
      expect(await listingStatus(listing.id)).toBe(status);
    },
  );

  it('returns 409 LISTING_NOT_AVAILABLE when the listing was just reserved by someone else (RES-5, GEN-10)', async () => {
    const { user: seller } = await signUpSeller();
    const { token: first } = await signUpBuyer(1);
    const { token: second } = await signUpBuyer(2);
    const listing = await createListing(prisma, seller.id as string);
    const body = {
      listingId: listing.id,
      pickupOptionId: listing.pickupOptions[0].id,
    };
    await reserve(body, first).expect(201);

    const res = await reserve(body, second).expect(409);

    expect(res.body.code).toBe('LISTING_NOT_AVAILABLE');
    expect(await prisma.reservation.count()).toBe(1);
  });

  it('gives the listing to exactly one of several buyers confirming at the same time (RES-5)', async () => {
    const { user: seller } = await signUpSeller();
    const buyers = await Promise.all([1, 2, 3, 4, 5].map(signUpBuyer));
    const listing = await createListing(prisma, seller.id as string);
    const body = {
      listingId: listing.id,
      pickupOptionId: listing.pickupOptions[0].id,
    };

    const responses = await Promise.all(
      buyers.map(({ token }) => reserve(body, token)),
    );

    const statuses = responses.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    for (const res of responses.filter((r) => r.status === 409)) {
      expect(res.body.code).toBe('LISTING_NOT_AVAILABLE');
    }
    expect(await prisma.reservation.count()).toBe(1);
    expect(await listingStatus(listing.id)).toBe('PENDING');
  });

  it('returns 422 INVALID_PICKUP_OPTION for a pickup option of another listing and leaves the listing Active (RES-2)', async () => {
    const { user: seller } = await signUpSeller();
    const { token } = await signUpBuyer();
    const listing = await createListing(prisma, seller.id as string);
    const other = await createListing(prisma, seller.id as string, {
      title: 'Lámpara de pie',
    });

    const res = await reserve(
      { listingId: listing.id, pickupOptionId: other.pickupOptions[0].id },
      token,
    ).expect(422);

    expect(res.body.code).toBe('INVALID_PICKUP_OPTION');
    expect(await prisma.reservation.count()).toBe(0);
    expect(await listingStatus(listing.id)).toBe('ACTIVE');
  });

  it('returns 422 INVALID_PICKUP_OPTION for a pickup option that does not exist (RES-2)', async () => {
    const { user: seller } = await signUpSeller();
    const { token } = await signUpBuyer();
    const listing = await createListing(prisma, seller.id as string);

    const res = await reserve(
      {
        listingId: listing.id,
        pickupOptionId: '0192f0c0-0000-7000-8000-000000000000',
      },
      token,
    ).expect(422);

    expect(res.body.code).toBe('INVALID_PICKUP_OPTION');
    expect(await prisma.reservation.count()).toBe(0);
    expect(await listingStatus(listing.id)).toBe('ACTIVE');
  });

  it('returns 400 VALIDATION_ERROR when the ids are missing or not UUIDs', async () => {
    const { token } = await signUpBuyer();

    const res = await reserve({ listingId: 'abc' }, token).expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'listingId' }),
        expect.objectContaining({ field: 'pickupOptionId' }),
      ]),
    );
  });
});
