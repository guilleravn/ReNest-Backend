import { vi } from 'vitest';

// AppModule validates the env when it is imported, so these must be set first.
vi.hoisted(() => {
  process.env.AUTH_LOGIN_LIMIT = '2';
  process.env.TRUST_PROXY_HOPS = '1';
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';

describe('Rate limit behind a reverse proxy (AUTH-9)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const loginFrom = (clientIp: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', clientIp)
      .send({ email: 'nobody@example.com', password: 'wrong-password' });

  it('counts each client IP from X-Forwarded-For separately (AUTH-9)', async () => {
    await loginFrom('203.0.113.1').expect(401);
    await loginFrom('203.0.113.1').expect(401);
    await loginFrom('203.0.113.1').expect(429);

    await loginFrom('203.0.113.2').expect(401);
  });

  it('ignores an IP the client forges before the proxy hop (AUTH-9)', async () => {
    // The proxy appends the real client IP last; the forged one comes first.
    await loginFrom('198.51.100.9, 203.0.113.1').expect(401);
    await loginFrom('198.51.100.10, 203.0.113.1').expect(401);
    await loginFrom('198.51.100.11, 203.0.113.1').expect(429);
  });
});
