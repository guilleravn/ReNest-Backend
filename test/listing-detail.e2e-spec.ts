import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { signUp } from './factories/auth.factory.js';
import { createListing, rateSeller } from './factories/listing.factory.js';

describe('GET /listings/:listingId (BRW-5..9, GEN-7)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
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

  const getDetail = (id: string, token?: string) => {
    const req = request(server()).get(`/api/v1/listings/${id}`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  it('returns photos, price, condition, category, description and pickup pairs (BRW-5)', async () => {
    const { user: seller } = await signUpSeller();
    const listing = await createListing(prisma, seller.id as string, {
      photoCount: 3,
    });

    const res = await getDetail(listing.id).expect(200);

    expect(res.body).toMatchObject({
      id: listing.id,
      title: 'Silla de comedor en roble',
      description: 'Roble macizo, sin rayones.',
      condition: 'GENTLY_USED',
      priceCents: 18000000,
      status: 'ACTIVE',
      publishedAt: listing.publishedAt.toISOString(),
      category: {
        id: listing.category.id,
        name: 'Muebles',
        slug: 'muebles',
      },
    });
    expect(
      res.body.photos.map((p: { position: number }) => p.position),
    ).toEqual([0, 1, 2]);
    for (const photo of res.body.photos) {
      expect(Object.keys(photo).sort()).toEqual(['id', 'position', 'url']);
      expect(photo.url).toContain('X-Amz-Signature=');
    }
    expect(res.body.pickupOptions).toEqual(
      expect.arrayContaining([
        {
          id: expect.any(String),
          locationLabel: 'Café Toscano, Av. Álvaro Obregón',
          weekdays: ['SATURDAY'],
          startTime: '10:00',
          endTime: '13:00',
        },
        {
          id: expect.any(String),
          locationLabel: 'Plaza Principal',
          weekdays: ['MONDAY', 'WEDNESDAY'],
          startTime: '18:30',
          endTime: '20:00',
        },
      ]),
    );
    expect(JSON.stringify(res.body)).not.toContain('storageKey');
  });

  it('returns the seller snapshot with name, avatar, city and verified badge (BRW-6)', async () => {
    const { user: seller } = await signUpSeller();
    await prisma.user.update({
      where: { id: seller.id as string },
      data: {
        isVerified: true,
        avatarUrl: 'https://cdn.example.com/laura.jpg',
      },
    });
    const listing = await createListing(prisma, seller.id as string);

    const res = await getDetail(listing.id).expect(200);

    expect(res.body.seller).toEqual({
      id: seller.id,
      fullName: 'Laura Gómez',
      avatarUrl: 'https://cdn.example.com/laura.jpg',
      city: 'COCHABAMBA_BO',
      isVerified: true,
      rating: { average: null, count: 0 },
      phoneE164: null,
    });
  });

  it('averages the seller ratings to 1 decimal with their count (BRW-6, PUR-10)', async () => {
    const { user: seller } = await signUpSeller();
    const { user: buyer } = await signUpBuyer();
    for (const stars of [5, 5, 4]) {
      await rateSeller(prisma, seller.id as string, buyer.id as string, stars);
    }
    const listing = await createListing(prisma, seller.id as string);

    const res = await getDetail(listing.id).expect(200);

    expect(res.body.seller.rating).toEqual({ average: 4.7, count: 3 });
  });

  it('has a null average, not 0, when the seller has no ratings (BRW-6)', async () => {
    const { user: seller } = await signUpSeller();
    const listing = await createListing(prisma, seller.id as string);

    const res = await getDetail(listing.id).expect(200);

    expect(res.body.seller.rating).toEqual({ average: null, count: 0 });
  });

  it("returns the seller's phone to a logged-in buyer (GEN-7, C1)", async () => {
    const { user: seller } = await signUpSeller();
    const { token } = await signUpBuyer();
    const listing = await createListing(prisma, seller.id as string);

    const res = await getDetail(listing.id, token).expect(200);

    expect(res.body.seller.phoneE164).toBe('+59171234567');
  });

  it("never returns the seller's phone to an anonymous visitor (GEN-7)", async () => {
    const { user: seller } = await signUpSeller();
    const listing = await createListing(prisma, seller.id as string);

    const res = await getDetail(listing.id).expect(200);

    expect(res.body.seller.phoneE164).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('+59171234567');
  });

  it('treats an invalid token as anonymous and hides the phone (GEN-7)', async () => {
    const { user: seller } = await signUpSeller();
    const listing = await createListing(prisma, seller.id as string);

    const res = await getDetail(listing.id, 'not-a-jwt').expect(200);

    expect(res.body.seller.phoneE164).toBeNull();
    expect(res.body.viewer).toEqual({
      isSeller: false,
      canReserve: false,
      canEdit: false,
    });
  });

  it('treats an expired token as anonymous and hides the phone (GEN-7)', async () => {
    const { user: seller } = await signUpSeller();
    const { user: buyer } = await signUpBuyer();
    const listing = await createListing(prisma, seller.id as string);
    const expired = await jwt.signAsync({ sub: buyer.id }, { expiresIn: -60 });

    const res = await getDetail(listing.id, expired).expect(200);

    expect(res.body.seller.phoneE164).toBeNull();
  });

  it('lets a logged-in buyer reserve an active listing (GEN-5, RES-1)', async () => {
    const { user: seller } = await signUpSeller();
    const { token } = await signUpBuyer();
    const listing = await createListing(prisma, seller.id as string);

    const res = await getDetail(listing.id, token).expect(200);

    expect(res.body.viewer).toEqual({
      isSeller: false,
      canReserve: true,
      canEdit: false,
    });
  });

  it('gives an anonymous visitor no actions (GEN-5)', async () => {
    const { user: seller } = await signUpSeller();
    const listing = await createListing(prisma, seller.id as string);

    const res = await getDetail(listing.id).expect(200);

    expect(res.body.viewer).toEqual({
      isSeller: false,
      canReserve: false,
      canEdit: false,
    });
  });

  it('does not let the seller reserve their own listing, only edit it (BRW-9)', async () => {
    const { user: seller, token } = await signUpSeller();
    const listing = await createListing(prisma, seller.id as string);

    const res = await getDetail(listing.id, token).expect(200);

    expect(res.body.viewer).toEqual({
      isSeller: true,
      canReserve: false,
      canEdit: true,
    });
  });

  for (const status of ['PENDING', 'COMPLETED'] as const) {
    it(`still opens a ${status} listing, without pickup pairs or reserve action (BRW-8)`, async () => {
      const { user: seller } = await signUpSeller();
      const { token } = await signUpBuyer();
      const listing = await createListing(prisma, seller.id as string, {
        status,
      });

      const res = await getDetail(listing.id, token).expect(200);

      expect(res.body.status).toBe(status);
      expect(res.body.pickupOptions).toEqual([]);
      expect(res.body.viewer).toEqual({
        isSeller: false,
        canReserve: false,
        canEdit: false,
      });
    });
  }

  it('does not let the seller edit a listing that is no longer active (BRW-8)', async () => {
    const { user: seller, token } = await signUpSeller();
    const listing = await createListing(prisma, seller.id as string, {
      status: 'PENDING',
    });

    const res = await getDetail(listing.id, token).expect(200);

    expect(res.body.viewer).toEqual({
      isSeller: true,
      canReserve: false,
      canEdit: false,
    });
  });

  it('returns 404 LISTING_NOT_FOUND for an unknown id', async () => {
    const res = await getDetail('0192d3a4-0000-7000-8000-000000000999').expect(
      404,
    );

    expect(res.body).toEqual({
      statusCode: 404,
      code: 'LISTING_NOT_FOUND',
      message: expect.any(String),
      details: null,
    });
  });

  it('returns 404 LISTING_NOT_FOUND for an id that is not a UUID', async () => {
    const res = await getDetail('not-a-uuid').expect(404);

    expect(res.body).toEqual({
      statusCode: 404,
      code: 'LISTING_NOT_FOUND',
      message: expect.any(String),
      details: null,
    });
  });
});
