import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsString,
  Length,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { City } from '../../generated/prisma/enums.js';
import { normalizeEmail } from './normalize-email.js';
import { isSupportedPhone, PHONE_FORMAT_MESSAGE } from '../phone-countries.js';

@ValidatorConstraint({ name: 'supportedPhone' })
class SupportedPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isSupportedPhone(value);
  }

  defaultMessage(): string {
    return PHONE_FORMAT_MESSAGE;
  }
}

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

  @ApiProperty({
    example: '+59171234567',
    description:
      'Mobile number in E.164 for BO (+591, 8 digits), PE (+51, 9), SV (+503, 8) or US (+1, 10)',
  })
  @IsString()
  @Validate(SupportedPhoneConstraint)
  phoneE164!: string;

  @ApiProperty({ enum: City, enumName: 'City' })
  @IsEnum(City)
  city!: City;
}
