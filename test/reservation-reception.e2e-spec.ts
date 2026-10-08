import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { signUp } from './factories/auth.factory.js';
import { createListing, reserveListing } from './factories/listing.factory.js';

describe('POST /reservations/:reservationId/reception (PUR-4..7)', () => {
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

  const allYes = {
    matchesListing: true,
    worksNoUndisclosedDamage: true,
    allPartsIncluded: true,
    hasItemNow: true,
    issueReport: null,
  };

  const confirmReception = (
    id: string,
    token: string | undefined,
    body: object = allYes,
  ) => {
    const req = request(server())
      .post(`/api/v1/reservations/${id}/reception`)
      .send(body);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  /** A Pending listing of Laura reserved by Andrés. */
  async function arrangePurchase({
    handedOver = false,
  }: { handedOver?: boolean } = {}) {
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
      status: handedOver ? 'COMPLETED' : 'PENDING',
    });
    const reservation = await reserveListing(
      prisma,
      listing,
      buyer.user.id as string,
      { sellerHandedOverAt: handedOver ? new Date() : null },
    );
    return { seller, buyer, listing, reservation };
  }

  const savedReservation = (id: string) =>
    prisma.reservation.findUniqueOrThrow({
      where: { id },
      include: { receptionChecklist: true, listing: true },
    });

  it('records the reception and the checklist, and lets the buyer rate (PUR-5)', async () => {
    const { buyer, reservation } = await arrangePurchase();
    const before = Date.now();

    const res = await confirmReception(reservation.id, buyer.token, {
      ...allYes,
      issueReport: 'La pantalla tiene un rayón.',
    }).expect(200);

    expect(res.body).toMatchObject({
      id: reservation.id,
      viewerRole: 'BUYER',
      buyerReceivedAt: expect.any(String),
      receptionChecklist: {
        matchesListing: true,
        worksNoUndisclosedDamage: true,
        allPartsIncluded: true,
        issueReport: 'La pantalla tiene un rayón.',
        createdAt: expect.any(String),
      },
      actions: { canConfirmReception: false, canRate: true },
    });
    const saved = await savedReservation(reservation.id);
    expect(saved.buyerReceivedAt?.getTime()).toBeGreaterThanOrEqual(
      before - 1000,
    );
    expect(saved.buyerReceivedAt?.toISOString()).toBe(res.body.buyerReceivedAt);
    expect(saved.receptionChecklist).toMatchObject({
      matchesListing: true,
      worksNoUndisclosedDamage: true,
      allPartsIncluded: true,
      issueReport: 'La pantalla tiene un rayón.',
    });
  });

  it('saves unchecked items as false without blocking the confirmation (PUR-6)', async () => {
    const { buyer, reservation } = await arrangePurchase();

    const res = await confirmReception(reservation.id, buyer.token, {
      matchesListing: false,
      worksNoUndisclosedDamage: false,
      allPartsIncluded: false,
      hasItemNow: true,
    }).expect(200);

    expect(res.body.receptionChecklist).toMatchObject({
      matchesListing: false,
      worksNoUndisclosedDamage: false,
      allPartsIncluded: false,
      issueReport: null,
    });
    const saved = await savedReservation(reservation.id);
    expect(saved.buyerReceivedAt).not.toBeNull();
    expect(saved.receptionChecklist).toMatchObject({
      matchesListing: false,
      worksNoUndisclosedDamage: false,
      allPartsIncluded: false,
      issueReport: null,
    });
  });

  it('works after the seller confirmed the handover and leaves the listing as it is (PUR-4)', async () => {
    const { buyer, reservation } = await arrangePurchase({
      handedOver: true,
    });

    const res = await confirmReception(reservation.id, buyer.token).expect(200);

    expect(res.body.buyerReceivedAt).toEqual(expect.any(String));
    const saved = await savedReservation(reservation.id);
    expect(saved.buyerReceivedAt).not.toBeNull();
    expect(saved.listing.status).toBe('COMPLETED');
  });

  it('leaves the listing Pending when the seller has not confirmed the handover (PUR-4)', async () => {
    const { buyer, reservation } = await arrangePurchase();

    await confirmReception(reservation.id, buyer.token).expect(200);

    const saved = await savedReservation(reservation.id);
    expect(saved.listing.status).toBe('PENDING');
    expect(saved.sellerHandedOverAt).toBeNull();
  });

  it('returns 409 RECEPTION_ALREADY_CONFIRMED on a second confirmation and keeps the first answers (PUR-7)', async () => {
    const { buyer, reservation } = await arrangePurchase();
    const first = await confirmReception(reservation.id, buyer.token).expect(
      200,
    );

    const res = await confirmReception(reservation.id, buyer.token, {
      matchesListing: false,
      worksNoUndisclosedDamage: false,
      allPartsIncluded: false,
      hasItemNow: true,
      issueReport: 'Cambié de opinión.',
    }).expect(409);

    expect(res.body.code).toBe('RECEPTION_ALREADY_CONFIRMED');
    const saved = await savedReservation(reservation.id);
    expect(saved.buyerReceivedAt?.toISOString()).toBe(
      first.body.buyerReceivedAt,
    );
    expect(saved.receptionChecklist).toMatchObject({
      matchesListing: true,
      worksNoUndisclosedDamage: true,
      allPartsIncluded: true,
      issueReport: null,
    });
  });

  it('confirms only once when the buyer confirms twice at the same time (PUR-7)', async () => {
    const { buyer, reservation } = await arrangePurchase();

    const results = await Promise.all([
      confirmReception(reservation.id, buyer.token),
      confirmReception(reservation.id, buyer.token),
    ]);

    const statuses = results.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)?.body.code).toBe(
      'RECEPTION_ALREADY_CONFIRMED',
    );
    expect(
      await prisma.receptionChecklist.count({
        where: { reservationId: reservation.id },
      }),
    ).toBe(1);
  });

  it('returns 400 VALIDATION_ERROR when the buyer does not have the item now (PUR-5)', async () => {
    const { buyer, reservation } = await arrangePurchase();

    const res = await confirmReception(reservation.id, buyer.token, {
      ...allYes,
      hasItemNow: false,
    }).expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'hasItemNow' }),
      ]),
    );
    const saved = await savedReservation(reservation.id);
    expect(saved.buyerReceivedAt).toBeNull();
    expect(saved.receptionChecklist).toBeNull();
  });

  it('returns 400 VALIDATION_ERROR when hasItemNow is missing (PUR-5)', async () => {
    const { buyer, reservation } = await arrangePurchase();
    const { hasItemNow: _omitted, ...body } = allYes;

    const res = await confirmReception(
      reservation.id,
      buyer.token,
      body,
    ).expect(400);

    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'hasItemNow' }),
      ]),
    );
  });

  it('returns 400 VALIDATION_ERROR when a yes/no item is missing (PUR-6)', async () => {
    const { buyer, reservation } = await arrangePurchase();
    const { matchesListing: _omitted, ...body } = allYes;

    const res = await confirmReception(
      reservation.id,
      buyer.token,
      body,
    ).expect(400);

    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'matchesListing' }),
      ]),
    );
    expect((await savedReservation(reservation.id)).buyerReceivedAt).toBeNull();
  });

  it('accepts a report of exactly 1000 characters (PUR-5)', async () => {
    const { buyer, reservation } = await arrangePurchase();
    const report = 'a'.repeat(1000);

    await confirmReception(reservation.id, buyer.token, {
      ...allYes,
      issueReport: report,
    }).expect(200);

    const saved = await savedReservation(reservation.id);
    expect(saved.receptionChecklist?.issueReport).toBe(report);
  });

  it('returns 400 VALIDATION_ERROR for a report over 1000 characters (PUR-5)', async () => {
    const { buyer, reservation } = await arrangePurchase();

    const res = await confirmReception(reservation.id, buyer.token, {
      ...allYes,
      issueReport: 'a'.repeat(1001),
    }).expect(400);

    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'issueReport' }),
      ]),
    );
    expect((await savedReservation(reservation.id)).buyerReceivedAt).toBeNull();
  });

  it('trims the report and counts its length after trimming (PUR-5)', async () => {
    const { buyer, reservation } = await arrangePurchase();

    await confirmReception(reservation.id, buyer.token, {
      ...allYes,
      issueReport: `  ${'a'.repeat(1000)}  `,
    }).expect(200);

    const saved = await savedReservation(reservation.id);
    expect(saved.receptionChecklist?.issueReport).toBe('a'.repeat(1000));
  });

  it('saves a blank report as null (PUR-5)', async () => {
    const { buyer, reservation } = await arrangePurchase();

    const res = await confirmReception(reservation.id, buyer.token, {
      ...allYes,
      issueReport: '   ',
    }).expect(200);

    expect(res.body.receptionChecklist.issueReport).toBeNull();
    const saved = await savedReservation(reservation.id);
    expect(saved.receptionChecklist?.issueReport).toBeNull();
  });

  it('returns 403 NOT_RESERVATION_BUYER to the seller (PUR-5)', async () => {
    const { seller, reservation } = await arrangePurchase();

    const res = await confirmReception(reservation.id, seller.token).expect(
      403,
    );

    expect(res.body.code).toBe('NOT_RESERVATION_BUYER');
    expect((await savedReservation(reservation.id)).buyerReceivedAt).toBeNull();
  });

  it('returns 404 RESERVATION_NOT_FOUND to a user who is neither buyer nor seller (GEN-7)', async () => {
    const { reservation } = await arrangePurchase();
    const stranger = await signUp(server(), {
      email: 'otra@example.com',
      phoneE164: '+59171111111',
    });

    const res = await confirmReception(reservation.id, stranger.token).expect(
      404,
    );

    expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
    const saved = await savedReservation(reservation.id);
    expect(saved.buyerReceivedAt).toBeNull();
    expect(saved.receptionChecklist).toBeNull();
  });

  it('returns 404 RESERVATION_NOT_FOUND for an unknown id', async () => {
    const { buyer } = await arrangePurchase();

    const res = await confirmReception(
      '0192d3a4-0000-7000-8000-000000000099',
      buyer.token,
    ).expect(404);

    expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
  });

  it('returns 404 RESERVATION_NOT_FOUND for an id that is not a UUID', async () => {
    const { buyer } = await arrangePurchase();

    const res = await confirmReception('not-a-uuid', buyer.token).expect(404);

    expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
  });

  it('returns 401 UNAUTHORIZED without a token (GEN-5)', async () => {
    const { reservation } = await arrangePurchase();

    const res = await confirmReception(reservation.id, undefined).expect(401);

    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});
