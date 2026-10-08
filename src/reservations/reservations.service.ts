import { HttpStatus, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AppException } from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-code.js';
import {
  LISTING_CARD_INCLUDE,
  toListingCard,
} from '../listings/listing-card.js';
import { toPickupOption } from '../listings/listing-format.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { ReservationDetailDto } from './dto/reservation-detail.dto.js';
import { reservationActions } from './reservation-actions.js';

const COUNTERPART_SELECT = {
  id: true,
  fullName: true,
  avatarUrl: true,
  phoneE164: true,
  isVerified: true,
} as const;

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // Only the buyer and the seller may see a reservation; anyone else gets a
  // 404, so they can't learn it exists.
  async getDetail(
    reservationId: string,
    viewerId: string,
  ): Promise<ReservationDetailDto> {
    const reservation = isUUID(reservationId)
      ? await this.prisma.reservation.findUnique({
          where: { id: reservationId },
          include: {
            listing: {
              include: {
                ...LISTING_CARD_INCLUDE,
                seller: { select: { ...COUNTERPART_SELECT, city: true } },
              },
            },
            pickupOption: true,
            buyer: { select: COUNTERPART_SELECT },
            receptionChecklist: true,
            rating: true,
          },
        })
      : null;
    const isSeller = reservation?.listing.sellerId === viewerId;
    const isBuyer = reservation?.buyerId === viewerId;
    if (!reservation || (!isSeller && !isBuyer)) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCode.RESERVATION_NOT_FOUND,
        'Reservation not found.',
      );
    }

    const { listing, receptionChecklist: checklist, rating } = reservation;
    const counterpart = isSeller ? reservation.buyer : listing.seller;
    return {
      id: reservation.id,
      viewerRole: isSeller ? 'SELLER' : 'BUYER',
      reservedAt: reservation.reservedAt,
      sellerHandedOverAt: reservation.sellerHandedOverAt,
      buyerReceivedAt: reservation.buyerReceivedAt,
      listing: await toListingCard(listing, this.storage),
      pickupOption: toPickupOption(reservation.pickupOption),
      counterpart: {
        id: counterpart.id,
        fullName: counterpart.fullName,
        avatarUrl: counterpart.avatarUrl,
        phoneE164: counterpart.phoneE164,
        isVerified: counterpart.isVerified,
      },
      receptionChecklist: checklist && {
        matchesListing: checklist.matchesListing,
        worksNoUndisclosedDamage: checklist.worksNoUndisclosedDamage,
        allPartsIncluded: checklist.allPartsIncluded,
        issueReport: checklist.issueReport,
        createdAt: checklist.createdAt,
      },
      rating: rating && { stars: rating.stars, createdAt: rating.createdAt },
      actions: reservationActions(isSeller ? 'SELLER' : 'BUYER', {
        sellerHandedOverAt: reservation.sellerHandedOverAt,
        buyerReceivedAt: reservation.buyerReceivedAt,
        hasRating: rating !== null,
      }),
    };
  }
}
