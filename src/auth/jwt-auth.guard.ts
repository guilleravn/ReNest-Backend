import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AppException } from '../common/errors/app.exception.js';
import { ErrorCode } from '../common/errors/error-code.js';

export interface AuthenticatedRequest extends Request {
  user?: { userId: string };
}

// Requires a valid Bearer token and attaches `{ userId }` to the request.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  protected readonly optional: boolean = false;

  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');

    try {
      if (scheme !== 'Bearer' || !token) throw new Error('No bearer token');
      const { sub } = await this.jwt.verifyAsync<{ sub: string }>(token);
      request.user = { userId: sub };
    } catch {
      if (!this.optional) {
        throw new AppException(
          HttpStatus.UNAUTHORIZED,
          ErrorCode.UNAUTHORIZED,
          'Missing, invalid or expired token.',
        );
      }
    }
    return true;
  }
}

// Same as JwtAuthGuard, but a missing or invalid token means anonymous.
@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  protected override readonly optional = true;
}
