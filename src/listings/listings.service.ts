import { HttpStatus, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AppException } from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-code.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ListingStatus } from '../generated/prisma/enums.js';
import { isOwnPhotoKey } from '../storage/photo-file.js';
import {
  MAX_PICKUP_OPTIONS,
  type CreateListingDto,
  type PickupOptionInputDto,
} from './dto/create-listing.dto.js';
import type { FeedQueryDto } from './dto/feed-query.dto.js';
import type { FeedPageDto } from './dto/listing-card.dto.js';
import type {
  ListingDetailDto,
  PickupOptionDto,
} from './dto/listing-detail.dto.js';
import type { MyListingDto } from './dto/my-listings.dto.js';
import type {
  PhotoInputDto,
  UpdateListingDto,
} from './dto/update-listing.dto.js';
import { escapeLike } from './escape-like.js';
import { decodeFeedCursor, encodeFeedCursor } from './feed-cursor.js';
import { LISTING_CARD_INCLUDE, toListingCard } from './listing-card.js';
import { fromHhmm, sellerRating, toPickupOption } from './listing-format.js';

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async create(
    sellerId: string,
    dto: CreateListingDto,
  ): Promise<ListingDetailDto> {
    if (!dto.photoKeys.every((key) => isOwnPhotoKey(sellerId, key))) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.INVALID_PHOTO_KEY,
        'Every photo must be one of your uploads.',
      );
    }
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.CATEGORY_NOT_FOUND,
        'Category not found.',
      );
    }

    // One nested create runs in one transaction: the listing, its photos and
    // its pickup pairs are saved together or not at all.
    const { id } = await this.prisma.listing.create({
      data: {
        sellerId,
        categoryId: dto.categoryId,
        title: dto.title,
        description: dto.description,
        condition: dto.condition,
        priceCents: dto.priceCents,
        photos: {
          create: dto.photoKeys.map((storageKey, position) => ({
            storageKey,
            position,
          })),
        },
        pickupOptions: {
          create: dto.pickupOptions.map((option) => ({
            locationLabel: option.locationLabel,
            weekdays: option.weekdays,
            startTime: fromHhmm(option.startTime),
            endTime: fromHhmm(option.endTime),
          })),
        },
      },
      select: { id: true },
    });
    return this.getDetail(id, sellerId);
  }

  async update(
    sellerId: string,
    listingId: string,
    dto: UpdateListingDto,
  ): Promise<ListingDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockEditableListing(tx, sellerId, listingId);
      if (dto.categoryId !== undefined) {
        const category = await tx.category.findUnique({
          where: { id: dto.categoryId },
          select: { id: true },
        });
        if (!category) {
          throw new AppException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            ErrorCode.CATEGORY_NOT_FOUND,
            'Category not found.',
          );
        }
      }

      if (dto.photos) {
        await this.replacePhotos(tx, sellerId, listingId, dto.photos);
      }

      // publishedAt is never written, so the listing keeps its feed position.
      await tx.listing.update({
        where: { id: listingId },
        data: {
          categoryId: dto.categoryId,
          title: dto.title,
          description: dto.description,
          condition: dto.condition,
          priceCents: dto.priceCents,
        },
      });
    });
    return this.getDetail(listingId, sellerId);
  }

  async addPickupOption(
    sellerId: string,
    listingId: string,
    dto: PickupOptionInputDto,
  ): Promise<PickupOptionDto> {
    return this.prisma.$transaction(async (tx) => {
      // The count runs under the row lock, so two concurrent adds can't
      // both see 2 pairs and leave the listing with 4.
      await this.lockEditableListing(tx, sellerId, listingId);
      const count = await tx.pickupOption.count({ where: { listingId } });
      if (count >= MAX_PICKUP_OPTIONS) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.PICKUP_OPTION_LIMIT,
          `A listing can have at most ${MAX_PICKUP_OPTIONS} pickup options.`,
        );
      }
      const option = await tx.pickupOption.create({
        data: {
          listingId,
          locationLabel: dto.locationLabel,
          weekdays: dto.weekdays,
          startTime: fromHhmm(dto.startTime),
          endTime: fromHhmm(dto.endTime),
        },
      });
      return toPickupOption(option);
    });
  }

  async removePickupOption(
    sellerId: string,
    listingId: string,
    pickupOptionId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Under the row lock, a reservation can't pick this pair between the
      // status check and the delete, and two removes can't both see 2 pairs.
      await this.lockEditableListing(tx, sellerId, listingId);
      const option = isUUID(pickupOptionId)
        ? await tx.pickupOption.findFirst({
            where: { id: pickupOptionId, listingId },
            select: { id: true },
          })
        : null;
      if (!option) {
        throw new AppException(
          HttpStatus.NOT_FOUND,
          ErrorCode.PICKUP_OPTION_NOT_FOUND,
          'Pickup option not found.',
        );
      }
      const count = await tx.pickupOption.count({ where: { listingId } });
      if (count <= 1) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.LAST_PICKUP_OPTION,
          'A listing needs at least one pickup option.',
        );
      }
      await tx.pickupOption.delete({ where: { id: option.id } });
    });
  }

  // The row lock orders the edit against a reservation: a reservation waits
  // for the edit to commit, and an edit that waited for a reservation then
  // finds the listing Pending.
  private async lockEditableListing(
    tx: Prisma.TransactionClient,
    sellerId: string,
    listingId: string,
  ): Promise<void> {
    const [listing] = isUUID(listingId)
      ? await tx.$queryRaw<{ sellerId: string; status: ListingStatus }[]>`
          SELECT seller_id AS "sellerId", status::text AS status
          FROM listings WHERE id = ${listingId}::uuid FOR UPDATE`
      : [];
    if (!listing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCode.LISTING_NOT_FOUND,
        'Listing not found.',
      );
    }
    if (listing.sellerId !== sellerId) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.NOT_LISTING_OWNER,
        'You can only edit your own listings.',
      );
    }
    if (listing.status !== 'ACTIVE') {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.LISTING_NOT_EDITABLE,
        'This listing was already reserved and can no longer be edited.',
      );
    }
  }

  // The rows are recreated rather than updated, because moving a photo to a
  // taken position would break the unique (listing, position) pair midway.
  // Kept photos keep their id, key and creation date.
  private async replacePhotos(
    tx: Prisma.TransactionClient,
    sellerId: string,
    listingId: string,
    photos: PhotoInputDto[],
  ): Promise<void> {
    const current = new Map(
      (await tx.listingPhoto.findMany({ where: { listingId } })).map(
        (photo) => [photo.id, photo],
      ),
    );
    const invalidPhoto = () =>
      new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.INVALID_PHOTO_KEY,
        'Every photo must be one of this listing or one of your uploads.',
      );

    const rows = photos.map(({ photoId, storageKey }, position) => {
      if (photoId !== undefined) {
        const kept = current.get(photoId);
        if (!kept) throw invalidPhoto();
        const { id, storageKey: keptKey, createdAt } = kept;
        return { id, listingId, storageKey: keptKey, createdAt, position };
      }
      if (!isOwnPhotoKey(sellerId, storageKey!)) throw invalidPhoto();
      return { listingId, storageKey: storageKey!, position };
    });
    // The DTO compares items by photoId or storageKey, so a kept photo sent
    // again by its key only shows up once both resolve to keys.
    if (new Set(rows.map((row) => row.storageKey)).size < rows.length) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Validation failed.',
        [{ field: 'photos', message: 'each photo can appear only once' }],
      );
    }

    await tx.listingPhoto.deleteMany({ where: { listingId } });
    await tx.listingPhoto.createMany({ data: rows });
  }

  async getFeed({
    q,
    category,
    city,
    limit,
    cursor,
  }: FeedQueryDto): Promise<FeedPageDto> {
    const afterId = cursor === undefined ? undefined : decodeFeedCursor(cursor);
    if (afterId === null) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Validation failed.',
        [{ field: 'cursor', message: 'cursor is malformed' }],
      );
    }

    // Prisma's cursor reads the cursor row's sort keys in SQL. The row is
    // excluded by id rather than `skip: 1`, because it may have left the
    // feed since (reserved) and then there is nothing to skip.
    const page = await this.prisma.listing.findMany({
      where: {
        status: 'ACTIVE',
        ...(q && { title: { contains: escapeLike(q), mode: 'insensitive' } }),
        ...(category && { category: { slug: category } }),
        ...(city && { seller: { city } }),
        ...(afterId && { id: { not: afterId } }),
      },
      ...(afterId && { cursor: { id: afterId } }),
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: LISTING_CARD_INCLUDE,
    });
    const hasMore = page.length > limit;
    const listings = hasMore ? page.slice(0, limit) : page;

    const data = await Promise.all(
      listings.map((listing) => toListingCard(listing, this.storage)),
    );
    return {
      data,
      nextCursor: hasMore ? encodeFeedCursor(listings.at(-1)!.id) : null,
    };
  }

  async getMine(
    sellerId: string,
    status: ListingStatus,
  ): Promise<MyListingDto[]> {
    const listings = await this.prisma.listing.findMany({
      where: { sellerId, status },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      include: {
        ...LISTING_CARD_INCLUDE,
        reservation: {
          include: {
            buyer: { select: { id: true, fullName: true } },
            pickupOption: true,
          },
        },
      },
    });

    return Promise.all(
      listings.map(async (listing) => {
        const { reservation } = listing;
        return {
          listing: await toListingCard(listing, this.storage),
          reservation: reservation && {
            id: reservation.id,
            reservedAt: reservation.reservedAt,
            sellerHandedOverAt: reservation.sellerHandedOverAt,
            buyer: reservation.buyer,
            pickupOption: toPickupOption(reservation.pickupOption),
          },
        };
      }),
    );
  }

  async getDetail(
    listingId: string,
    viewerId: string | undefined,
  ): Promise<ListingDetailDto> {
    const listing = isUUID(listingId)
      ? await this.prisma.listing.findUnique({
          where: { id: listingId },
          include: {
            category: { select: { id: true, name: true, slug: true } },
            photos: { orderBy: { position: 'asc' } },
            pickupOptions: { orderBy: { createdAt: 'asc' } },
            seller: true,
          },
        })
      : null;
    if (!listing) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCode.LISTING_NOT_FOUND,
        'Listing not found.',
      );
    }

    const { seller } = listing;
    const [ratings, photos] = await Promise.all([
      this.prisma.sellerRating.aggregate({
        where: { sellerId: seller.id },
        _sum: { stars: true },
        _count: true,
      }),
      Promise.all(
        listing.photos.map(async ({ id, storageKey, position }) => ({
          id,
          url: await this.storage.getUrl(storageKey),
          position,
        })),
      ),
    ]);

    const isActive = listing.status === 'ACTIVE';
    const isSeller = viewerId === seller.id;

    return {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      condition: listing.condition,
      priceCents: listing.priceCents,
      status: listing.status,
      publishedAt: listing.publishedAt,
      category: listing.category,
      photos,
      pickupOptions: isActive ? listing.pickupOptions.map(toPickupOption) : [],
      seller: {
        id: seller.id,
        fullName: seller.fullName,
        avatarUrl: seller.avatarUrl,
        city: seller.city,
        isVerified: seller.isVerified,
        rating: sellerRating(ratings._sum.stars, ratings._count),
        phoneE164: viewerId ? seller.phoneE164 : null,
      },
      viewer: {
        isSeller,
        canReserve: Boolean(viewerId) && isActive && !isSeller,
        canEdit: isActive && isSeller,
      },
    };
  }
}
