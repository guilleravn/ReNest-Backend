import { HttpStatus, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AppException } from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-code.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  LISTING_CARD_INCLUDE,
  toListingCard,
} from '../listings/listing-card.js';
import { toPickupOption } from '../listings/listing-format.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { ConfirmReceptionDto } from './dto/confirm-reception.dto.js';
import type { CreateReservationDto } from './dto/create-reservation.dto.js';
import type { PurchaseDto } from './dto/purchase.dto.js';
import type { PurchaseStatus } from './dto/purchases-query.dto.js';
import type { ReservationDetailDto } from './dto/reservation-detail.dto.js';
import { reservationActions } from './reservation-actions.js';

const listingNotAvailable = () =>
  new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.LISTING_NOT_AVAILABLE,
    'This listing was already reserved.',
  );

const invalidPickupOption = () =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    ErrorCode.INVALID_PICKUP_OPTION,
    'The pickup option does not belong to this listing.',
  );

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

  async reserve(
    buyerId: string,
    { listingId, pickupOptionId }: CreateReservationDto,
  ): Promise<ReservationDetailDto> {
    // The order follows the contract: the conditional update locks the
    // listing row before the option is checked, so a concurrent removal of
    // the option waits and then finds the listing no longer editable.
    const { id } = await this.prisma
      .$transaction(async (tx) => {
        const listing = await tx.listing.findUnique({
          where: { id: listingId },
          select: { sellerId: true },
        });
        if (!listing) {
          throw new AppException(
            HttpStatus.NOT_FOUND,
            ErrorCode.LISTING_NOT_FOUND,
            'Listing not found.',
          );
        }
        if (listing.sellerId === buyerId) {
          throw new AppException(
            HttpStatus.FORBIDDEN,
            ErrorCode.CANNOT_RESERVE_OWN_LISTING,
            'You cannot reserve your own listing.',
          );
        }

        const { count } = await tx.listing.updateMany({
          where: { id: listingId, status: 'ACTIVE' },
          data: { status: 'PENDING' },
        });
        if (count === 0) throw listingNotAvailable();

        const option = await tx.pickupOption.findFirst({
          where: { id: pickupOptionId, listingId },
          select: { id: true },
        });
        if (!option) throw invalidPickupOption();

        return tx.reservation.create({
          data: { listingId, pickupOptionId, buyerId },
          select: { id: true },
        });
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2002') throw listingNotAvailable();
          if (error.code === 'P2003') throw invalidPickupOption();
        }
        throw error;
      });

    return this.getDetail(id, buyerId);
  }

  // COMPLETED = the buyer confirmed reception; the seller's handover alone
  // keeps a purchase in progress (PUR-2).
  async listPurchases(
    buyerId: string,
    status: PurchaseStatus,
  ): Promise<PurchaseDto[]> {
    const reservations = await this.prisma.reservation.findMany({
      where: {
        buyerId,
        buyerReceivedAt: status === 'COMPLETED' ? { not: null } : null,
      },
      orderBy: [{ reservedAt: 'desc' }, { id: 'desc' }],
      include: {
        pickupOption: true,
        listing: { include: LISTING_CARD_INCLUDE },
      },
    });

    return Promise.all(
      reservations.map(async (reservation) => ({
        id: reservation.id,
        reservedAt: reservation.reservedAt,
        sellerHandedOverAt: reservation.sellerHandedOverAt,
        buyerReceivedAt: reservation.buyerReceivedAt,
        listing: await toListingCard(reservation.listing, this.storage),
        pickupOption: toPickupOption(reservation.pickupOption),
      })),
    );
  }

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

  // Each update only matches the expected state, so a second or concurrent
  // confirmation changes nothing and gets a 409. The buyer's side is left
  // untouched.
  async confirmHandover(
    reservationId: string,
    viewerId: string,
  ): Promise<ReservationDetailDto> {
    const reservation = isUUID(reservationId)
      ? await this.prisma.reservation.findUnique({
          where: { id: reservationId },
          select: {
            buyerId: true,
            listingId: true,
            listing: { select: { sellerId: true } },
          },
        })
      : null;
    const isSeller = reservation?.listing.sellerId === viewerId;
    if (!reservation || (!isSeller && reservation.buyerId !== viewerId)) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCode.RESERVATION_NOT_FOUND,
        'Reservation not found.',
      );
    }
    if (!isSeller) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.NOT_RESERVATION_SELLER,
        'Only the seller can confirm the handover.',
      );
    }

    const alreadyConfirmed = () =>
      new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.HANDOVER_ALREADY_CONFIRMED,
        'The handover was already confirmed.',
      );
    await this.prisma.$transaction(async (tx) => {
      const handedOver = await tx.reservation.updateMany({
        where: { id: reservationId, sellerHandedOverAt: null },
        data: { sellerHandedOverAt: new Date() },
      });
      if (handedOver.count === 0) throw alreadyConfirmed();
      const completed = await tx.listing.updateMany({
        where: { id: reservation.listingId, status: 'PENDING' },
        data: { status: 'COMPLETED' },
      });
      if (completed.count === 0) throw alreadyConfirmed();
    });

    return this.getDetail(reservationId, viewerId);
  }

  // Only matches while reception is unset, so a second or concurrent
  // confirmation changes nothing and gets a 409. The seller's side and the
  // listing are left untouched.
  async confirmReception(
    reservationId: string,
    viewerId: string,
    {
      matchesListing,
      worksNoUndisclosedDamage,
      allPartsIncluded,
      issueReport,
    }: ConfirmReceptionDto,
  ): Promise<ReservationDetailDto> {
    const reservation = isUUID(reservationId)
      ? await this.prisma.reservation.findUnique({
          where: { id: reservationId },
          select: { buyerId: true, listing: { select: { sellerId: true } } },
        })
      : null;
    const isBuyer = reservation?.buyerId === viewerId;
    if (
      !reservation ||
      (!isBuyer && reservation.listing.sellerId !== viewerId)
    ) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCode.RESERVATION_NOT_FOUND,
        'Reservation not found.',
      );
    }
    if (!isBuyer) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.NOT_RESERVATION_BUYER,
        'Only the buyer can confirm the reception.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const received = await tx.reservation.updateMany({
        where: { id: reservationId, buyerReceivedAt: null },
        data: { buyerReceivedAt: new Date() },
      });
      if (received.count === 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.RECEPTION_ALREADY_CONFIRMED,
          'The reception was already confirmed.',
        );
      }
      await tx.receptionChecklist.create({
        data: {
          reservationId,
          matchesListing,
          worksNoUndisclosedDamage,
          allPartsIncluded,
          issueReport: issueReport ?? null,
        },
      });
    });

    return this.getDetail(reservationId, viewerId);
  }
}
