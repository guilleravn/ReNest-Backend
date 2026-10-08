import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ConfirmReceptionDto {
  @ApiProperty({ description: 'The item matches the photos and description.' })
  @IsBoolean()
  matchesListing!: boolean;

  @ApiProperty({ description: 'Works, with no undisclosed damage.' })
  @IsBoolean()
  worksNoUndisclosedDamage!: boolean;

  @ApiProperty({ description: 'Includes all parts and accessories.' })
  @IsBoolean()
  allPartsIncluded!: boolean;

  @ApiProperty({
    enum: [true],
    description: 'The buyer has the item now. Must be true; not stored.',
  })
  @Equals(true, { message: 'hasItemNow must be true' })
  hasItemNow!: true;

  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    maxLength: 1000,
    description: 'Optional report. Trimmed; an empty report is saved as null.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString()
  @MaxLength(1000)
  issueReport?: string | null;
}
