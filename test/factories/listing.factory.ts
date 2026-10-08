import type { ListingStatus } from '../../src/generated/prisma/enums.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';

const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

interface ListingOverrides {
  status?: ListingStatus;
  photoCount?: number;
  title?: string;
  publishedAt?: Date;
  category?: { name: string; slug: string };
}

/** A listing of `sellerId` with `photoCount` photos and two pickup options. */
export async function createListing(
  prisma: PrismaService,
  sellerId: string,
  {
    status = 'ACTIVE',
    photoCount = 1,
    title = 'Silla de comedor en roble',
    publishedAt,
    category: { name, slug } = { name: 'Muebles', slug: 'muebles' },
  }: ListingOverrides = {},
) {
  const category = await prisma.category.upsert({
    where: { slug },
    update: {},
    create: { name, slug },
  });
  return prisma.listing.create({
    data: {
      sellerId,
      categoryId: category.id,
      title,
      description: 'Roble macizo, sin rayones.',
      condition: 'GENTLY_USED',
      priceCents: 18000000,
      status,
      publishedAt,
      photos: {
        // Created in reverse so tests can check the response sorts them.
        create: Array.from({ length: photoCount }, (_, i) => ({
          storageKey: `uploads/${sellerId}/photo-${i}.jpg`,
          position: i,
        })).reverse(),
      },
      pickupOptions: {
        create: [
          {
            locationLabel: 'Café Toscano, Av. Álvaro Obregón',
            weekdays: ['SATURDAY'],
            startTime: time('10:00'),
            endTime: time('13:00'),
          },
          {
            locationLabel: 'Plaza Principal',
            weekdays: ['MONDAY', 'WEDNESDAY'],
            startTime: time('18:30'),
            endTime: time('20:00'),
          },
        ],
      },
    },
    include: { category: true, pickupOptions: true },
  });
}

/**
 * A completed sale of `sellerId` to `buyerId` rated with `stars`. Each rating
 * needs its own listing, since a listing has one reservation.
 */
export async function rateSeller(
  prisma: PrismaService,
  sellerId: string,
  buyerId: string,
  stars: number,
) {
  const listing = await createListing(prisma, sellerId, {
    status: 'COMPLETED',
    title: `Vendido ${stars}`,
  });
  const now = new Date();
  await prisma.reservation.create({
    data: {
      listingId: listing.id,
      pickupOptionId: listing.pickupOptions[0].id,
      buyerId,
      sellerHandedOverAt: now,
      buyerReceivedAt: now,
      rating: { create: { sellerId, stars } },
    },
  });
}
