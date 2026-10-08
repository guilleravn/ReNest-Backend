import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-code.js';
import { detectPhotoType, photoKey } from '../storage/photo-file.js';
import { StorageService } from '../storage/storage.service.js';
import type { UploadedPhotoDto } from './dto/uploaded-photo.dto.js';

@Injectable()
export class UploadsService {
  constructor(private readonly storage: StorageService) {}

  async uploadPhoto(userId: string, file: Buffer): Promise<UploadedPhotoDto> {
    const type = detectPhotoType(file);
    if (!type) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.INVALID_FILE,
        'The photo must be a JPEG, PNG or WebP image.',
      );
    }

    const storageKey = photoKey(userId, type.ext);
    await this.storage.put(storageKey, file, type.contentType);
    return { storageKey, url: await this.storage.getUrl(storageKey) };
  }
}
