import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class FeedQueryDto {
  @ApiPropertyOptional({
    minLength: 2,
    maxLength: 60,
    description:
      'Matches the title, case-insensitive. Trimmed before the length check.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(2, 60)
  q?: string;

  @ApiPropertyOptional({
    example: 'muebles',
    description: 'Category slug. An unknown slug returns an empty page.',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  @ApiPropertyOptional({ description: '`nextCursor` from the previous page.' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
