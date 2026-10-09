import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { signUp } from './factories/auth.factory.js';
import {
  createListing,
  rateSeller as seedRating,
  reserveListing,
} from './factories/listing.factory.js';

describe('POST /reservations/:reservationId/rating (PUR-8..10)', () => {
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

  const rate = (id: string, token: string | undefined, body: object) => {
    const req = request(server())
      .post(`/api/v1/reservations/${id}/rating`)
      .send(body);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  /** Laura's listing reserved by Andrés, received by default. */
  async function arrangePurchase({
    received = true,
  }: { received?: boolean } = {}) {
    const seller = await signUp(server(), {
      email: 'laura@example.com',
      phoneE164: '+59171234567',
    });
    const buyer = await signUp(server(), {
      email: 'andres@example.com',
      fullName: 'Andrés Pérez',
      phoneE164: '+51987654321',
      city: 'AREQUIPA_PE',
    });
    const listing = await createListing(prisma, seller.user.id as string, {
      status: 'PENDING',
    });
    const reservation = await reserveListing(
      prisma,
      listing,
      buyer.user.id as string,
      { buyerReceivedAt: received ? new Date() : null },
    );
    return { seller, buyer, listing, reservation };
  }

  const savedRatings = (reservationId: string) =>
    prisma.sellerRating.findMany({ where: { reservationId } });

  it('records the rating for the seller of the listing and returns 201 (PUR-8)', async () => {
    const { seller, buyer, reservation } = await arrangePurchase();

    const res = await rate(reservation.id, buyer.token, { stars: 4 }).expect(
      201,
    );

    expect(res.body).toEqual({ stars: 4, createdAt: expect.any(String) });
    const [saved] = await savedRatings(reservation.id);
    expect(saved).toMatchObject({ sellerId: seller.user.id, stars: 4 });
    expect(saved.createdAt.toISOString()).toBe(res.body.createdAt);
  });

  it('shows the rating on the recap and stops offering it (PUR-8)', async () => {
    const { buyer, reservation } = await arrangePurchase();
    await rate(reservation.id, buyer.token, { stars: 5 }).expect(201);

    const res = await request(server())
      .get(`/api/v1/reservations/${reservation.id}`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);

    expect(res.body.rating).toEqual({
      stars: 5,
      createdAt: expect.any(String),
    });
    expect(res.body.actions.canRate).toBe(false);
  });

  it('counts the rating toward the seller average on the seller card (PUR-10)', async () => {
    const { seller, buyer, listing, reservation } = await arrangePurchase();
    const other = await signUp(server(), {
      email: 'otra@example.com',
      phoneE164: '+59171111111',
    });
    await seedRating(
      prisma,
      seller.user.id as string,
      other.user.id as string,
      5,
    );
    await seedRating(
      prisma,
      seller.user.id as string,
      other.user.id as string,
      5,
    );

    await rate(reservation.id, buyer.token, { stars: 3 }).expect(201);

    const res = await request(server())
      .get(`/api/v1/listings/${listing.id}`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);
    expect(res.body.seller.rating).toEqual({ average: 4.3, count: 3 });
  });

  it.each([1, 5])('accepts %i stars (PUR-8)', async (stars) => {
    const { buyer, reservation } = await arrangePurchase();

    await rate(reservation.id, buyer.token, { stars }).expect(201);

    const [saved] = await savedRatings(reservation.id);
    expect(saved.stars).toBe(stars);
  });

  it('returns 409 RECEPTION_NOT_CONFIRMED before the buyer confirmed reception (PUR-8)', async () => {
    const { buyer, reservation } = await arrangePurchase({ received: false });

    const res = await rate(reservation.id, buyer.token, { stars: 5 }).expect(
      409,
    );

    expect(res.body.code).toBe('RECEPTION_NOT_CONFIRMED');
    expect(await savedRatings(reservation.id)).toHaveLength(0);
  });

  it('returns 409 ALREADY_RATED on a second rating and keeps the first one (PUR-8)', async () => {
    const { buyer, reservation } = await arrangePurchase();
    await rate(reservation.id, buyer.token, { stars: 2 }).expect(201);

    const res = await rate(reservation.id, buyer.token, { stars: 5 }).expect(
      409,
    );

    expect(res.body.code).toBe('ALREADY_RATED');
    const saved = await savedRatings(reservation.id);
    expect(saved).toHaveLength(1);
    expect(saved[0].stars).toBe(2);
  });

  it('rates only once when the buyer rates twice at the same time (PUR-8)', async () => {
    const { buyer, reservation } = await arrangePurchase();

    const results = await Promise.all([
      rate(reservation.id, buyer.token, { stars: 4 }),
      rate(reservation.id, buyer.token, { stars: 5 }),
    ]);

    const statuses = results.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)?.body.code).toBe(
      'ALREADY_RATED',
    );
    expect(await savedRatings(reservation.id)).toHaveLength(1);
  });

  it.each([
    ['0', { stars: 0 }],
    ['6', { stars: 6 }],
    ['a decimal', { stars: 4.5 }],
    ['a string', { stars: '5' }],
    ['missing', {}],
  ])(
    'returns 400 VALIDATION_ERROR when stars is %s (PUR-8)',
    async (_case, body) => {
      const { buyer, reservation } = await arrangePurchase();

      const res = await rate(reservation.id, buyer.token, body).expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'stars' })]),
      );
      expect(await savedRatings(reservation.id)).toHaveLength(0);
    },
  );

  it('returns 400 VALIDATION_ERROR for a comment, since ratings have none (PUR-8)', async () => {
    const { buyer, reservation } = await arrangePurchase();

    const res = await rate(reservation.id, buyer.token, {
      stars: 5,
      comment: 'Excelente',
    }).expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(await savedRatings(reservation.id)).toHaveLength(0);
  });

  it('returns 400 VALIDATION_ERROR for a sellerId in the body (PUR-8)', async () => {
    const { buyer, reservation } = await arrangePurchase();

    const res = await rate(reservation.id, buyer.token, {
      stars: 5,
      sellerId: buyer.user.id,
    }).expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(await savedRatings(reservation.id)).toHaveLength(0);
  });

  it('returns 403 NOT_RESERVATION_BUYER to the seller (PUR-8)', async () => {
    const { seller, reservation } = await arrangePurchase();

    const res = await rate(reservation.id, seller.token, { stars: 5 }).expect(
      403,
    );

    expect(res.body.code).toBe('NOT_RESERVATION_BUYER');
    expect(await savedRatings(reservation.id)).toHaveLength(0);
  });

  it('returns 404 RESERVATION_NOT_FOUND to a user who is neither buyer nor seller (GEN-7)', async () => {
    const { reservation } = await arrangePurchase();
    const stranger = await signUp(server(), {
      email: 'otra@example.com',
      phoneE164: '+59171111111',
    });

    const res = await rate(reservation.id, stranger.token, {
      stars: 5,
    }).expect(404);

    expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
    expect(await savedRatings(reservation.id)).toHaveLength(0);
  });

  it('returns 404 RESERVATION_NOT_FOUND for an unknown id', async () => {
    const { buyer } = await arrangePurchase();

    const res = await rate(
      '0192d3a4-0000-7000-8000-000000000099',
      buyer.token,
      {
        stars: 5,
      },
    ).expect(404);

    expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
  });

  it('returns 404 RESERVATION_NOT_FOUND for an id that is not a UUID', async () => {
    const { buyer } = await arrangePurchase();

    const res = await rate('not-a-uuid', buyer.token, { stars: 5 }).expect(404);

    expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
  });

  it('returns 401 UNAUTHORIZED without a token (GEN-5)', async () => {
    const { reservation } = await arrangePurchase();

    const res = await rate(reservation.id, undefined, { stars: 5 }).expect(401);

    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});
