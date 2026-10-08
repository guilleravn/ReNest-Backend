import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('GET /categories (BRW-3, GEN-5)', () => {
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
    await prisma.$executeRawUnsafe('TRUNCATE users, categories CASCADE');
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE users, categories CASCADE');
    await app.close();
  });

  it('lists the categories sorted by name without a token (BRW-3, GEN-5)', async () => {
    // Inserted out of order so the test proves the sort.
    for (const [name, slug] of [
      ['Muebles', 'muebles'],
      ['Electrónica', 'electronica'],
      ['Hogar', 'hogar'],
    ]) {
      await prisma.category.create({ data: { name, slug } });
    }

    const res = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .expect(200);

    expect(res.body).toEqual([
      { id: expect.any(String), name: 'Electrónica', slug: 'electronica' },
      { id: expect.any(String), name: 'Hogar', slug: 'hogar' },
      { id: expect.any(String), name: 'Muebles', slug: 'muebles' },
    ]);
  });

  it('returns an empty array when there are no categories', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .expect(200);

    expect(res.body).toEqual([]);
  });
});
