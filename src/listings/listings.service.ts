import { HttpStatus, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AppException } from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-code.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { FeedPageDto } from './dto/listing-card.dto.js';
import type { ListingDetailDto } from './dto/listing-detail.dto.js';
import { sellerRating, toHhmm } from './listing-format.js';

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async getFeed(): Promise<FeedPageDto> {
    const listings = await this.prisma.listing.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      include: {
        category: { select: { id: true, name: true, slug: true } },
        photos: { orderBy: { position: 'asc' }, take: 1 },
        seller: { select: { city: true, isVerified: true } },
      },
    });

    const data = await Promise.all(
      listings.map(async (listing) => ({
        id: listing.id,
        title: listing.title,
        priceCents: listing.priceCents,
        condition: listing.condition,
        category: listing.category,
        status: listing.status,
        coverPhotoUrl: await this.storage.getUrl(listing.photos[0].storageKey),
        city: listing.seller.city,
        sellerIsVerified: listing.seller.isVerified,
        publishedAt: listing.publishedAt,
      })),
    );
    return { data, nextCursor: null };
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
      pickupOptions: isActive
        ? listing.pickupOptions.map((option) => ({
            id: option.id,
            locationLabel: option.locationLabel,
            weekdays: option.weekdays,
            startTime: toHhmm(option.startTime),
            endTime: toHhmm(option.endTime),
          }))
        : [],
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
