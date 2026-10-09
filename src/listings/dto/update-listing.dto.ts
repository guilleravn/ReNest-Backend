import { ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { CreateListingDto } from './create-listing.dto.js';

@ValidatorConstraint({ name: 'onePhotoSource' })
class OnePhotoSourceConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const { photoId, storageKey } = args.object as PhotoInputDto;
    return (photoId === undefined) !== (storageKey === undefined);
  }

  defaultMessage(): string {
    return 'send exactly one of photoId or storageKey';
  }
}

/** One photo of the new set: a photo the listing has, or a new upload. */
export class PhotoInputDto {
  @ApiPropertyOptional({
    description: 'An existing photo of this listing (`photos[].id`).',
  })
  // Also checked when both fields are missing, so the item reports an error.
  @ValidateIf(
    (o: PhotoInputDto) => o.photoId !== undefined || o.storageKey === undefined,
  )
  @IsUUID()
  @Validate(OnePhotoSourceConstraint)
  photoId?: string;

  @ApiPropertyOptional({
    description: 'A new upload from POST /uploads/photos.',
  })
  @ValidateIf((o: PhotoInputDto) => o.storageKey !== undefined)
  @IsString()
  storageKey?: string;
}

// Same rules as publishing (LST-12). A field sent as null is validated, and
// rejected, instead of being skipped like a missing one.
export class UpdateListingDto extends PartialType(
  PickType(CreateListingDto, [
    'categoryId',
    'title',
    'description',
    'condition',
    'priceCents',
  ] as const),
  { skipNullProperties: false },
) {
  @ApiPropertyOptional({
    type: [PhotoInputDto],
    minItems: 1,
    maxItems: 3,
    description:
      'Replaces the whole set, in order; the first is the cover. Photos left out are removed.',
  })
  @ValidateIf((o: UpdateListingDto) => o.photos !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique((photo?: PhotoInputDto) => photo?.photoId ?? photo?.storageKey)
  @ValidateNested({ each: true })
  @Type(() => PhotoInputDto)
  photos?: PhotoInputDto[];
}
