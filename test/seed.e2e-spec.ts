import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DEMO_PASSWORD } from '../prisma/seed/data.js';
import { seed } from '../prisma/seed/seed.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { StorageService } from './../src/storage/storage.service.js';

// The demo seed itself is under test here; other suites never rely on it.
describe('Demo seed (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let storage: StorageService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE users, categories CASCADE');
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE users, categories CASCADE');
    await app.close();
  });

  it('creates the fixed category list (BRW-3)', async () => {
    await seed(prisma, storage);

    const categories = await prisma.category.findMany({
      select: { name: true, slug: true },
      orderBy: { name: 'asc' },
    });
    expect(categories).toEqual([
      { name: 'Electrónica', slug: 'electronica' },
      { name: 'Hogar', slug: 'hogar' },
      { name: 'Muebles', slug: 'muebles' },
    ]);
  });

  it('creates one verified seller, one unverified seller and two buyers (GEN-8)', async () => {
    await seed(prisma, storage);

    const users = await prisma.user.findMany({
      select: { email: true, isVerified: true },
      orderBy: { email: 'asc' },
    });
    expect(users).toEqual([
      { email: 'comprador1@renest.app', isVerified: false },
      { email: 'comprador2@renest.app', isVerified: false },
      { email: 'vendedor@renest.app', isVerified: false },
      { email: 'vendedora.verificada@renest.app', isVerified: true },
    ]);
  });

  it('lets every demo user log in with the documented password', async () => {
    await seed(prisma, storage);
    const users = await prisma.user.findMany({ select: { email: true } });

    expect(users).toHaveLength(4);
    for (const { email } of users) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: DEMO_PASSWORD })
        .expect(200);
      expect(res.body.user).toMatchObject({ email });
    }
  });

  it('changes nothing when run a second time', async () => {
    await seed(prisma, storage);
    const before = await snapshot(prisma);

    await seed(prisma, storage);

    expect(await snapshot(prisma)).toEqual(before);
  });
});

async function snapshot(prisma: PrismaService) {
  return {
    categories: await prisma.category.findMany({ orderBy: { id: 'asc' } }),
    users: await prisma.user.findMany({ orderBy: { id: 'asc' } }),
  };
}
