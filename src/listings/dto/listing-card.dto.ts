import { ApiProperty } from '@nestjs/swagger';
import { CategoryDto } from '../../categories/dto/category.dto.js';
import {
  City,
  ListingCondition,
  ListingStatus,
} from '../../generated/prisma/enums.js';

export class ListingCardDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ example: 18000000 }) priceCents!: number;
  @ApiProperty({ enum: ListingCondition, enumName: 'ListingCondition' })
  condition!: ListingCondition;
  @ApiProperty({ type: CategoryDto }) category!: CategoryDto;
  @ApiProperty({ enum: ListingStatus, enumName: 'ListingStatus' })
  status!: ListingStatus;
  @ApiProperty({ description: 'Presigned, short-lived URL of photo 0.' })
  coverPhotoUrl!: string;
  @ApiProperty({
    enum: City,
    enumName: 'City',
    description: "The seller's city.",
  })
  city!: City;
  @ApiProperty() sellerIsVerified!: boolean;
  @ApiProperty() publishedAt!: Date;
}

export class FeedPageDto {
  @ApiProperty({ type: [ListingCardDto] }) data!: ListingCardDto[];
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Pass as `cursor` for the next page; null on the last page.',
  })
  nextCursor!: string | null;
}
