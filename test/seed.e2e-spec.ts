import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DEMO_PASSWORD } from '../prisma/seed/data.js';
import { seed } from '../prisma/seed/seed.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { StorageService } from './../src/storage/storage.service.js';

// The demo seed itself is under test here; other suites never rely on it.
describe('Demo seed (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let storage: StorageService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE users, categories CASCADE');
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE users, categories CASCADE');
    await app.close();
  });

  it('creates the fixed category list (BRW-3)', async () => {
    await seed(prisma, storage);

    const categories = await prisma.category.findMany({
      select: { name: true, slug: true },
      orderBy: { name: 'asc' },
    });
    expect(categories).toEqual([
      { name: 'Electrónica', slug: 'electronica' },
      { name: 'Hogar', slug: 'hogar' },
      { name: 'Muebles', slug: 'muebles' },
    ]);
  });

  it('creates one verified seller, one unverified seller and two buyers (GEN-8)', async () => {
    await seed(prisma, storage);

    const users = await prisma.user.findMany({
      select: { email: true, isVerified: true },
      orderBy: { email: 'asc' },
    });
    expect(users).toEqual([
      { email: 'comprador1@renest.app', isVerified: false },
      { email: 'comprador2@renest.app', isVerified: false },
      { email: 'vendedor@renest.app', isVerified: false },
      { email: 'vendedora.verificada@renest.app', isVerified: true },
    ]);
  });

  it('lets every demo user log in with the documented password', async () => {
    await seed(prisma, storage);
    const users = await prisma.user.findMany({ select: { email: true } });

    expect(users).toHaveLength(4);
    for (const { email } of users) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: DEMO_PASSWORD })
        .expect(200);
      expect(res.body.user).toMatchObject({ email });
    }
  });

  it('creates 12 listings across every category, condition and status (BRW-3, LST-4)', async () => {
    await seed(prisma, storage);

    const listings = await prisma.listing.findMany({
      select: { status: true, condition: true, category: true },
    });
    expect(listings).toHaveLength(12);
    expect(new Set(listings.map((l) => l.category.slug))).toEqual(
      new Set(['muebles', 'electronica', 'hogar']),
    );
    expect(new Set(listings.map((l) => l.condition))).toEqual(
      new Set(['LIKE_NEW', 'GENTLY_USED', 'HEAVILY_USED']),
    );
    expect(new Set(listings.map((l) => l.status))).toEqual(
      new Set(['ACTIVE', 'PENDING', 'COMPLETED']),
    );
  });

  it('gives every listing 1 to 3 photos served from storage, first one as cover (LST-1, LST-2)', async () => {
    await seed(prisma, storage);

    const listings = await prisma.listing.findMany({
      select: { photos: { orderBy: { position: 'asc' } } },
    });
    for (const { photos } of listings) {
      expect(photos.length).toBeGreaterThanOrEqual(1);
      expect(photos.length).toBeLessThanOrEqual(3);
      expect(photos.map((p) => p.position)).toEqual(photos.map((_, i) => i));
      for (const photo of photos) {
        const response = await fetch(await storage.getUrl(photo.storageKey));
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/jpeg');
      }
    }
  });

  it('gives every listing 1 to 3 pickup pairs (LST-6)', async () => {
    await seed(prisma, storage);

    const counts = await prisma.listing.findMany({
      select: { _count: { select: { pickupOptions: true } } },
    });
    for (const { _count } of counts) {
      expect(_count.pickupOptions).toBeGreaterThanOrEqual(1);
      expect(_count.pickupOptions).toBeLessThanOrEqual(3);
    }
  });

  it('reserves exactly the Pending and Completed listings, never by their own seller (RES-4, GEN-10)', async () => {
    await seed(prisma, storage);

    const listings = await prisma.listing.findMany({
      select: { status: true, sellerId: true, reservation: true },
    });
    for (const listing of listings) {
      if (listing.status === 'ACTIVE') {
        expect(listing.reservation).toBeNull();
      } else {
        expect(listing.reservation?.buyerId).toEqual(expect.any(String));
        expect(listing.reservation?.buyerId).not.toBe(listing.sellerId);
      }
    }
  });

  it('confirms the handover on Completed listings only (SAL-4)', async () => {
    await seed(prisma, storage);

    const reservations = await prisma.reservation.findMany({
      select: {
        sellerHandedOverAt: true,
        listing: { select: { status: true } },
      },
    });
    for (const { sellerHandedOverAt, listing } of reservations) {
      expect(sellerHandedOverAt !== null).toBe(listing.status === 'COMPLETED');
    }
  });

  it('keeps every timestamp in the past and in lifecycle order (GEN-4)', async () => {
    await seed(prisma, storage);
    const now = new Date();

    const reservations = await prisma.reservation.findMany({
      include: { listing: true },
    });
    for (const r of reservations) {
      expect(r.listing.publishedAt.getTime()).toBeLessThan(now.getTime());
      expect(r.reservedAt.getTime()).toBeGreaterThan(
        r.listing.publishedAt.getTime(),
      );
      for (const confirmedAt of [r.sellerHandedOverAt, r.buyerReceivedAt]) {
        if (confirmedAt) {
          expect(confirmedAt.getTime()).toBeGreaterThan(r.reservedAt.getTime());
          expect(confirmedAt.getTime()).toBeLessThan(now.getTime());
        }
      }
    }
  });

  it('includes confirmed receptions with a checklist and a rating (PUR-5, PUR-8)', async () => {
    await seed(prisma, storage);

    const received = await prisma.reservation.findMany({
      where: { buyerReceivedAt: { not: null } },
      select: { receptionChecklist: true, rating: true },
    });
    expect(received.length).toBeGreaterThan(0);
    for (const { receptionChecklist } of received) {
      expect(receptionChecklist).not.toBeNull();
    }
    expect(received.some(({ rating }) => rating !== null)).toBe(true);
  });

  it("only rates received purchases, on behalf of the listing's seller (PUR-8, PUR-10)", async () => {
    await seed(prisma, storage);

    const ratings = await prisma.sellerRating.findMany({
      include: { reservation: { include: { listing: true } } },
    });
    expect(ratings.length).toBeGreaterThan(0);
    for (const rating of ratings) {
      expect(rating.reservation.buyerReceivedAt).not.toBeNull();
      expect(rating.sellerId).toBe(rating.reservation.listing.sellerId);
    }
  });

  it('leaves the unverified seller with 0 ratings (BRW-6)', async () => {
    await seed(prisma, storage);

    const seller = await prisma.user.findUniqueOrThrow({
      where: { email: 'vendedor@renest.app' },
      select: { _count: { select: { listings: true, ratingsReceived: true } } },
    });
    expect(seller._count.listings).toBeGreaterThan(0);
    expect(seller._count.ratingsReceived).toBe(0);
  });

  it('changes nothing when run a second time', async () => {
    await seed(prisma, storage);
    const before = await snapshot(prisma);

    await seed(prisma, storage);

    expect(await snapshot(prisma)).toEqual(before);
  });
});

async function snapshot(prisma: PrismaService) {
  return {
    categories: await prisma.category.findMany({ orderBy: { id: 'asc' } }),
    users: await prisma.user.findMany({ orderBy: { id: 'asc' } }),
    listings: await prisma.listing.findMany({
      orderBy: { id: 'asc' },
      include: {
        photos: { orderBy: { position: 'asc' } },
        pickupOptions: { orderBy: { id: 'asc' } },
        reservation: { include: { receptionChecklist: true, rating: true } },
      },
    }),
  };
}
