import { ApiProperty } from '@nestjs/swagger';
import { ListingCardDto } from '../../listings/dto/listing-card.dto.js';
import { PickupOptionDto } from '../../listings/dto/listing-detail.dto.js';

export class CounterpartDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({
    example: '+59171234567',
    description: 'WhatsApp: https://wa.me/<phoneE164 without +>.',
  })
  phoneE164!: string;
  @ApiProperty() isVerified!: boolean;
}

export class ReceptionChecklistDto {
  @ApiProperty() matchesListing!: boolean;
  @ApiProperty() worksNoUndisclosedDamage!: boolean;
  @ApiProperty() allPartsIncluded!: boolean;
  @ApiProperty({ type: String, nullable: true }) issueReport!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class ReservationRatingDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) stars!: number;
  @ApiProperty() createdAt!: Date;
}

export class ReservationActionsDto {
  @ApiProperty() canConfirmHandover!: boolean;
  @ApiProperty() canConfirmReception!: boolean;
  @ApiProperty() canRate!: boolean;
}

export class ReservationDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['BUYER', 'SELLER'] }) viewerRole!: 'BUYER' | 'SELLER';
  @ApiProperty() reservedAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) sellerHandedOverAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true }) buyerReceivedAt!: Date | null;
  @ApiProperty({ type: ListingCardDto }) listing!: ListingCardDto;
  @ApiProperty({ type: PickupOptionDto }) pickupOption!: PickupOptionDto;
  @ApiProperty({
    type: CounterpartDto,
    description: 'The seller for the buyer, the buyer for the seller.',
  })
  counterpart!: CounterpartDto;
  @ApiProperty({ type: ReceptionChecklistDto, nullable: true })
  receptionChecklist!: ReceptionChecklistDto | null;
  @ApiProperty({ type: ReservationRatingDto, nullable: true })
  rating!: ReservationRatingDto | null;
  @ApiProperty({ type: ReservationActionsDto })
  actions!: ReservationActionsDto;
}
