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
import { MyListingDto, MyListingsQueryDto } from './dto/my-listings.dto.js';
import { ListingsService } from './listings.service.js';

@ApiTags('listings')
@Controller('me/listings')
export class MyListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Seller tabs: my listings in one status',
    description:
      'Newest first. `reservation` is null on ACTIVE; the buyer phone is only in GET /reservations/:id.',
  })
  @ApiOkResponse({ type: [MyListingDto] })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
  getMine(
    @CurrentUser() userId: string,
    @Query() { status }: MyListingsQueryDto,
  ): Promise<MyListingDto[]> {
    return this.listings.getMine(userId, status);
  }
}
