import { ApiProperty } from '@nestjs/swagger';
import { City } from '../../generated/prisma/enums.js';

export class MeDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() phoneE164!: string;
  @ApiProperty({ enum: City, enumName: 'City' }) city!: City;
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty() isVerified!: boolean;
}

export class AuthResponseDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ example: 'Bearer' }) tokenType!: 'Bearer';
  @ApiProperty({ example: 86400 }) expiresIn!: number;
  @ApiProperty({ type: MeDto }) user!: MeDto;
}
