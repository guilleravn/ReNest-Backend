import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { ListingCondition, Weekday } from '../../generated/prisma/enums.js';

export const MIN_PRICE_CENTS = 100;
export const MAX_PRICE_CENTS = 2_000_000_000;
export const MAX_PICKUP_OPTIONS = 3;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Trimmed before the length check, so a value of only spaces is too short.
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

@ValidatorConstraint({ name: 'endAfterStart' })
class EndAfterStartConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const { startTime } = args.object as { startTime?: unknown };
    // The format constraints already report malformed times. Zero-padded
    // "HH:mm" strings compare in time order.
    if (typeof value !== 'string' || typeof startTime !== 'string') return true;
    if (!HHMM.test(value) || !HHMM.test(startTime)) return true;
    return value > startTime;
  }

  defaultMessage(): string {
    return 'endTime must be later than startTime';
  }
}

export class PickupOptionInputDto {
  @ApiProperty({
    example: 'Café Toscano, Av. Álvaro Obregón',
    minLength: 3,
    maxLength: 120,
    description: 'A public place. Trimmed before the length check.',
  })
  @Transform(trim)
  @IsString()
  @Length(3, 120)
  locationLabel!: string;

  @ApiProperty({
    enum: Weekday,
    enumName: 'Weekday',
    isArray: true,
    minItems: 1,
    maxItems: 7,
    uniqueItems: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsEnum(Weekday, { each: true })
  weekdays!: Weekday[];

  @ApiProperty({ example: '10:00', description: '"HH:mm", 24h, local time.' })
  @IsString()
  @Matches(HHMM, { message: 'startTime must be "HH:mm"' })
  startTime!: string;

  @ApiProperty({ example: '13:00', description: 'Later than startTime.' })
  @IsString()
  @Matches(HHMM, { message: 'endTime must be "HH:mm"' })
  @Validate(EndAfterStartConstraint)
  endTime!: string;
}

export class CreateListingDto {
  @ApiProperty() @IsUUID() categoryId!: string;

  @ApiProperty({
    example: 'Silla de comedor en roble',
    minLength: 3,
    maxLength: 120,
    description: 'Trimmed before the length check.',
  })
  @Transform(trim)
  @IsString()
  @Length(3, 120)
  title!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 2000,
    description: 'Trimmed before the length check.',
  })
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  description!: string;

  @ApiProperty({ enum: ListingCondition, enumName: 'ListingCondition' })
  @IsEnum(ListingCondition)
  condition!: ListingCondition;

  @ApiProperty({
    example: 18000000,
    minimum: MIN_PRICE_CENTS,
    maximum: MAX_PRICE_CENTS,
    description: 'Integer cents.',
  })
  @IsInt()
  @Min(MIN_PRICE_CENTS)
  @Max(MAX_PRICE_CENTS)
  priceCents!: number;

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 3,
    uniqueItems: true,
    description:
      '`storageKey`s from POST /uploads/photos, in order; the first is the cover.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsString({ each: true })
  photoKeys!: string[];

  @ApiProperty({
    type: [PickupOptionInputDto],
    minItems: 1,
    maxItems: MAX_PICKUP_OPTIONS,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PICKUP_OPTIONS)
  @ValidateNested({ each: true })
  @Type(() => PickupOptionInputDto)
  pickupOptions!: PickupOptionInputDto[];
}
