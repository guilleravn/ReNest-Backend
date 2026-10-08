import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { ReservationDetailDto } from './dto/reservation-detail.dto.js';
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
}
