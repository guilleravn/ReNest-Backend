import { vi } from 'vitest';

// AppModule validates the env when it is imported, so the limits must be set
// before the imports below run.
const { LOGIN_LIMIT, REGISTER_LIMIT } = vi.hoisted(() => {
  const limits = { LOGIN_LIMIT: 3, REGISTER_LIMIT: 2 };
  process.env.AUTH_LOGIN_LIMIT = String(limits.LOGIN_LIMIT);
  process.env.AUTH_REGISTER_LIMIT = String(limits.REGISTER_LIMIT);
  return limits;
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { registerPayload, signUp } from './factories/auth.factory.js';

describe('Auth rate limiting (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Each test gets a fresh app, so the in-memory counters start from zero.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE users CASCADE');
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE users CASCADE');
    await app.close();
  });

  const server = () => app.getHttpServer();
  const login = (password: string) =>
    request(server())
      .post('/api/v1/auth/login')
      .send({ email: 'laura@example.com', password });

  describe('POST /auth/login (brute force, AUTH-9)', () => {
    it('allows attempts up to the limit, then returns 429 RATE_LIMITED with Retry-After (AUTH-9)', async () => {
      for (let i = 0; i < LOGIN_LIMIT; i++) {
        await login('wrong-password').expect(401);
      }

      const res = await login('wrong-password').expect(429);

      expect(res.body).toEqual({
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: expect.any(String),
        details: null,
      });
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('keeps rejecting a correct password once the limit is reached (AUTH-9)', async () => {
      await signUp(server());
      for (let i = 0; i < LOGIN_LIMIT; i++) {
        await login('wrong-password').expect(401);
      }

      await login('correct-horse').expect(429);
    });
  });

  describe('POST /auth/register (AUTH-9)', () => {
    it('returns 429 RATE_LIMITED after the limit and creates no extra user (AUTH-9)', async () => {
      for (let i = 0; i < REGISTER_LIMIT; i++) {
        await request(server())
          .post('/api/v1/auth/register')
          .send(registerPayload({ email: `user${i}@example.com` }))
          .expect(201);
      }

      const res = await request(server())
        .post('/api/v1/auth/register')
        .send(registerPayload({ email: 'extra@example.com' }))
        .expect(429);

      expect(res.body.code).toBe('RATE_LIMITED');
      expect(await prisma.user.count()).toBe(REGISTER_LIMIT);
    });

    it('counts register attempts apart from login attempts (AUTH-9)', async () => {
      for (let i = 0; i < LOGIN_LIMIT; i++) {
        await login('wrong-password').expect(401);
      }

      await request(server())
        .post('/api/v1/auth/register')
        .send(registerPayload())
        .expect(201);
    });
  });

  describe('other endpoints (AUTH-9)', () => {
    it('does not limit GET /me or GET /health (AUTH-9)', async () => {
      const { token } = await signUp(server());

      for (let i = 0; i < LOGIN_LIMIT + 2; i++) {
        await request(server())
          .get('/api/v1/me')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        await request(server()).get('/health').expect(200);
      }
    });
  });
});
