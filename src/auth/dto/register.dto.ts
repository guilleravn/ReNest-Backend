import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { City } from '../../generated/prisma/enums.js';
import { normalizeEmail } from './normalize-email.js';

export class RegisterDto {
  @ApiProperty({ example: 'laura@example.com', maxLength: 255 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @Length(8, 72)
  password!: string;

  @ApiProperty({ example: 'Laura Gómez', minLength: 2, maxLength: 120 })
  @IsString()
  @Length(2, 120)
  fullName!: string;

  @ApiProperty({ example: '+525512345678', pattern: '^\\+[1-9]\\d{7,14}$' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phoneE164 must be in E.164 format, e.g. +525512345678',
  })
  phoneE164!: string;

  @ApiProperty({ enum: City, enumName: 'City' })
  @IsEnum(City)
  city!: City;
}
