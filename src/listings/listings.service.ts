import { HttpStatus, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AppException } from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-code.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { ListingStatus } from '../generated/prisma/enums.js';
import { isOwnPhotoKey } from '../storage/photo-file.js';
import type { CreateListingDto } from './dto/create-listing.dto.js';
import type { FeedQueryDto } from './dto/feed-query.dto.js';
import type { FeedPageDto } from './dto/listing-card.dto.js';
import type { ListingDetailDto } from './dto/listing-detail.dto.js';
import type { MyListingDto } from './dto/my-listings.dto.js';
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

  async getFeed({
    q,
    category,
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
