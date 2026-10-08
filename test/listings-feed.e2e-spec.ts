import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { signUp } from './factories/auth.factory.js';
import { createListing } from './factories/listing.factory.js';

describe('GET /listings (BRW-1, BRW-4, GEN-5, RES-6)', () => {
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

  const signUpSeller = async () => (await signUp(server())).user.id as string;

  const getFeed = () => request(server()).get('/api/v1/listings');

  it('works without a token (GEN-5)', async () => {
    const res = await getFeed().expect(200);

    expect(res.body).toEqual({ data: [], nextCursor: null });
  });

  it('returns each listing as a ListingCard with the cover photo, seller city and verified flag (BRW-4)', async () => {
    const sellerId = await signUpSeller();
    await prisma.user.update({
      where: { id: sellerId },
      data: { isVerified: true },
    });
    const listing = await createListing(prisma, sellerId, { photoCount: 3 });

    const res = await getFeed().expect(200);

    expect(res.body.data).toEqual([
      {
        id: listing.id,
        title: 'Silla de comedor en roble',
        priceCents: 18000000,
        condition: 'GENTLY_USED',
        category: {
          id: listing.category.id,
          name: 'Muebles',
          slug: 'muebles',
        },
        status: 'ACTIVE',
        coverPhotoUrl: expect.stringContaining(
          `uploads/${sellerId}/photo-0.jpg?`,
        ),
        city: 'COCHABAMBA_BO',
        sellerIsVerified: true,
        publishedAt: listing.publishedAt.toISOString(),
      },
    ]);
    expect(res.body.data[0].coverPhotoUrl).toContain('X-Amz-Signature=');
  });

  it('shows the badge flag as false for an unverified seller (BRW-4)', async () => {
    const sellerId = await signUpSeller();
    await createListing(prisma, sellerId);

    const res = await getFeed().expect(200);

    expect(res.body.data[0].sellerIsVerified).toBe(false);
  });

  it('never shows Pending or Completed listings (BRW-1, RES-6)', async () => {
    const sellerId = await signUpSeller();
    const active = await createListing(prisma, sellerId, { title: 'Activo' });
    await createListing(prisma, sellerId, {
      status: 'PENDING',
      title: 'Reservado',
    });
    await createListing(prisma, sellerId, {
      status: 'COMPLETED',
      title: 'Vendido',
    });

    const res = await getFeed().expect(200);

    expect(res.body.data.map((l: { id: string }) => l.id)).toEqual([active.id]);
  });

  it('sorts newest first (BRW-1)', async () => {
    const sellerId = await signUpSeller();
    const older = await createListing(prisma, sellerId, {
      title: 'Viejo',
      publishedAt: new Date('2026-10-01T10:00:00.000Z'),
    });
    const newer = await createListing(prisma, sellerId, {
      title: 'Nuevo',
      publishedAt: new Date('2026-10-05T10:00:00.000Z'),
    });
    const middle = await createListing(prisma, sellerId, {
      title: 'Medio',
      publishedAt: new Date('2026-10-03T10:00:00.000Z'),
    });

    const res = await getFeed().expect(200);

    expect(res.body.data.map((l: { id: string }) => l.id)).toEqual([
      newer.id,
      middle.id,
      older.id,
    ]);
  });

  it('breaks ties on the same publish time by id, highest first (BRW-1)', async () => {
    const sellerId = await signUpSeller();
    const publishedAt = new Date('2026-10-05T10:00:00.000Z');
    const first = await createListing(prisma, sellerId, { publishedAt });
    const second = await createListing(prisma, sellerId, { publishedAt });
    const [high, low] = [first.id, second.id].sort().reverse();

    const res = await getFeed().expect(200);

    expect(res.body.data.map((l: { id: string }) => l.id)).toEqual([high, low]);
  });
});
