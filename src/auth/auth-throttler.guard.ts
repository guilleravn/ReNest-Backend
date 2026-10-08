import { ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Response } from 'express';
import { AppException } from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-code.js';

// Same as ThrottlerGuard, but answers with the API error shape and a
// Retry-After header (API contract §1.1).
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader(
        'Retry-After',
        String(detail.timeToBlockExpire || detail.timeToExpire),
      );
    throw new AppException(
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorCode.RATE_LIMITED,
      'Too many attempts. Try again later.',
    );
  }
}
