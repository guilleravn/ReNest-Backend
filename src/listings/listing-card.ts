import type { Prisma } from '../generated/prisma/client.js';
import type { StorageService } from '../storage/storage.service.js';
import type { ListingCardDto } from './dto/listing-card.dto.js';

// What a query must load to build a ListingCard (cover photo = position 0).
export const LISTING_CARD_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  photos: { where: { position: 0 }, select: { storageKey: true } },
  seller: { select: { city: true, isVerified: true } },
} satisfies Prisma.ListingInclude;

type ListingCardRow = Prisma.ListingGetPayload<{
  include: typeof LISTING_CARD_INCLUDE;
}>;

export async function toListingCard(
  listing: ListingCardRow,
  storage: StorageService,
): Promise<ListingCardDto> {
  return {
    id: listing.id,
    title: listing.title,
    priceCents: listing.priceCents,
    condition: listing.condition,
    category: listing.category,
    status: listing.status,
    coverPhotoUrl: await storage.getUrl(listing.photos[0].storageKey),
    city: listing.seller.city,
    sellerIsVerified: listing.seller.isVerified,
    publishedAt: listing.publishedAt,
  };
}
