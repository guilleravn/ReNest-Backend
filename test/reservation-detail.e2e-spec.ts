import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { signUp } from './factories/auth.factory.js';
import { createListing, reserveListing } from './factories/listing.factory.js';

describe('GET /reservations/:reservationId (SAL-3, SAL-5, GEN-7)', () => {
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

  const getReservation = (id: string, token?: string) => {
    const req = request(server()).get(`/api/v1/reservations/${id}`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  /** A Pending listing of Laura reserved by Andrés. */
  async function arrangePendingSale() {
    const seller = await signUp(server(), {
      email: 'laura@example.com',
      fullName: 'Laura Gómez',
      phoneE164: '+59171234567',
      city: 'COCHABAMBA_BO',
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

  it('shows the seller the buyer with WhatsApp, the pickup pair and the handover action (SAL-3, GEN-7)', async () => {
    const { seller, buyer, listing, reservation } = await arrangePendingSale();

    const res = await getReservation(reservation.id, seller.token).expect(200);

    expect(res.body).toMatchObject({
      id: reservation.id,
      viewerRole: 'SELLER',
      reservedAt: reservation.reservedAt.toISOString(),
      sellerHandedOverAt: null,
      buyerReceivedAt: null,
      listing: {
        id: listing.id,
        title: 'Silla de comedor en roble',
        status: 'PENDING',
        coverPhotoUrl: expect.stringContaining('X-Amz-Signature='),
      },
      pickupOption: {
        id: listing.pickupOptions[0].id,
        locationLabel: 'Café Toscano, Av. Álvaro Obregón',
        weekdays: ['SATURDAY'],
        startTime: '10:00',
        endTime: '13:00',
      },
      receptionChecklist: null,
      rating: null,
      actions: {
        canConfirmHandover: true,
        canConfirmReception: false,
        canRate: false,
      },
    });
    expect(res.body.counterpart).toEqual({
      id: buyer.user.id,
      fullName: 'Andrés Pérez',
      avatarUrl: null,
      phoneE164: '+51987654321',
      isVerified: false,
    });
  });

  it('shows the buyer the seller with WhatsApp and the reception action', async () => {
    const { seller, buyer, reservation } = await arrangePendingSale();

    const res = await getReservation(reservation.id, buyer.token).expect(200);

    expect(res.body.viewerRole).toBe('BUYER');
    expect(res.body.counterpart).toEqual({
      id: seller.user.id,
      fullName: 'Laura Gómez',
      avatarUrl: null,
      phoneE164: '+59171234567',
      isVerified: false,
    });
    expect(res.body.actions).toEqual({
      canConfirmHandover: false,
      canConfirmReception: true,
      canRate: false,
    });
  });

  it('keeps the sale record with the handover date once handed over (SAL-5)', async () => {
    const { seller, reservation } = await arrangePendingSale();
    const sellerHandedOverAt = new Date('2026-10-03T18:30:00.000Z');
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        sellerHandedOverAt,
        listing: { update: { status: 'COMPLETED' } },
      },
    });

    const res = await getReservation(reservation.id, seller.token).expect(200);

    expect(res.body).toMatchObject({
      sellerHandedOverAt: '2026-10-03T18:30:00.000Z',
      listing: { status: 'COMPLETED' },
      actions: { canConfirmHandover: false },
    });
  });

  it('returns the reception checklist once the buyer confirmed reception (PUR-7, PUR-8)', async () => {
    const { buyer, reservation } = await arrangePendingSale();
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        buyerReceivedAt: new Date('2026-10-04T10:00:00.000Z'),
        receptionChecklist: {
          create: {
            matchesListing: true,
            worksNoUndisclosedDamage: false,
            allPartsIncluded: true,
            issueReport: 'Tiene un rayón.',
          },
        },
      },
    });

    const res = await getReservation(reservation.id, buyer.token).expect(200);

    expect(res.body.buyerReceivedAt).toBe('2026-10-04T10:00:00.000Z');
    expect(res.body.receptionChecklist).toEqual({
      matchesListing: true,
      worksNoUndisclosedDamage: false,
      allPartsIncluded: true,
      issueReport: 'Tiene un rayón.',
      createdAt: expect.any(String),
    });
    expect(res.body.rating).toBeNull();
    expect(res.body.actions.canRate).toBe(true);
  });

  it('returns the rating and stops offering it once the buyer rated (PUR-8)', async () => {
    const { seller, buyer, reservation } = await arrangePendingSale();
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        buyerReceivedAt: new Date('2026-10-04T10:00:00.000Z'),
        receptionChecklist: {
          create: {
            matchesListing: true,
            worksNoUndisclosedDamage: true,
            allPartsIncluded: true,
          },
        },
        rating: { create: { sellerId: seller.user.id as string, stars: 4 } },
      },
    });

    const res = await getReservation(reservation.id, buyer.token).expect(200);

    expect(res.body.rating).toEqual({
      stars: 4,
      createdAt: expect.any(String),
    });
    expect(res.body.actions.canRate).toBe(false);
  });

  it('returns 404 RESERVATION_NOT_FOUND to a user who is neither buyer nor seller (GEN-7)', async () => {
    const { reservation } = await arrangePendingSale();
    const stranger = await signUp(server(), {
      email: 'otra@example.com',
      phoneE164: '+59171111111',
    });

    const res = await getReservation(reservation.id, stranger.token).expect(
      404,
    );

    expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
    expect(JSON.stringify(res.body)).not.toContain('+51987654321');
  });

  it('returns 404 RESERVATION_NOT_FOUND for an unknown id', async () => {
    const { seller } = await arrangePendingSale();

    const res = await getReservation(
      '0192d3a4-0000-7000-8000-000000000099',
      seller.token,
    ).expect(404);

    expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
  });

  it('returns 404 RESERVATION_NOT_FOUND for an id that is not a UUID', async () => {
    const { seller } = await arrangePendingSale();

    const res = await getReservation('not-a-uuid', seller.token).expect(404);

    expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
  });

  it('returns 401 UNAUTHORIZED without a token (GEN-5)', async () => {
    const { reservation } = await arrangePendingSale();

    const res = await getReservation(reservation.id).expect(401);

    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});
