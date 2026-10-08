import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { signUp } from './factories/auth.factory.js';
import { createListing, reserveListing } from './factories/listing.factory.js';

describe('GET /me/listings (SAL-1, SAL-3, SAL-5)', () => {
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

  const signUpBuyer = () =>
    signUp(server(), {
      email: 'andres@example.com',
      fullName: 'Andrés Pérez',
      phoneE164: '+51987654321',
      city: 'AREQUIPA_PE',
    });

  const getMyListings = (status: string | undefined, token?: string) => {
    const req = request(server())
      .get('/api/v1/me/listings')
      .query(status === undefined ? {} : { status });
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  it('returns my Active listings as ListingCards with a null reservation (SAL-1)', async () => {
    const { token, user: seller } = await signUpSeller();
    await prisma.user.update({
      where: { id: seller.id as string },
      data: { isVerified: true },
    });
    const listing = await createListing(prisma, seller.id as string, {
      photoCount: 2,
    });

    const res = await getMyListings('ACTIVE', token).expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].reservation).toBeNull();
    expect(res.body[0].listing).toEqual({
      id: listing.id,
      title: 'Silla de comedor en roble',
      priceCents: 18000000,
      condition: 'GENTLY_USED',
      category: { id: listing.category.id, name: 'Muebles', slug: 'muebles' },
      status: 'ACTIVE',
      coverPhotoUrl: expect.stringContaining('X-Amz-Signature='),
      city: 'COCHABAMBA_BO',
      sellerIsVerified: true,
      publishedAt: listing.publishedAt.toISOString(),
    });
    expect(res.body[0].listing.coverPhotoUrl).toContain('photo-0.jpg');
    expect(JSON.stringify(res.body)).not.toContain('storageKey');
  });

  it('returns a Pending listing with its buyer, pickup pair and reservation date (SAL-3)', async () => {
    const { token, user: seller } = await signUpSeller();
    const { user: buyer } = await signUpBuyer();
    const listing = await createListing(prisma, seller.id as string, {
      status: 'PENDING',
    });
    const reservation = await reserveListing(
      prisma,
      listing,
      buyer.id as string,
    );

    const res = await getMyListings('PENDING', token).expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].listing).toMatchObject({
      id: listing.id,
      status: 'PENDING',
    });
    expect(res.body[0].reservation).toEqual({
      id: reservation.id,
      reservedAt: reservation.reservedAt.toISOString(),
      sellerHandedOverAt: null,
      buyer: { id: buyer.id, fullName: 'Andrés Pérez' },
      pickupOption: {
        id: listing.pickupOptions[0].id,
        locationLabel: 'Café Toscano, Av. Álvaro Obregón',
        weekdays: ['SATURDAY'],
        startTime: '10:00',
        endTime: '13:00',
      },
    });
  });

  it('returns a Completed listing with its sale record, including the handover date (SAL-5)', async () => {
    const { token, user: seller } = await signUpSeller();
    const { user: buyer } = await signUpBuyer();
    const listing = await createListing(prisma, seller.id as string, {
      status: 'COMPLETED',
    });
    const reservedAt = new Date('2026-10-01T15:00:00.000Z');
    const sellerHandedOverAt = new Date('2026-10-03T18:30:00.000Z');
    const reservation = await reserveListing(
      prisma,
      listing,
      buyer.id as string,
      { reservedAt, sellerHandedOverAt },
    );

    const res = await getMyListings('COMPLETED', token).expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].listing).toMatchObject({
      id: listing.id,
      status: 'COMPLETED',
    });
    expect(res.body[0].reservation).toMatchObject({
      id: reservation.id,
      reservedAt: '2026-10-01T15:00:00.000Z',
      sellerHandedOverAt: '2026-10-03T18:30:00.000Z',
      buyer: { id: buyer.id, fullName: 'Andrés Pérez' },
      pickupOption: { id: listing.pickupOptions[0].id },
    });
  });

  it('never returns the buyer phone in the list (GEN-7)', async () => {
    const { token, user: seller } = await signUpSeller();
    const { user: buyer } = await signUpBuyer();
    const listing = await createListing(prisma, seller.id as string, {
      status: 'PENDING',
    });
    await reserveListing(prisma, listing, buyer.id as string);

    const res = await getMyListings('PENDING', token).expect(200);

    expect(JSON.stringify(res.body)).not.toContain('+51987654321');
  });

  it('only returns listings in the requested status (SAL-1)', async () => {
    const { token, user: seller } = await signUpSeller();
    const { user: buyer } = await signUpBuyer();
    const active = await createListing(prisma, seller.id as string, {
      title: 'Activo',
    });
    const pending = await createListing(prisma, seller.id as string, {
      status: 'PENDING',
      title: 'En proceso',
    });
    await reserveListing(prisma, pending, buyer.id as string);

    const [activeRes, pendingRes, completedRes] = await Promise.all([
      getMyListings('ACTIVE', token).expect(200),
      getMyListings('PENDING', token).expect(200),
      getMyListings('COMPLETED', token).expect(200),
    ]);

    expect(activeRes.body.map((i: Item) => i.listing.id)).toEqual([active.id]);
    expect(pendingRes.body.map((i: Item) => i.listing.id)).toEqual([
      pending.id,
    ]);
    expect(completedRes.body).toEqual([]);
  });

  it('only returns my own listings, never another seller’s (SAL-1)', async () => {
    const { token, user: seller } = await signUpSeller();
    const { user: other } = await signUpBuyer();
    const mine = await createListing(prisma, seller.id as string);
    await createListing(prisma, other.id as string, { title: 'Ajeno' });

    const res = await getMyListings('ACTIVE', token).expect(200);

    expect(res.body.map((i: Item) => i.listing.id)).toEqual([mine.id]);
  });

  it('orders listings by publishedAt, newest first (SAL-1)', async () => {
    const { token, user: seller } = await signUpSeller();
    const sellerId = seller.id as string;
    const older = await createListing(prisma, sellerId, {
      title: 'Viejo',
      publishedAt: new Date('2026-10-01T10:00:00.000Z'),
    });
    const newest = await createListing(prisma, sellerId, {
      title: 'Nuevo',
      publishedAt: new Date('2026-10-05T10:00:00.000Z'),
    });
    const middle = await createListing(prisma, sellerId, {
      title: 'Medio',
      publishedAt: new Date('2026-10-03T10:00:00.000Z'),
    });

    const res = await getMyListings('ACTIVE', token).expect(200);

    expect(res.body.map((i: Item) => i.listing.id)).toEqual([
      newest.id,
      middle.id,
      older.id,
    ]);
  });

  it('returns an empty array when I have no listings in that status (SAL-1)', async () => {
    const { token } = await signUpSeller();

    const res = await getMyListings('ACTIVE', token).expect(200);

    expect(res.body).toEqual([]);
  });

  it('returns 400 VALIDATION_ERROR when status is missing', async () => {
    const { token } = await signUpSeller();

    const res = await getMyListings(undefined, token).expect(400);

    expect(res.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ field: 'status' })],
    });
  });

  it('returns 400 VALIDATION_ERROR when status is not a listing status', async () => {
    const { token } = await signUpSeller();

    const res = await getMyListings('SOLD', token).expect(400);

    expect(res.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ field: 'status' })],
    });
  });

  it('returns 401 UNAUTHORIZED without a token (GEN-5)', async () => {
    const res = await getMyListings('ACTIVE').expect(401);

    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});

interface Item {
  listing: { id: string };
}
