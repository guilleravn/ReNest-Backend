import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateReservationDto {
  @ApiProperty() @IsUUID() listingId!: string;
  @ApiProperty({ description: 'One of the listing’s pickup options.' })
  @IsUUID()
  pickupOptionId!: string;
}
