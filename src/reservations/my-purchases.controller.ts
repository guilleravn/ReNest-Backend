import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PurchaseDto } from './dto/purchase.dto.js';
import { PurchasesQueryDto } from './dto/purchases-query.dto.js';
import { ReservationsService } from './reservations.service.js';

@ApiTags('reservations')
@Controller('me/purchases')
export class MyPurchasesController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Buyer tabs: my purchases',
    description:
      'Newest first. COMPLETED means the buyer confirmed reception; the seller’s handover does not complete a purchase.',
  })
  @ApiOkResponse({ type: [PurchaseDto] })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
  getMine(
    @CurrentUser() userId: string,
    @Query() { status }: PurchasesQueryDto,
  ): Promise<PurchaseDto[]> {
    return this.reservations.listPurchases(userId, status);
  }
}
