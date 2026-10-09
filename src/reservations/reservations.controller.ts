import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ConfirmReceptionDto } from './dto/confirm-reception.dto.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { RateSellerDto } from './dto/rate-seller.dto.js';
import {
  ReservationDetailDto,
  ReservationRatingDto,
} from './dto/reservation-detail.dto.js';
import { ReservationsService } from './reservations.service.js';

@ApiTags('reservations')
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reserve a listing and fix the pickup',
    description:
      'One transaction: the listing becomes PENDING and the reservation is created with the chosen pickup option. First come, first served. No cancel in R1.',
  })
  @ApiCreatedResponse({ type: ReservationDetailDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
  @ApiForbiddenResponse({ description: 'CANNOT_RESERVE_OWN_LISTING' })
  @ApiNotFoundResponse({ description: 'LISTING_NOT_FOUND' })
  @ApiConflictResponse({ description: 'LISTING_NOT_AVAILABLE' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_PICKUP_OPTION' })
  reserve(
    @CurrentUser() userId: string,
    @Body() dto: CreateReservationDto,
  ): Promise<ReservationDetailDto> {
    return this.reservations.reserve(userId, dto);
  }

  @Get(':reservationId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Pickup recap for the buyer or the seller',
    description:
      'Includes the other party’s phone. Anyone other than the buyer or the seller gets 404.',
  })
  @ApiOkResponse({ type: ReservationDetailDto })
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
  @ApiNotFoundResponse({ description: 'RESERVATION_NOT_FOUND' })
  getDetail(
    @Param('reservationId') reservationId: string,
    @CurrentUser() userId: string,
  ): Promise<ReservationDetailDto> {
    return this.reservations.getDetail(reservationId, userId);
  }

  @Post(':reservationId/handover')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Seller confirms the handover',
    description:
      'Sets the handover date and moves the listing to Completed. Can be done once; the buyer’s purchase does not change.',
  })
  @ApiOkResponse({ type: ReservationDetailDto })
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
  @ApiForbiddenResponse({ description: 'NOT_RESERVATION_SELLER' })
  @ApiNotFoundResponse({ description: 'RESERVATION_NOT_FOUND' })
  @ApiConflictResponse({ description: 'HANDOVER_ALREADY_CONFIRMED' })
  confirmHandover(
    @Param('reservationId') reservationId: string,
    @CurrentUser() userId: string,
  ): Promise<ReservationDetailDto> {
    return this.reservations.confirmHandover(reservationId, userId);
  }

  @Post(':reservationId/reception')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Buyer confirms reception with the checklist',
    description:
      'Sets the reception date and saves the checklist; completes the purchase. Works before or after the handover. Can be done once and cannot be changed.',
  })
  @ApiOkResponse({ type: ReservationDetailDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
  @ApiForbiddenResponse({ description: 'NOT_RESERVATION_BUYER' })
  @ApiNotFoundResponse({ description: 'RESERVATION_NOT_FOUND' })
  @ApiConflictResponse({ description: 'RECEPTION_ALREADY_CONFIRMED' })
  confirmReception(
    @Param('reservationId') reservationId: string,
    @CurrentUser() userId: string,
    @Body() dto: ConfirmReceptionDto,
  ): Promise<ReservationDetailDto> {
    return this.reservations.confirmReception(reservationId, userId, dto);
  }

  @Post(':reservationId/rating')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Buyer rates the seller',
    description:
      '1 to 5 stars, no comment. Only after the buyer confirmed reception, once, and it cannot be changed. Counts toward the seller’s average.',
  })
  @ApiCreatedResponse({ type: ReservationRatingDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
  @ApiForbiddenResponse({ description: 'NOT_RESERVATION_BUYER' })
  @ApiNotFoundResponse({ description: 'RESERVATION_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'RECEPTION_NOT_CONFIRMED, ALREADY_RATED',
  })
  rateSeller(
    @Param('reservationId') reservationId: string,
    @CurrentUser() userId: string,
    @Body() dto: RateSellerDto,
  ): Promise<ReservationRatingDto> {
    return this.reservations.rateSeller(reservationId, userId, dto);
  }
}
