import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { signUp } from './factories/auth.factory.js';
import { createListing, reserveListing } from './factories/listing.factory.js';

describe('POST /reservations/:reservationId/handover (SAL-4, PUR-2, C6)', () => {
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

  const confirmHandover = (id: string, token?: string) => {
    const req = request(server()).post(`/api/v1/reservations/${id}/handover`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  /** A Pending listing of Laura reserved by Andrés. */
  async function arrangePendingSale() {
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
    );
    return { seller, buyer, listing, reservation };
  }

  it('sets the handover date and moves the listing to Completed (SAL-4, C6)', async () => {
    const { seller, listing, reservation } = await arrangePendingSale();
    const before = Date.now();

    const res = await confirmHandover(reservation.id, seller.token).expect(200);

    expect(res.body).toMatchObject({
      id: reservation.id,
      viewerRole: 'SELLER',
      sellerHandedOverAt: expect.any(String),
      buyerReceivedAt: null,
      listing: { id: listing.id, status: 'COMPLETED' },
      actions: { canConfirmHandover: false },
    });
    const saved = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
      include: { listing: true },
    });
    expect(saved.sellerHandedOverAt?.getTime()).toBeGreaterThanOrEqual(
      before - 1000,
    );
    expect(saved.sellerHandedOverAt?.toISOString()).toBe(
      res.body.sellerHandedOverAt,
    );
    expect(saved.listing.status).toBe('COMPLETED');
  });

  it('leaves the buyer able to confirm reception after the handover (PUR-2, SAL-4)', async () => {
    const { seller, buyer, reservation } = await arrangePendingSale();
    await confirmHandover(reservation.id, seller.token).expect(200);

    const res = await request(server())
      .get(`/api/v1/reservations/${reservation.id}`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);

    expect(res.body.buyerReceivedAt).toBeNull();
    expect(res.body.actions).toEqual({
      canConfirmHandover: false,
      canConfirmReception: true,
      canRate: false,
    });
  });

  it('returns 409 HANDOVER_ALREADY_CONFIRMED on a second confirmation (SAL-4)', async () => {
    const { seller, reservation } = await arrangePendingSale();
    const first = await confirmHandover(reservation.id, seller.token).expect(
      200,
    );

    const res = await confirmHandover(reservation.id, seller.token).expect(409);

    expect(res.body.code).toBe('HANDOVER_ALREADY_CONFIRMED');
    const saved = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(saved.sellerHandedOverAt?.toISOString()).toBe(
      first.body.sellerHandedOverAt,
    );
  });

  it('confirms only once when the seller confirms twice at the same time (SAL-4)', async () => {
    const { seller, reservation } = await arrangePendingSale();

    const results = await Promise.all([
      confirmHandover(reservation.id, seller.token),
      confirmHandover(reservation.id, seller.token),
    ]);

    const statuses = results.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)?.body.code).toBe(
      'HANDOVER_ALREADY_CONFIRMED',
    );
    const saved = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(saved.sellerHandedOverAt?.toISOString()).toBe(
      results.find((r) => r.status === 200)?.body.sellerHandedOverAt,
    );
  });

  it('returns 409 HANDOVER_ALREADY_CONFIRMED when the listing is not Pending (SAL-4)', async () => {
    const { seller, listing, reservation } = await arrangePendingSale();
    await prisma.listing.update({
      where: { id: listing.id },
      data: { status: 'COMPLETED' },
    });

    const res = await confirmHandover(reservation.id, seller.token).expect(409);

    expect(res.body.code).toBe('HANDOVER_ALREADY_CONFIRMED');
    const saved = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(saved.sellerHandedOverAt).toBeNull();
  });

  it('returns 403 NOT_RESERVATION_SELLER to the buyer (SAL-4)', async () => {
    const { buyer, listing, reservation } = await arrangePendingSale();

    const res = await confirmHandover(reservation.id, buyer.token).expect(403);

    expect(res.body.code).toBe('NOT_RESERVATION_SELLER');
    const saved = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(saved.status).toBe('PENDING');
  });

  it('returns 404 RESERVATION_NOT_FOUND to a user who is neither buyer nor seller (GEN-7)', async () => {
    const { reservation } = await arrangePendingSale();
    const stranger = await signUp(server(), {
      email: 'otra@example.com',
      phoneE164: '+59171111111',
    });

    const res = await confirmHandover(reservation.id, stranger.token).expect(
      404,
    );

    expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
    const saved = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(saved.sellerHandedOverAt).toBeNull();
  });

  it('returns 404 RESERVATION_NOT_FOUND for an unknown id', async () => {
    const { seller } = await arrangePendingSale();

    const res = await confirmHandover(
      '0192d3a4-0000-7000-8000-000000000099',
      seller.token,
    ).expect(404);

    expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
  });

  it('returns 404 RESERVATION_NOT_FOUND for an id that is not a UUID', async () => {
    const { seller } = await arrangePendingSale();

    const res = await confirmHandover('not-a-uuid', seller.token).expect(404);

    expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
  });

  it('returns 401 UNAUTHORIZED without a token (GEN-5)', async () => {
    const { reservation } = await arrangePendingSale();

    const res = await confirmHandover(reservation.id).expect(401);

    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});
