import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from './error-code.js';

export interface FieldError {
  field: string;
  message: string;
}

export interface ErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details: FieldError[] | null;
}

// Throw this from services when the frontend needs a specific `code`, e.g.
// `throw new AppException(409, ErrorCode.LISTING_NOT_AVAILABLE, '...')`.
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details: FieldError[] | null = null,
  ) {
    super(message, status);
  }
}
