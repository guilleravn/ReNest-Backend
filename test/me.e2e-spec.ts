import {
  Controller,
  Get,
  INestApplication,
  Module,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { AuthModule } from './../src/auth/auth.module.js';
import { CurrentUser } from './../src/auth/current-user.decorator.js';
import { OptionalJwtAuthGuard } from './../src/auth/jwt-auth.guard.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { signUp } from './factories/auth.factory.js';

@Controller('test-optional')
class OptionalProbeController {
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  probe(@CurrentUser() userId: string | undefined) {
    return { userId: userId ?? null };
  }
}

@Module({ imports: [AuthModule], controllers: [OptionalProbeController] })
class OptionalProbeModule {}

describe('Session guard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, OptionalProbeModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE users CASCADE');
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE users CASCADE');
    await app.close();
  });

  const server = () => app.getHttpServer();

  const unauthorized = {
    statusCode: 401,
    code: 'UNAUTHORIZED',
    message: expect.any(String),
    details: null,
  };

  describe('GET /me (AUTH-6)', () => {
    it('returns 200 with the Me shape for a valid token', async () => {
      const { token, user } = await signUp(server());

      const res = await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual(user);
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('returns 401 UNAUTHORIZED without a token', async () => {
      const res = await request(server()).get('/api/v1/me').expect(401);

      expect(res.body).toEqual(unauthorized);
    });

    it('returns 401 UNAUTHORIZED with a malformed token', async () => {
      const res = await request(server())
        .get('/api/v1/me')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);

      expect(res.body).toEqual(unauthorized);
    });

    it('returns 401 UNAUTHORIZED when the scheme is not Bearer', async () => {
      const { token } = await signUp(server());

      const res = await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Basic ${token}`)
        .expect(401);

      expect(res.body).toEqual(unauthorized);
    });

    it('returns 401 UNAUTHORIZED with an expired token (AUTH-6)', async () => {
      const { user } = await signUp(server());
      const expired = await jwt.signAsync({ sub: user.id }, { expiresIn: -60 });

      const res = await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);

      expect(res.body).toEqual(unauthorized);
    });

    it('returns 401 UNAUTHORIZED when the user no longer exists', async () => {
      const { token } = await signUp(server());
      await prisma.$executeRawUnsafe('TRUNCATE users CASCADE');

      const res = await request(server())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(res.body).toEqual(unauthorized);
    });
  });

  describe('optional authentication', () => {
    it('treats a request without a token as anonymous', async () => {
      const res = await request(server())
        .get('/api/v1/test-optional')
        .expect(200);

      expect(res.body).toEqual({ userId: null });
    });

    it('treats an invalid token as anonymous', async () => {
      const res = await request(server())
        .get('/api/v1/test-optional')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(200);

      expect(res.body).toEqual({ userId: null });
    });

    it('treats an expired token as anonymous (AUTH-6)', async () => {
      const expired = await jwt.signAsync(
        { sub: 'someone' },
        { expiresIn: -60 },
      );

      const res = await request(server())
        .get('/api/v1/test-optional')
        .set('Authorization', `Bearer ${expired}`)
        .expect(200);

      expect(res.body).toEqual({ userId: null });
    });

    it('identifies the user when the token is valid', async () => {
      const { token, user } = await signUp(server());

      const res = await request(server())
        .get('/api/v1/test-optional')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ userId: user.id });
    });
  });
});
