import { ApiProperty } from '@nestjs/swagger';
import { ListingCardDto } from '../../listings/dto/listing-card.dto.js';
import { PickupOptionDto } from '../../listings/dto/listing-detail.dto.js';

export class PurchaseDto {
  @ApiProperty() id!: string;
  @ApiProperty() reservedAt!: Date;
  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Set when the seller confirmed the handover.',
  })
  sellerHandedOverAt!: Date | null;
  @ApiProperty({
    type: Date,
    nullable: true,
    description:
      'Set when the buyer confirmed reception; completes the purchase.',
  })
  buyerReceivedAt!: Date | null;
  @ApiProperty({ type: ListingCardDto }) listing!: ListingCardDto;
  @ApiProperty({ type: PickupOptionDto }) pickupOption!: PickupOptionDto;
}
