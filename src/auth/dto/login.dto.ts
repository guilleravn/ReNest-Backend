import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { normalizeEmail } from './normalize-email.js';

export class LoginDto {
  @ApiProperty({ example: 'laura@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(72)
  password!: string;
}
