import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { signUp } from './factories/auth.factory.js';
import { createListing, reserveListing } from './factories/listing.factory.js';

async function createReservation(
  prisma: PrismaService,
  sellerId: string,
  buyerId: string,
  {
    title,
    ...overrides
  }: Parameters<typeof reserveListing>[3] & { title?: string } = {},
) {
  const listing = await createListing(prisma, sellerId, {
    title,
    status: overrides.sellerHandedOverAt ? 'COMPLETED' : 'PENDING',
  });
  const reservation = await reserveListing(prisma, listing, buyerId, overrides);
  return { reservation, listing };
}

describe('GET /me/purchases (PUR-1..3)', () => {
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

  async function setup() {
    const seller = await signUp(server(), { email: 'seller@example.com' });
    const buyer = await signUp(server(), { email: 'buyer@example.com' });
    return {
      sellerId: seller.user.id as string,
      buyerId: buyer.user.id as string,
      buyerToken: buyer.token,
    };
  }

  const list = (token: string, status: string) =>
    request(server())
      .get(`/api/v1/me/purchases?status=${status}`)
      .set('Authorization', `Bearer ${token}`);

  it('lists a purchase without reception under IN_PROGRESS (PUR-1)', async () => {
    const { sellerId, buyerId, buyerToken } = await setup();
    const { reservation, listing } = await createReservation(
      prisma,
      sellerId,
      buyerId,
    );

    const res = await list(buyerToken, 'IN_PROGRESS').expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: reservation.id,
      sellerHandedOverAt: null,
      buyerReceivedAt: null,
      listing: { id: listing.id, status: 'PENDING', city: 'COCHABAMBA_BO' },
      pickupOption: {
        id: listing.pickupOptions[0].id,
        locationLabel: 'Café Toscano, Av. Álvaro Obregón',
        weekdays: ['SATURDAY'],
        startTime: '10:00',
        endTime: '13:00',
      },
    });
    expect(res.body[0].listing.coverPhotoUrl).toEqual(expect.any(String));
    await list(buyerToken, 'COMPLETED').expect(200, []);
  });

  it('lists a purchase with reception under COMPLETED (PUR-1, PUR-2)', async () => {
    const { sellerId, buyerId, buyerToken } = await setup();
    const { reservation } = await createReservation(prisma, sellerId, buyerId, {
      sellerHandedOverAt: new Date(),
      buyerReceivedAt: new Date(),
    });

    const res = await list(buyerToken, 'COMPLETED').expect(200);

    expect(res.body.map((p: { id: string }) => p.id)).toEqual([reservation.id]);
    await list(buyerToken, 'IN_PROGRESS').expect(200, []);
  });

  it('keeps a purchase in IN_PROGRESS when only the seller handed over (PUR-2)', async () => {
    const { sellerId, buyerId, buyerToken } = await setup();
    const { reservation } = await createReservation(prisma, sellerId, buyerId, {
      sellerHandedOverAt: new Date('2026-10-07T15:00:00.000Z'),
    });

    const res = await list(buyerToken, 'IN_PROGRESS').expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: reservation.id,
      sellerHandedOverAt: '2026-10-07T15:00:00.000Z',
      buyerReceivedAt: null,
    });
    await list(buyerToken, 'COMPLETED').expect(200, []);
  });

  it('orders purchases by reservedAt, newest first (PUR-1)', async () => {
    const { sellerId, buyerId, buyerToken } = await setup();
    const old = await createReservation(prisma, sellerId, buyerId, {
      title: 'Vieja',
      reservedAt: new Date('2026-10-01T10:00:00.000Z'),
    });
    const recent = await createReservation(prisma, sellerId, buyerId, {
      title: 'Reciente',
      reservedAt: new Date('2026-10-05T10:00:00.000Z'),
    });

    const res = await list(buyerToken, 'IN_PROGRESS').expect(200);

    expect(res.body.map((p: { id: string }) => p.id)).toEqual([
      recent.reservation.id,
      old.reservation.id,
    ]);
  });

  it("never lists another user's purchases (PUR-1)", async () => {
    const { sellerId, buyerId } = await setup();
    const other = await signUp(server(), { email: 'other@example.com' });
    await createReservation(prisma, sellerId, buyerId);

    await list(other.token, 'IN_PROGRESS').expect(200, []);
  });

  it.each([[''], ['?status=DONE']])(
    'returns 400 VALIDATION_ERROR for a missing or unknown status (PUR-1) %s',
    async (query) => {
      const { buyerToken } = await setup();

      const res = await request(server())
        .get(`/api/v1/me/purchases${query}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    },
  );

  it('returns 401 UNAUTHORIZED without a token', async () => {
    const res = await request(server())
      .get('/api/v1/me/purchases?status=IN_PROGRESS')
      .expect(401);

    expect(res.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
  });
});
