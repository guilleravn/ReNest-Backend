import { PartialType, PickType } from '@nestjs/swagger';
import { CreateListingDto } from './create-listing.dto.js';

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
) {}
