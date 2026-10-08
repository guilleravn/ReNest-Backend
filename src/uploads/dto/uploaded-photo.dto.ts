import { ApiProperty } from '@nestjs/swagger';

export class UploadedPhotoDto {
  @ApiProperty({
    example: 'uploads/0192d3a4-0000-7000-8000-000000000001/3f1c….jpg',
    description: 'Send it in POST /listings.',
  })
  storageKey!: string;

  @ApiProperty({ description: 'Presigned, short-lived URL for the preview.' })
  url!: string;
}
