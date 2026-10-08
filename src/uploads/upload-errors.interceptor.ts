import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { catchError, Observable, throwError } from 'rxjs';
import { AppException } from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-code.js';
import { MAX_PHOTO_BYTES } from '../storage/photo-file.js';

export const missingFileException = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.VALIDATION_ERROR,
    'Validation failed.',
    [{ field: 'file', message: 'Send exactly one photo in the file field.' }],
  );

// Multer fails before the controller runs: 413 when the file is too large,
// 400 for a wrong field name or more than one file. The contract wants
// 400 INVALID_FILE and the usual VALIDATION_ERROR shape instead. List it
// before FileInterceptor so it wraps it.
@Injectable()
export class UploadErrorsInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) =>
        throwError(() => {
          if (error instanceof PayloadTooLargeException) {
            return new AppException(
              HttpStatus.BAD_REQUEST,
              ErrorCode.INVALID_FILE,
              `The photo must be at most ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`,
            );
          }
          if (error instanceof BadRequestException) {
            return missingFileException();
          }
          return error;
        }),
      ),
    );
  }
}
