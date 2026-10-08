import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { registerPayload } from './factories/auth.factory.js';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE users CASCADE');
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE users CASCADE');
    await app.close();
  });

  const server = () => app.getHttpServer();

  describe('POST /auth/register (AUTH-1..4, AUTH-6)', () => {
    it('creates the user and returns a session with the Me shape (AUTH-6)', async () => {
      const payload = registerPayload({ email: '  Laura@Example.com ' });

      const res = await request(server())
        .post('/api/v1/auth/register')
        .send(payload)
        .expect(201);

      const stored = await prisma.user.findUniqueOrThrow({
        where: { email: 'laura@example.com' },
      });
      expect(res.body).toEqual({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: 86400,
        user: {
          id: stored.id,
          email: 'laura@example.com',
          fullName: payload.fullName,
          phoneE164: payload.phoneE164,
          city: payload.city,
          avatarUrl: null,
          isVerified: false,
        },
      });
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
      expect(stored.passwordHash).not.toBe(payload.password);
      const claims = app
        .get(JwtService)
        .verify<{ sub: string; exp: number; iat: number }>(
          res.body.accessToken,
        );
      expect(claims.sub).toBe(stored.id);
      expect(claims.exp - claims.iat).toBe(86400);
    });

    it('returns 409 EMAIL_TAKEN when the email exists in a different letter case (AUTH-2)', async () => {
      await request(server())
        .post('/api/v1/auth/register')
        .send(registerPayload({ email: 'ana@x.com' }))
        .expect(201);

      const res = await request(server())
        .post('/api/v1/auth/register')
        .send(registerPayload({ email: 'Ana@X.com' }))
        .expect(409);

      expect(res.body).toMatchObject({
        statusCode: 409,
        code: 'EMAIL_TAKEN',
        details: null,
      });
      expect(await prisma.user.count()).toBe(1);
    });

    it('returns 409 EMAIL_TAKEN for two simultaneous sign-ups with the same email (AUTH-2)', async () => {
      const results = await Promise.all(
        [1, 2].map(() =>
          request(server())
            .post('/api/v1/auth/register')
            .send(registerPayload({ email: 'race@x.com' })),
        ),
      );

      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(results.find((r) => r.status === 409)?.body.code).toBe(
        'EMAIL_TAKEN',
      );
      expect(await prisma.user.count()).toBe(1);
    });

    it.each([8, 72])(
      'accepts a password of exactly %i characters (AUTH-3)',
      async (length) => {
        const res = await request(server())
          .post('/api/v1/auth/register')
          .send(registerPayload({ password: 'a'.repeat(length) }))
          .expect(201);

        expect(res.body.user.email).toBe('laura@example.com');
        expect(await prisma.user.count()).toBe(1);
      },
    );

    it('returns 400 VALIDATION_ERROR when the password is shorter than 8 characters (AUTH-3)', async () => {
      const res = await request(server())
        .post('/api/v1/auth/register')
        .send(registerPayload({ password: '1234567' }))
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toEqual([
        { field: 'password', message: expect.any(String) },
      ]);
      expect(await prisma.user.count()).toBe(0);
    });

    it('returns 400 VALIDATION_ERROR when the password is longer than 72 characters (AUTH-3)', async () => {
      const res = await request(server())
        .post('/api/v1/auth/register')
        .send(registerPayload({ password: 'a'.repeat(73) }))
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toEqual([
        { field: 'password', message: expect.any(String) },
      ]);
      expect(await prisma.user.count()).toBe(0);
    });

    it.each([
      ['shorter than 2 characters', 'L'],
      ['longer than 120 characters', 'L'.repeat(121)],
    ])(
      'returns 400 VALIDATION_ERROR when the full name is %s (AUTH-1)',
      async (_case, fullName) => {
        const res = await request(server())
          .post('/api/v1/auth/register')
          .send(registerPayload({ fullName }))
          .expect(400);

        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.details).toEqual([
          { field: 'fullName', message: expect.any(String) },
        ]);
        expect(await prisma.user.count()).toBe(0);
      },
    );

    it('returns 400 VALIDATION_ERROR when the email is not valid (AUTH-1)', async () => {
      const res = await request(server())
        .post('/api/v1/auth/register')
        .send(registerPayload({ email: 'laura-at-example.com' }))
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toEqual([
        { field: 'email', message: expect.any(String) },
      ]);
      expect(await prisma.user.count()).toBe(0);
    });

    it('returns 400 VALIDATION_ERROR when the phone is not E.164 (AUTH-4)', async () => {
      const res = await request(server())
        .post('/api/v1/auth/register')
        .send(registerPayload({ phoneE164: '5512345678' }))
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toEqual([
        { field: 'phoneE164', message: expect.any(String) },
      ]);
      expect(await prisma.user.count()).toBe(0);
    });

    it('returns 400 VALIDATION_ERROR when the city is not in the fixed list (AUTH-1)', async () => {
      const res = await request(server())
        .post('/api/v1/auth/register')
        .send(registerPayload({ city: 'MARS' }))
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toEqual([
        { field: 'city', message: expect.any(String) },
      ]);
      expect(await prisma.user.count()).toBe(0);
    });
  });

  describe('POST /auth/login (AUTH-5, AUTH-6)', () => {
    it('returns a session whose token identifies the user (AUTH-6)', async () => {
      const payload = registerPayload({ email: 'login@x.com' });
      await request(server()).post('/api/v1/auth/register').send(payload);
      const stored = await prisma.user.findUniqueOrThrow({
        where: { email: 'login@x.com' },
      });

      const res = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: 'LOGIN@x.com', password: payload.password })
        .expect(200);

      expect(res.body).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 86400,
        user: { id: stored.id, email: 'login@x.com' },
      });
      expect(
        app.get(JwtService).verify<{ sub: string }>(res.body.accessToken).sub,
      ).toBe(stored.id);
    });

    it('answers unknown email and wrong password with the same 401 INVALID_CREDENTIALS (AUTH-5)', async () => {
      const payload = registerPayload({ email: 'known@x.com' });
      await request(server()).post('/api/v1/auth/register').send(payload);

      const unknownEmail = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@x.com', password: payload.password })
        .expect(401);
      const wrongPassword = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: 'known@x.com', password: 'not-the-password' })
        .expect(401);

      expect(unknownEmail.body).toEqual({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Incorrect email or password',
        details: null,
      });
      expect(wrongPassword.body).toEqual(unknownEmail.body);
    });

    it('returns 400 VALIDATION_ERROR when the body is incomplete', async () => {
      const res = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: 'known@x.com' })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });
});
