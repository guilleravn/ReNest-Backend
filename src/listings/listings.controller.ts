import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ListingDetailDto } from './dto/listing-detail.dto.js';
import { ListingsService } from './listings.service.js';

@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get(':listingId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listing detail',
    description:
      "Public. With a valid token the seller's phone is included; an invalid or expired token is treated as anonymous.",
  })
  @ApiOkResponse({ type: ListingDetailDto })
  @ApiNotFoundResponse({ description: 'LISTING_NOT_FOUND' })
  getDetail(
    @Param('listingId') listingId: string,
    @CurrentUser() userId: string | undefined,
  ): Promise<ListingDetailDto> {
    return this.listings.getDetail(listingId, userId);
  }
}
