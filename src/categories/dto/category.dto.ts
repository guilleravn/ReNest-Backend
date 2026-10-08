import { ApiProperty } from '@nestjs/swagger';

export class CategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Muebles' }) name!: string;
  @ApiProperty({ example: 'muebles' }) slug!: string;
}
