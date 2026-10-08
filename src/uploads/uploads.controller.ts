import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { MAX_PHOTO_BYTES } from '../storage/photo-file.js';
import { UploadedPhotoDto } from './dto/uploaded-photo.dto.js';
import {
  missingFileException,
  UploadErrorsInterceptor,
} from './upload-errors.interceptor.js';
import { UploadsService } from './uploads.service.js';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('photos')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    UploadErrorsInterceptor,
    FileInterceptor('file', {
      limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
    }),
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upload one photo',
    description:
      'JPEG, PNG or WebP, at most 5 MB. The type is read from the bytes.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: UploadedPhotoDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR, INVALID_FILE' })
  @ApiUnauthorizedResponse({ description: 'UNAUTHORIZED' })
  uploadPhoto(
    @CurrentUser() userId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<UploadedPhotoDto> {
    if (!file) throw missingFileException();
    return this.uploads.uploadPhoto(userId, file.buffer);
  }
}
