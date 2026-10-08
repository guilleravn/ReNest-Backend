import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ReservationDetailDto } from './dto/reservation-detail.dto.js';
import { ReservationsService } from './reservations.service.js';

@ApiTags('reservations')
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

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
