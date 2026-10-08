import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';

const FRONTEND = 'https://re-nest-frontend.vercel.app';

describe('CORS', () => {
  let app: INestApplication<App>;
  let previous: string | undefined;

  beforeAll(async () => {
    previous = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = `${FRONTEND}/`;
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previous === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previous;
  });

  it('allows the frontend origin', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', FRONTEND)
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe(FRONTEND);
  });

  it('answers the preflight of the frontend origin', async () => {
    const res = await request(app.getHttpServer())
      .options('/api/v1/auth/login')
      .set('Origin', FRONTEND)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBe(FRONTEND);
  });

  it('does not allow any other origin', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example.com')
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
