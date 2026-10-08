import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../config/env.validation.js';
import { AuthThrottlerGuard } from './auth-throttler.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES_IN', { infer: true }),
        },
      }),
    }),
    // One named throttler per endpoint; each handler skips the other one.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => [
        {
          name: 'login',
          limit: config.get('AUTH_LOGIN_LIMIT', { infer: true }),
          ttl: config.get('AUTH_LOGIN_WINDOW', { infer: true }) * 1000,
        },
        {
          name: 'register',
          limit: config.get('AUTH_REGISTER_LIMIT', { infer: true }),
          ttl: config.get('AUTH_REGISTER_WINDOW', { infer: true }) * 1000,
        },
      ],
    }),
  ],
  controllers: [AuthController],
  exports: [JwtModule],
  providers: [AuthService, AuthThrottlerGuard],
})
export class AuthModule {}
