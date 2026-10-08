import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ListingStatus } from '../../generated/prisma/enums.js';
import { ListingCardDto } from './listing-card.dto.js';
import { PickupOptionDto } from './listing-detail.dto.js';

export class MyListingsQueryDto {
  @ApiProperty({
    enum: ListingStatus,
    enumName: 'ListingStatus',
    description:
      'ACTIVE = "Activos", PENDING = "En proceso", COMPLETED = "Completados".',
  })
  @IsEnum(ListingStatus)
  status!: ListingStatus;
}

export class SaleBuyerDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Andrés Pérez' }) fullName!: string;
}

export class SaleReservationDto {
  @ApiProperty() id!: string;
  @ApiProperty() reservedAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) sellerHandedOverAt!: Date | null;
  @ApiProperty({ type: SaleBuyerDto }) buyer!: SaleBuyerDto;
  @ApiProperty({ type: PickupOptionDto }) pickupOption!: PickupOptionDto;
}

export class MyListingDto {
  @ApiProperty({ type: ListingCardDto }) listing!: ListingCardDto;
  @ApiProperty({
    type: SaleReservationDto,
    nullable: true,
    description: 'Null on ACTIVE.',
  })
  reservation!: SaleReservationDto | null;
}
