import { ApiProperty } from '@nestjs/swagger';
import {
  City,
  ListingCondition,
  ListingStatus,
  Weekday,
} from '../../generated/prisma/enums.js';

export class CategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Muebles' }) name!: string;
  @ApiProperty({ example: 'muebles' }) slug!: string;
}

export class PhotoDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Presigned, short-lived URL.' }) url!: string;
  @ApiProperty({ description: '0 = cover.' }) position!: number;
}

export class PickupOptionDto {
  @ApiProperty() id!: string;
  @ApiProperty() locationLabel!: string;
  @ApiProperty({ enum: Weekday, enumName: 'Weekday', isArray: true })
  weekdays!: Weekday[];
  @ApiProperty({ example: '10:00' }) startTime!: string;
  @ApiProperty({ example: '13:00' }) endTime!: string;
}

export class RatingSummaryDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 4.9,
    description: 'Rounded to 1 decimal; null when count is 0.',
  })
  average!: number | null;
  @ApiProperty({ example: 63 }) count!: number;
}

export class ListingSellerDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ enum: City, enumName: 'City' }) city!: City;
  @ApiProperty() isVerified!: boolean;
  @ApiProperty({ type: RatingSummaryDto }) rating!: RatingSummaryDto;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Only with a valid token; null for anonymous visitors.',
  })
  phoneE164!: string | null;
}

export class ListingViewerDto {
  @ApiProperty() isSeller!: boolean;
  @ApiProperty() canReserve!: boolean;
  @ApiProperty() canEdit!: boolean;
}

export class ListingDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: ListingCondition, enumName: 'ListingCondition' })
  condition!: ListingCondition;
  @ApiProperty({ example: 18000000 }) priceCents!: number;
  @ApiProperty({ enum: ListingStatus, enumName: 'ListingStatus' })
  status!: ListingStatus;
  @ApiProperty() publishedAt!: Date;
  @ApiProperty({ type: CategoryDto }) category!: CategoryDto;
  @ApiProperty({ type: [PhotoDto] }) photos!: PhotoDto[];
  @ApiProperty({
    type: [PickupOptionDto],
    description: 'Empty when the listing is not ACTIVE.',
  })
  pickupOptions!: PickupOptionDto[];
  @ApiProperty({ type: ListingSellerDto }) seller!: ListingSellerDto;
  @ApiProperty({ type: ListingViewerDto }) viewer!: ListingViewerDto;
}
