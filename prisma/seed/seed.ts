import { readFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { detectPhotoType } from '../../src/storage/photo-file.js';
import type { StorageService } from '../../src/storage/storage.service.js';
import {
  CATEGORIES,
  DEMO_PASSWORD,
  LISTINGS,
  USERS,
  type DemoListing,
  type DemoUserKey,
} from './data.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PHOTOS_DIR = new URL('./photos/', import.meta.url);

// Idempotent: rows are matched by a unique key (or a fixed listing id) and
// created only when missing, so running it again changes nothing and keeps
// data created by hand.
export async function seed(
  prisma: PrismaClient,
  storage: StorageService,
): Promise<void> {
  const categoryIds = {} as Record<string, string>;
  for (const category of CATEGORIES) {
    const { id } = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
      select: { id: true },
    });
    categoryIds[category.slug] = id;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const userIds = {} as Record<DemoUserKey, string>;
  for (const [key, user] of Object.entries(USERS)) {
    const { id } = await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash },
      select: { id: true },
    });
    userIds[key as DemoUserKey] = id;
  }

  for (const listing of LISTINGS) {
    const exists = await prisma.listing.findUnique({
      where: { id: listing.id },
      select: { id: true },
    });
    if (!exists) {
      await createListing(prisma, storage, listing, categoryIds, userIds);
    }
  }
}

async function createListing(
  prisma: PrismaClient,
  storage: StorageService,
  listing: DemoListing,
  categoryIds: Record<string, string>,
  userIds: Record<DemoUserKey, string>,
): Promise<void> {
  const photoKeys = await Promise.all(listing.photos.map(uploadPhoto(storage)));
  const publishedAt = new Date(Date.now() - listing.publishedDaysAgo * DAY_MS);
  const { reservation } = listing;
  const status = !reservation
    ? 'ACTIVE'
    : reservation.handedOverAfterDays === undefined
      ? 'PENDING'
      : 'COMPLETED';

  await prisma.$transaction(async (tx) => {
    const created = await tx.listing.create({
      data: {
        id: listing.id,
        sellerId: userIds[listing.seller],
        categoryId: categoryIds[listing.category],
        title: listing.title,
        description: listing.description,
        condition: listing.condition,
        priceCents: listing.priceCents,
        status,
        publishedAt,
        photos: {
          create: photoKeys.map((storageKey, position) => ({
            storageKey,
            position,
          })),
        },
        pickupOptions: {
          create: listing.pickups.map((pickup) => ({
            locationLabel: pickup.locationLabel,
            weekdays: pickup.weekdays,
            startTime: time(pickup.start),
            endTime: time(pickup.end),
          })),
        },
      },
      select: { pickupOptions: { select: { id: true }, take: 1 } },
    });
    if (!reservation) return;

    const reservedAt = after(publishedAt, reservation.reservedAfterDays);
    const sellerHandedOverAt =
      reservation.handedOverAfterDays === undefined
        ? null
        : after(reservedAt, reservation.handedOverAfterDays);
    const { reception } = reservation;
    const buyerReceivedAt = reception
      ? after(sellerHandedOverAt ?? reservedAt, reception.receivedAfterDays)
      : null;

    await tx.reservation.create({
      data: {
        listingId: listing.id,
        pickupOptionId: created.pickupOptions[0].id,
        buyerId: userIds[reservation.buyer],
        reservedAt,
        sellerHandedOverAt,
        buyerReceivedAt,
        receptionChecklist: reception
          ? { create: reception.checklist }
          : undefined,
        rating: reception?.stars
          ? {
              create: {
                sellerId: userIds[listing.seller],
                stars: reception.stars,
              },
            }
          : undefined,
      },
    });
  });
}

// Seed photos live under their own prefix, apart from user uploads. The same
// file always gets the same key, so re-uploading it is harmless.
const uploadPhoto = (storage: StorageService) => async (file: string) => {
  const body = await readFile(new URL(file, PHOTOS_DIR));
  const type = detectPhotoType(body);
  if (!type) throw new Error(`Seed photo ${file} is not a JPEG, PNG or WebP`);
  const key = `seed/${file}`;
  await storage.put(key, body, type.contentType);
  return key;
};

// Pickup times are wall-clock times stored in a `time` column.
const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

const after = (from: Date, days: number) =>
  new Date(from.getTime() + days * DAY_MS);
