import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateListingDto } from './dto/create-listing.dto.js';
import { FeedQueryDto } from './dto/feed-query.dto.js';
import { FeedPageDto } from './dto/listing-card.dto.js';
import { ListingDetailDto } from './dto/listing-detail.dto.js';
import { ListingsService } from './listings.service.js';

@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Feed',
    description:
      'Public. Active listings only, newest first, paginated by cursor. A malformed cursor is 400 VALIDATION_ERROR.',
  })
  @ApiOkResponse({ type: FeedPageDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR' })
  getFeed(@Query() query: FeedQueryDto): Promise<FeedPageDto> {
    return this.listings.getFeed(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Publish a listing',
    description:
      'One transaction, no drafts: the listing, its 1–3 photos and its 1–3 pickup options are saved together and the listing goes live as ACTIVE.',
  })
  @ApiCreatedResponse({ type: ListingDetailDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
  @ApiUnprocessableEntityResponse({
    description: 'CATEGORY_NOT_FOUND, INVALID_PHOTO_KEY',
  })
  create(
    @CurrentUser() userId: string,
    @Body() dto: CreateListingDto,
  ): Promise<ListingDetailDto> {
    return this.listings.create(userId, dto);
  }

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
