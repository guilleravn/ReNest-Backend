import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AppException } from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-code.js';
import {
  CreateListingDto,
  PickupOptionInputDto,
} from './dto/create-listing.dto.js';
import { FeedQueryDto } from './dto/feed-query.dto.js';
import { FeedPageDto } from './dto/listing-card.dto.js';
import { ListingDetailDto, PickupOptionDto } from './dto/listing-detail.dto.js';
import { UpdateListingDto } from './dto/update-listing.dto.js';
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

  @Patch(':listingId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit a listing',
    description:
      'Seller only, while the listing is ACTIVE. Any subset of the fields, with the same rules as publishing; publishedAt does not change.',
  })
  @ApiOkResponse({ type: ListingDetailDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
  @ApiForbiddenResponse({ description: 'NOT_LISTING_OWNER' })
  @ApiNotFoundResponse({ description: 'LISTING_NOT_FOUND' })
  @ApiConflictResponse({ description: 'LISTING_NOT_EDITABLE' })
  @ApiUnprocessableEntityResponse({
    description: 'CATEGORY_NOT_FOUND, INVALID_PHOTO_KEY',
  })
  update(
    @Param('listingId') listingId: string,
    @CurrentUser() userId: string,
    @Body() dto: UpdateListingDto,
  ): Promise<ListingDetailDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Validation failed.',
        [{ field: 'body', message: 'send at least one field to change' }],
      );
    }
    return this.listings.update(userId, listingId, dto);
  }

  @Post(':listingId/pickup-options')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add a pickup pair',
    description:
      'Seller only, while the listing is ACTIVE. A listing has at most 3 pairs; pairs are not edited in place.',
  })
  @ApiCreatedResponse({ type: PickupOptionDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
  @ApiForbiddenResponse({ description: 'NOT_LISTING_OWNER' })
  @ApiNotFoundResponse({ description: 'LISTING_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'LISTING_NOT_EDITABLE, PICKUP_OPTION_LIMIT',
  })
  addPickupOption(
    @Param('listingId') listingId: string,
    @CurrentUser() userId: string,
    @Body() dto: PickupOptionInputDto,
  ): Promise<PickupOptionDto> {
    return this.listings.addPickupOption(userId, listingId, dto);
  }

  @Delete(':listingId/pickup-options/:pickupOptionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove a pickup pair',
    description:
      'Seller only, while the listing is ACTIVE. A listing keeps at least 1 pair; to change one, remove it and add a new one.',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
  @ApiForbiddenResponse({ description: 'NOT_LISTING_OWNER' })
  @ApiNotFoundResponse({
    description: 'LISTING_NOT_FOUND, PICKUP_OPTION_NOT_FOUND',
  })
  @ApiConflictResponse({
    description: 'LISTING_NOT_EDITABLE, LAST_PICKUP_OPTION',
  })
  removePickupOption(
    @Param('listingId') listingId: string,
    @Param('pickupOptionId') pickupOptionId: string,
    @CurrentUser() userId: string,
  ): Promise<void> {
    return this.listings.removePickupOption(userId, listingId, pickupOptionId);
  }
}
