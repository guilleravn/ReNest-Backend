import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Checks that the migration enforces the ERD rules in the database itself,
// not only in the DTOs.
describe('Database schema (e2e)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

  async function createListing(sellerEmail = 'seller@example.com') {
    const seller = await prisma.user.create({
      data: {
        email: sellerEmail,
        passwordHash: 'hash',
        fullName: 'Laura Gómez',
        phoneE164: '+525512345678',
        city: 'COCHABAMBA_BO',
      },
    });
    const category = await prisma.category.upsert({
      where: { slug: 'muebles' },
      update: {},
      create: { name: 'Muebles', slug: 'muebles' },
    });
    return prisma.listing.create({
      data: {
        sellerId: seller.id,
        categoryId: category.id,
        title: 'Silla de comedor',
        description: 'Roble',
        condition: 'GENTLY_USED',
        priceCents: 18000000,
        photos: { create: [{ storageKey: 'uploads/a.jpg', position: 0 }] },
        pickupOptions: {
          create: [
            {
              locationLabel: 'Café Toscano',
              weekdays: ['SATURDAY'],
              startTime: time('10:00'),
              endTime: time('13:00'),
            },
          ],
        },
      },
      include: { pickupOptions: true },
    });
  }

  async function createBuyer(email = 'buyer@example.com') {
    return prisma.user.create({
      data: {
        email,
        passwordHash: 'hash',
        fullName: 'Andrés Pérez',
        phoneE164: '+525598765432',
        city: 'AREQUIPA_PE',
      },
    });
  }

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE users, categories, listings, listing_photos, pickup_options, reservations, reception_checklists, seller_ratings CASCADE',
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('stores a full purchase: listing, reservation, checklist and rating', async () => {
    const listing = await createListing();
    const buyer = await createBuyer();

    const reservation = await prisma.reservation.create({
      data: {
        listingId: listing.id,
        pickupOptionId: listing.pickupOptions[0].id,
        buyerId: buyer.id,
        buyerReceivedAt: new Date(),
        receptionChecklist: {
          create: {
            matchesListing: true,
            worksNoUndisclosedDamage: false,
            allPartsIncluded: true,
          },
        },
        rating: { create: { sellerId: listing.sellerId, stars: 5 } },
      },
    });

    expect(reservation.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects a price under $1 (100 cents)', async () => {
    const listing = await createListing();
    await expect(
      prisma.listing.update({
        where: { id: listing.id },
        data: { priceCents: 99 },
      }),
    ).rejects.toThrow(/listings_price_cents_check/);
  });

  it('rejects a photo position outside 0–2', async () => {
    const listing = await createListing();
    await expect(
      prisma.listingPhoto.create({
        data: {
          listingId: listing.id,
          storageKey: 'uploads/b.jpg',
          position: 3,
        },
      }),
    ).rejects.toThrow(/listing_photos_position_check/);
  });

  it('rejects a pickup option with no weekdays or an inverted time range', async () => {
    const listing = await createListing();
    const base = { listingId: listing.id, locationLabel: 'Parque México' };

    await expect(
      prisma.pickupOption.create({
        data: {
          ...base,
          weekdays: [],
          startTime: time('10:00'),
          endTime: time('11:00'),
        },
      }),
    ).rejects.toThrow(/pickup_options_weekdays_check/);
    await expect(
      prisma.pickupOption.create({
        data: {
          ...base,
          weekdays: ['MONDAY'],
          startTime: time('11:00'),
          endTime: time('11:00'),
        },
      }),
    ).rejects.toThrow(/pickup_options_time_range_check/);
  });

  it('allows only one reservation per listing', async () => {
    const listing = await createListing();
    const pickupOptionId = listing.pickupOptions[0].id;
    const first = await createBuyer('first@example.com');
    const second = await createBuyer('second@example.com');

    await prisma.reservation.create({
      data: { listingId: listing.id, pickupOptionId, buyerId: first.id },
    });
    await expect(
      prisma.reservation.create({
        data: { listingId: listing.id, pickupOptionId, buyerId: second.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a pickup option from another listing (composite FK)', async () => {
    const listing = await createListing('one@example.com');
    const other = await createListing('two@example.com');
    const buyer = await createBuyer();

    await expect(
      prisma.reservation.create({
        data: {
          listingId: listing.id,
          pickupOptionId: other.pickupOptions[0].id,
          buyerId: buyer.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('rejects a rating outside 1–5', async () => {
    const listing = await createListing();
    const buyer = await createBuyer();
    const reservation = await prisma.reservation.create({
      data: {
        listingId: listing.id,
        pickupOptionId: listing.pickupOptions[0].id,
        buyerId: buyer.id,
      },
    });

    await expect(
      prisma.sellerRating.create({
        data: {
          reservationId: reservation.id,
          sellerId: listing.sellerId,
          stars: 6,
        },
      }),
    ).rejects.toThrow(/seller_ratings_stars_check/);
  });
});
